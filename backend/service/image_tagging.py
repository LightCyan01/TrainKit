from __future__ import annotations

import asyncio
import gc
import os
from pathlib import Path
from typing import Any

import torch
from transformers import AutoImageProcessor, AutoModelForImageClassification

from core.exceptions import InvalidPathError, ModelLoadError, ProcessingError
from core.jobs import JobContext
from models import TagRequest
from service.manifest import (
    BatchManifest,
    atomic_write_json,
    atomic_write_text,
    build_manifest,
    manifest_path,
)
from utils.file_util import list_images, load_rgb_image


def _path_key(path: Path) -> str:
    return os.path.normcase(str(path.resolve()))


def _set_tag_destinations(manifest: BatchManifest, output: str, collision_policy: str):
    """Add paired tag outputs and preflight them as one atomic output set."""
    for item in manifest.items:
        item.metadata.setdefault("tag_output", output)

    if output != "both":
        return

    occupied = {_path_key(Path(item.destination)) for item in manifest.items}
    collisions: list[str] = []
    for item in manifest.items:
        primary = Path(item.destination)
        text_destination = primary.with_suffix(".txt")
        if item.status in {"completed", "skipped"}:
            item.metadata["text_destination"] = str(text_destination)
            occupied.add(_path_key(text_destination))
            continue

        text_key = _path_key(text_destination)
        planned_collision = text_key in occupied
        existing_collision = text_destination.exists()
        collision = planned_collision or existing_collision

        if collision and collision_policy == "rename":
            occupied.discard(_path_key(primary))
            counter = 1
            while True:
                candidate = primary.with_name(f"{primary.stem}_{counter}{primary.suffix}")
                candidate_text = candidate.with_suffix(".txt")
                candidate_key = _path_key(candidate)
                candidate_text_key = _path_key(candidate_text)
                if (
                    not candidate.exists()
                    and not candidate_text.exists()
                    and candidate_key not in occupied
                    and candidate_text_key not in occupied
                ):
                    primary = candidate
                    text_destination = candidate_text
                    text_key = candidate_text_key
                    item.destination = str(primary)
                    collision = False
                    break
                counter += 1

        if collision:
            if collision_policy == "skip":
                item.status = "skipped"
                item.error = "A paired tag destination already exists"
            elif collision_policy != "overwrite" or planned_collision:
                collisions.append(str(text_destination))

        occupied.add(_path_key(primary))
        occupied.add(text_key)
        item.metadata["text_destination"] = str(text_destination)

    if collisions:
        preview = ", ".join(collisions[:3])
        suffix = "..." if len(collisions) > 3 else ""
        raise InvalidPathError(f"Output collision detected: {preview}{suffix}")


