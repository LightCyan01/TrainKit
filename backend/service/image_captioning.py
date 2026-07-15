from __future__ import annotations

import asyncio
from pathlib import Path

from transformers import GenerationConfig

from core.exceptions import JobCancelledError, ProcessingError
from core.jobs import JobContext
from models import CaptionRequest
from service.caption_adapters import CaptionAdapter, create_caption_adapter
from service.manifest import (
    BatchManifest,
    atomic_write_text,
    build_manifest,
    manifest_path,
)
from utils.file_util import list_images, load_rgb_image


class ImageCaptioningService:
    def __init__(
        self,
        model: Path,
        adapter: str = "auto",
        max_new_tokens: int = 256,
        temperature: float = 0.6,
        top_p: float = 0.9,
    ):
        self.model_path = model.resolve()
        self.adapter_name = adapter
        self.generation_config = GenerationConfig(
            max_new_tokens=max_new_tokens,
            do_sample=temperature > 0,
            temperature=temperature,
            top_p=top_p,
        )
        self.adapter: CaptionAdapter = create_caption_adapter(
            self.model_path, adapter, self.generation_config
        )

    @property
    def loaded(self) -> bool:
        return self.adapter.loaded

    async def load(self):
        if not self.loaded:
            await asyncio.to_thread(self.adapter.load)

    async def process(self, request: CaptionRequest, context: JobContext) -> Path:
        load_path = Path(request.load_path).resolve()
        save_path = Path(request.save_path).resolve()
        if request.resume_manifest_path:
            output_manifest = Path(request.resume_manifest_path).resolve()
            manifest = BatchManifest.load(output_manifest, expected_operation="caption")
            manifest.validate_scope(load_path, save_path)
            manifest.validate_destination_suffixes({".txt"})
            manifest.preflight_resume(request.collision_policy)
        else:
            manifest = build_manifest(
                job_id=context.job_id,
                operation="caption",
                load_path=load_path,
                save_path=save_path,
                sources=list_images(load_path),
                destination_for=lambda source, _index: save_path / f"{source.stem}.txt",
                collision_policy=request.collision_policy,
            )
            output_manifest = manifest_path(save_path, context.job_id)
        manifest.save(output_manifest)
        total = len(manifest.items)
        completed = sum(item.status in {"completed", "skipped"} for item in manifest.items)
        await context.progress(completed, total, "Caption manifest ready", output_manifest)
        if request.dry_run:
            return output_manifest
        await self.load()

        failures = 0
        for item in manifest.items:
            if item.status in {"completed", "skipped"}:
                continue
            context.raise_if_cancelled()
            try:
                image = await asyncio.to_thread(load_rgb_image, Path(item.source))
                caption = await asyncio.to_thread(
                    self.adapter.caption, image, request.prompt, context.cancelled
                )
                await asyncio.to_thread(atomic_write_text, Path(item.destination), caption)
                item.status = "completed"
                item.error = None
            except JobCancelledError:
                raise
            except Exception as exc:
                item.status = "failed"
                item.error = str(exc)
                failures += 1
            completed += 1
            manifest.save(output_manifest)
            await context.progress(
                completed, total, f"Captioned {Path(item.source).name}", output_manifest
            )
        if failures:
            raise ProcessingError(f"Captioning failed for {failures} item(s); see the manifest")
        return output_manifest

    def cleanup(self):
        self.adapter.cleanup()
