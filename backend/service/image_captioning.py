from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from pathlib import Path
from threading import Event

from PIL import Image
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

    async def process(self, request: CaptionRequest, context: JobContext) -> Path | None:
        async def caption(image: Image.Image, prompt: str, cancelled: Event) -> str:
            return await asyncio.to_thread(self.adapter.caption, image, prompt, cancelled)

        return await process_caption_batch(request, context, caption, prepare=self.load)

    def cleanup(self):
        self.adapter.cleanup()


async def process_caption_batch(
    request: CaptionRequest,
    context: JobContext,
    caption_image: Callable[[Image.Image, str, Event], Awaitable[str]],
    *,
    prepare: Callable[[], Awaitable[None]] | None = None,
) -> Path | None:
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
        output_manifest = (
            manifest_path(save_path, context.job_id)
            if request.save_manifest or request.dry_run
            else None
        )
    if output_manifest is not None:
        manifest.save(output_manifest)
    total = len(manifest.items)
    completed = sum(item.status in {"completed", "skipped"} for item in manifest.items)
    message = "Caption manifest ready" if output_manifest is not None else "Caption plan ready"
    await context.progress(completed, total, message, output_manifest)
    if request.dry_run or completed == total:
        return output_manifest
    context.raise_if_cancelled()
    if prepare is not None:
        await prepare()

    failures = 0
    first_error: str | None = None
    for item in manifest.items:
        if item.status in {"completed", "skipped"}:
            continue
        context.raise_if_cancelled()
        try:
            image = await asyncio.to_thread(load_rgb_image, Path(item.source))
            try:
                caption = await caption_image(image, request.prompt, context.cancelled)
            except JobCancelledError:
                raise
            except Exception as exc:
                if request.provider != "local" and not isinstance(exc, ProcessingError):
                    raise ProcessingError(
                        "Cloud captioning failed; no caption was written"
                    ) from None
                raise
            finally:
                image.close()
            context.raise_if_cancelled()
            try:
                await asyncio.to_thread(atomic_write_text, Path(item.destination), caption)
            except OSError as exc:
                raise ProcessingError(
                    f"Could not save caption {Path(item.destination).name}: {exc}"
                ) from exc
            item.status = "completed"
            item.error = None
        except JobCancelledError:
            raise
        except Exception as exc:
            item.status = "failed"
            item.error = str(exc)
            if request.provider != "local":
                if output_manifest is not None:
                    manifest.save(output_manifest)
                raise ProcessingError(item.error) from None
            failures += 1
            first_error = first_error or f"{Path(item.source).name}: {str(exc)[:500]}"
        completed += 1
        if output_manifest is not None:
            manifest.save(output_manifest)
        await context.progress(
            completed,
            total,
            f"Captioned {Path(item.source).name}",
            output_manifest,
            preview_source=item.source if item.status == "completed" else None,
            preview_output=item.destination if item.status == "completed" else None,
        )
    if failures:
        detail = f": {first_error}" if first_error else ""
        suffix = "; see the manifest" if output_manifest is not None else ""
        raise ProcessingError(f"Captioning failed for {failures} item(s){detail}{suffix}")
    return output_manifest