class ImageTaggingService:
    def __init__(self, model_path: Path):
        self.model_path = model_path.resolve()
        self.model: Any = None
        self.processor: Any = None

    @property
    def loaded(self) -> bool:
        return self.model is not None and self.processor is not None

    def _load(self):
        if not self.model_path.is_dir() or not (self.model_path / "config.json").is_file():
            raise ModelLoadError(
                "Tag models must be local Hugging Face directories with config.json"
            )
        try:
            self.processor = AutoImageProcessor.from_pretrained(self.model_path)
            self.model = AutoModelForImageClassification.from_pretrained(
                self.model_path, dtype="auto"
            ).eval()
            if torch.cuda.is_available():
                self.model.to("cuda")
        except Exception as exc:
            raise ModelLoadError(f"Could not load tagging model: {exc}") from exc

    async def load(self):
        if not self.loaded:
            await asyncio.to_thread(self._load)

    def _tag(self, image, threshold: float, top_k: int) -> list[dict[str, float | str]]:
        inputs = self.processor(images=image, return_tensors="pt")
        inputs = {
            key: value.to(self.model.device) if hasattr(value, "to") else value
            for key, value in inputs.items()
        }
        with torch.inference_mode():
            logits = self.model(**inputs).logits[0]
        problem_type = getattr(self.model.config, "problem_type", None)
        if problem_type == "multi_label_classification":
            probabilities = torch.sigmoid(logits)
        else:
            probabilities = torch.softmax(logits, dim=-1)
        count = min(top_k, probabilities.numel())
        scores, indices = torch.topk(probabilities, count)
        labels = self.model.config.id2label
        tags = [
            {"tag": str(labels.get(int(index), int(index))), "score": round(float(score), 6)}
            for score, index in zip(scores.cpu(), indices.cpu(), strict=True)
            if float(score) >= threshold
        ]
        return tags

    async def process(self, request: TagRequest, context: JobContext) -> Path | None:
        load_path = Path(request.load_path).resolve()
        save_path = Path(request.save_path).resolve()
        if request.resume_manifest_path:
            output_manifest = Path(request.resume_manifest_path).resolve()
            manifest = BatchManifest.load(output_manifest, expected_operation="tag")
            manifest.validate_scope(load_path, save_path)
            manifest.validate_destination_suffixes(
                {".txt"} if request.output == "txt" else {".json"}
            )
            manifest.preflight_resume(request.collision_policy)
            stored_outputs = {
                str(item.metadata["tag_output"])
                for item in manifest.items
                if "tag_output" in item.metadata
            }
            if stored_outputs and stored_outputs != {request.output}:
                raise InvalidPathError("Resume tag output mode does not match the manifest")
            for item in manifest.items:
                item.metadata.setdefault("tag_output", request.output)
            _set_tag_destinations(manifest, request.output, request.collision_policy)
        else:
            output_suffix = ".tags.txt" if request.output == "txt" else ".tags.json"
            manifest = build_manifest(
                job_id=context.job_id,
                operation="tag",
                load_path=load_path,
                save_path=save_path,
                sources=list_images(load_path),
                destination_for=lambda source, _index: save_path / f"{source.stem}{output_suffix}",
                collision_policy=request.collision_policy,
            )
            _set_tag_destinations(manifest, request.output, request.collision_policy)
            output_manifest = (
                manifest_path(save_path, context.job_id)
                if request.save_manifest or request.dry_run
                else None
            )
        if output_manifest is not None:
            manifest.save(output_manifest)
        total = len(manifest.items)
        completed = sum(item.status in {"completed", "skipped"} for item in manifest.items)
        message = "Tag manifest ready" if output_manifest is not None else "Tag plan ready"
        await context.progress(completed, total, message, output_manifest)
        if request.dry_run:
            return output_manifest
        await self.load()

        failures = 0
        first_error: str | None = None
        for item in manifest.items:
            if item.status in {"completed", "skipped"}:
                continue
            context.raise_if_cancelled()
            try:
                image = await asyncio.to_thread(load_rgb_image, Path(item.source))
                tags = await asyncio.to_thread(self._tag, image, request.threshold, request.top_k)
                destination = Path(item.destination)
                tag_output = str(item.metadata.get("tag_output", request.output))
                if tag_output in {"json", "both"}:
                    await asyncio.to_thread(
                        atomic_write_json,
                        destination,
                        {"source": item.source, "tags": tags},
                    )
                if tag_output in {"txt", "both"}:
                    text_destination = (
                        Path(str(item.metadata["text_destination"]))
                        if tag_output == "both"
                        else destination
                    )
                    await asyncio.to_thread(
                        atomic_write_text,
                        text_destination,
                        ", ".join(str(tag["tag"]) for tag in tags),
                    )
                item.status = "completed"
                item.metadata["tag_count"] = len(tags)
            except Exception as exc:
                item.status = "failed"
                item.error = str(exc)
                failures += 1
                first_error = first_error or f"{Path(item.source).name}: {str(exc)[:500]}"
            completed += 1
            if output_manifest is not None:
                manifest.save(output_manifest)
            await context.progress(
                completed, total, f"Tagged {Path(item.source).name}", output_manifest
            )
        if failures:
            detail = f": {first_error}" if first_error else ""
            suffix = "; see the manifest" if output_manifest is not None else ""
            raise ProcessingError(f"Tagging failed for {failures} item(s){detail}{suffix}")
        return output_manifest

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
