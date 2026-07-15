from __future__ import annotations

import gc
from abc import ABC, abstractmethod
from pathlib import Path
from threading import Event
from typing import Any

import torch
from PIL import Image
from transformers import (
    AutoConfig,
    AutoProcessor,
    GenerationConfig,
    StoppingCriteria,
    StoppingCriteriaList,
)

from core.exceptions import JobCancelledError, ModelLoadError

SYSTEM_PROMPT = (
    "You are a professional image captioner for machine-learning datasets. "
    "Describe visible content accurately, including composition and relevant details, "
    "and follow the user's requested caption style."
)


class CancellationStoppingCriteria(StoppingCriteria):
    def __init__(self, cancelled: Event):
        self.cancelled = cancelled

    def __call__(self, input_ids, scores, **kwargs):
        del scores, kwargs
        return torch.full(
            (input_ids.shape[0],),
            self.cancelled.is_set(),
            dtype=torch.bool,
            device=input_ids.device,
        )


def _stopping(cancelled: Event | None):
    if cancelled is None:
        return None
    return StoppingCriteriaList([CancellationStoppingCriteria(cancelled)])


def _move_inputs(inputs: dict[str, Any], device: torch.device) -> dict[str, Any]:
    return {
        key: value.to(device) if hasattr(value, "to") else value for key, value in inputs.items()
    }


class CaptionAdapter(ABC):
    name = "base"

    def __init__(self, model_path: Path, generation_config: GenerationConfig):
        self.model_path = model_path
        self.generation_config = generation_config
        self.model: Any = None
        self.processor: Any = None

    @property
    def loaded(self) -> bool:
        return self.model is not None and self.processor is not None

    @abstractmethod
    def load(self):
        raise NotImplementedError

    @abstractmethod
    def caption(self, image: Image.Image, prompt: str, cancelled: Event | None = None) -> str:
        raise NotImplementedError

    def cleanup(self):
        if self.model is not None:
            try:
                self.model.to("cpu")
            except Exception:
                pass
        self.model = None
        self.processor = None
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()


class MultimodalChatAdapter(CaptionAdapter):
    name = "multimodal"

    def load(self):
        try:
            from transformers import AutoModelForImageTextToText

            self.processor = AutoProcessor.from_pretrained(self.model_path)
            self.model = AutoModelForImageTextToText.from_pretrained(
                self.model_path,
                dtype="auto",
                device_map="auto" if torch.cuda.is_available() else None,
            ).eval()
        except Exception as exc:
            raise ModelLoadError(f"Could not load multimodal model: {exc}") from exc

    def build_messages(self, prompt: str) -> list[dict[str, Any]]:
        return [
            {
                "role": "system",
                "content": [{"type": "text", "text": SYSTEM_PROMPT}],
            },
            {
                "role": "user",
                "content": [
                    {"type": "image"},
                    {"type": "text", "text": prompt},
                ],
            },
        ]

    def caption(self, image: Image.Image, prompt: str, cancelled: Event | None = None) -> str:
        messages = self.build_messages(prompt)
        formatted = self.processor.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=True
        )
        inputs = self.processor(text=[formatted], images=[image], return_tensors="pt")
        device = getattr(self.model, "device", torch.device("cpu"))
        inputs = _move_inputs(inputs, device)
        with torch.inference_mode():
            output = self.model.generate(
                **inputs,
                generation_config=self.generation_config,
                stopping_criteria=_stopping(cancelled),
            )
        if cancelled and cancelled.is_set():
            raise JobCancelledError()
        generated = output[0]
        if "input_ids" in inputs:
            generated = generated[inputs["input_ids"].shape[1] :]
        return self.processor.decode(
            generated, skip_special_tokens=True, clean_up_tokenization_spaces=False
        ).strip()


class BlipAdapter(CaptionAdapter):
    name = "blip"

    def load(self):
        try:
            from transformers import BlipForConditionalGeneration

            self.processor = AutoProcessor.from_pretrained(self.model_path)
            self.model = BlipForConditionalGeneration.from_pretrained(
                self.model_path,
                dtype="auto",
            ).eval()
            if torch.cuda.is_available():
                self.model.to("cuda")
        except Exception as exc:
            raise ModelLoadError(f"Could not load BLIP model: {exc}") from exc

    def caption(self, image: Image.Image, prompt: str, cancelled: Event | None = None) -> str:
        inputs = self.processor(images=image, text=prompt, return_tensors="pt")
        inputs = _move_inputs(inputs, self.model.device)
        with torch.inference_mode():
            output = self.model.generate(
                **inputs,
                generation_config=self.generation_config,
                stopping_criteria=_stopping(cancelled),
            )
        if cancelled and cancelled.is_set():
            raise JobCancelledError()
        return self.processor.decode(output[0], skip_special_tokens=True).strip()


class InstructBlipAdapter(BlipAdapter):
    name = "instructblip"

    def load(self):
        try:
            from transformers import InstructBlipForConditionalGeneration

            self.processor = AutoProcessor.from_pretrained(self.model_path)
            self.model = InstructBlipForConditionalGeneration.from_pretrained(
                self.model_path,
                dtype="auto",
            ).eval()
            if torch.cuda.is_available():
                self.model.to("cuda")
        except Exception as exc:
            raise ModelLoadError(f"Could not load InstructBLIP model: {exc}") from exc


def resolve_adapter_name(model_path: Path, requested: str) -> str:
    if requested != "auto":
        return requested
    try:
        model_type = AutoConfig.from_pretrained(model_path).model_type.casefold()
    except Exception as exc:
        raise ModelLoadError(f"Could not read model configuration: {exc}") from exc
    if model_type == "blip":
        return "blip"
    if model_type == "instructblip":
        return "instructblip"
    return "multimodal"


def create_caption_adapter(
    model_path: Path,
    requested: str,
    generation_config: GenerationConfig,
) -> CaptionAdapter:
    if not model_path.is_dir() or not (model_path / "config.json").is_file():
        raise ModelLoadError(
            "Caption models must be local Hugging Face directories with config.json"
        )
    resolved = resolve_adapter_name(model_path, requested)
    adapters: dict[str, type[CaptionAdapter]] = {
        "multimodal": MultimodalChatAdapter,
        "blip": BlipAdapter,
        "instructblip": InstructBlipAdapter,
    }
    try:
        return adapters[resolved](model_path, generation_config)
    except KeyError as exc:
        raise ModelLoadError(f"Unsupported caption adapter: {resolved}") from exc
