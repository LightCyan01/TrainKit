from __future__ import annotations

import asyncio
import gc
from pathlib import Path

import numpy as np
import torch
import torchvision.transforms as transforms
from PIL import Image
from spandrel import ModelLoader
from tiler import Merger, Tiler

from config.image_formats import SUPPORTED_OUTPUT_FORMATS
from core.exceptions import InvalidPathError, JobCancelledError, ModelLoadError, ProcessingError
from core.jobs import JobContext
from models import UpscaleRequest
from service.manifest import BatchManifest, build_manifest, manifest_path
from utils.file_util import atomic_save_image, list_images, load_rgb_image


class ImageUpscaleService:
    backend_name = "spandrel"

    def __init__(
        self,
        device: torch.device,
        model_path: Path,
        tile_size: int = 512,
        tile_overlap: int = 16,
    ):
        self.model_path = model_path.resolve()
        self.device = device
        self.tile_size = tile_size
        self.overlap = tile_overlap
        self.descriptor = None
        self.scale = 1
        self._load()

    def _load(self):
        if self.model_path.suffix.casefold() != ".safetensors":
            raise ModelLoadError(
                "Spandrel models must use .safetensors. "
                "Legacy pickle checkpoints are disabled for safety."
            )
        try:
            descriptor = ModelLoader().load_from_file(self.model_path)
            if not callable(descriptor) or not hasattr(descriptor, "scale"):
                raise TypeError("Loaded object is not an image model descriptor")
            self.descriptor = descriptor.to(self.device).eval()
            self.scale = int(descriptor.scale)
        except Exception as exc:
            raise ModelLoadError(f"Could not load Spandrel model: {exc}") from exc

    @property
    def info(self) -> dict[str, str | int | bool]:
        architecture = getattr(getattr(self.descriptor, "architecture", None), "name", "Unknown")
        return {
            "backend": self.backend_name,
            "scale": self.scale,
            "architecture": str(architecture),
            "name": self.model_path.name,
            "tiling": bool(getattr(self.descriptor, "tiling", True)),
        }

    def _process_tile(self, tile_pil: Image.Image) -> Image.Image:
        tile_tensor = transforms.ToTensor()(tile_pil).unsqueeze(0).to(self.device)
        with torch.inference_mode():
            result = self.descriptor(tile_tensor)
        result = torch.clamp(result, 0, 1)
        return transforms.ToPILImage()(result.cpu().squeeze(0))

    def _upscale_with_tiler(self, image: Image.Image, cancelled) -> Image.Image:
        image_array = np.asarray(image)
        tiler = Tiler(
            data_shape=image_array.shape,
            tile_shape=(self.tile_size, self.tile_size, 3),
            channel_dimension=2,
            overlap=self.overlap,
        )
        output_tiler = Tiler(
            data_shape=(
                image_array.shape[0] * self.scale,
                image_array.shape[1] * self.scale,
                3,
            ),
            tile_shape=(self.tile_size * self.scale, self.tile_size * self.scale, 3),
            channel_dimension=2,
            overlap=self.overlap * self.scale,
        )
        merger = Merger(output_tiler, window="hamming")
        for tile_id, tile in tiler(image_array):
            if cancelled.is_set():
                raise JobCancelledError()
            upscaled = self._process_tile(Image.fromarray(tile.astype(np.uint8)))
            merger.add(tile_id, np.asarray(upscaled))
        result = np.clip(merger.merge(unpad=True), 0, 255).astype(np.uint8)
        return Image.fromarray(result)

    def _direct_upscale(self, image: Image.Image) -> Image.Image:
        return self._process_tile(image)

    async def process(self, request: UpscaleRequest, context: JobContext) -> Path | None:
        return await process_upscale_batch(self, request, context)

    def upscale_image(self, image: Image.Image, use_tiling: bool, cancelled) -> Image.Image:
        if use_tiling:
            return self._upscale_with_tiler(image, cancelled)
        return self._direct_upscale(image)

    def cleanup(self):
        if self.descriptor is not None:
            try:
                self.descriptor.to("cpu")
            except Exception:
                pass
        self.descriptor = None
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()


async def prepare_upscale_manifest(
    request: UpscaleRequest, context: JobContext, service=None
) -> tuple[BatchManifest, Path | None, dict[str, str]]:
    load_path = Path(request.load_path).resolve()
    save_path = Path(request.save_path).resolve()
    format_info = SUPPORTED_OUTPUT_FORMATS[request.format.casefold()]
    if request.resume_manifest_path:
        output_manifest = Path(request.resume_manifest_path).resolve()
        manifest = BatchManifest.load(output_manifest, expected_operation="upscale")
        manifest.validate_scope(load_path, save_path)
        manifest.validate_destination_suffixes({format_info["extension"]})
        manifest.preflight_resume(request.collision_policy)
        stored_formats = {
            str(item.metadata["format"]) for item in manifest.items if "format" in item.metadata
        }
        stored_backends = {
            str(item.metadata["backend"]) for item in manifest.items if "backend" in item.metadata
        }
        if stored_formats and stored_formats != {request.format}:
            raise InvalidPathError("Resume output format does not match the manifest")
        if stored_backends and stored_backends != {request.backend}:
            raise InvalidPathError("Resume upscale backend does not match the manifest")
        if service is not None:
            stored_scales = {
                int(item.metadata["scale"]) for item in manifest.items if "scale" in item.metadata
            }
            if stored_scales and stored_scales != {service.scale}:
                raise InvalidPathError("Resume model scale does not match the manifest")
    else:
        manifest = build_manifest(
            job_id=context.job_id,
            operation="upscale",
            load_path=load_path,
            save_path=save_path,
            sources=list_images(load_path),
            destination_for=lambda source, _index: (
                save_path / f"{source.stem}{format_info['extension']}"
            ),
            collision_policy=request.collision_policy,
        )
        for item in manifest.items:
            item.metadata.update({"backend": request.backend, "format": request.format})
            if service is not None:
                item.metadata["scale"] = service.scale
            elif request.backend == "ncnn":
                item.metadata["scale"] = request.ncnn_scale
        output_manifest = (
            manifest_path(save_path, context.job_id)
            if request.save_manifest or request.dry_run
            else None
        )
    if output_manifest is not None:
        manifest.save(output_manifest)
    total = len(manifest.items)
    completed = sum(item.status in {"completed", "skipped"} for item in manifest.items)
    message = "Upscale manifest ready" if output_manifest is not None else "Upscale plan ready"
    await context.progress(completed, total, message, output_manifest)
    return manifest, output_manifest, format_info


async def process_upscale_batch(
    service, request: UpscaleRequest, context: JobContext
) -> Path | None:
    manifest, output_manifest, format_info = await prepare_upscale_manifest(
        request, context, service
    )
    if request.dry_run:
        return output_manifest

    total = len(manifest.items)
    completed = sum(item.status in {"completed", "skipped"} for item in manifest.items)
    failures = 0
    first_error: str | None = None
    for item in manifest.items:
        if item.status in {"completed", "skipped"}:
            continue
        context.raise_if_cancelled()
        try:
            image = await asyncio.to_thread(load_rgb_image, Path(item.source))
            output = await asyncio.to_thread(
                service.upscale_image, image, request.use_tiling, context.cancelled
            )
            await asyncio.to_thread(
                atomic_save_image,
                output,
                Path(item.destination),
                format_info["pil_format"],
            )
            item.status = "completed"
            item.error = None
        except JobCancelledError:
            raise
        except Exception as exc:
            item.status = "failed"
            item.error = str(exc)
            failures += 1
            first_error = first_error or f"{Path(item.source).name}: {str(exc)[:500]}"
        completed += 1
        if output_manifest is not None:
            manifest.save(output_manifest)
        await context.progress(
            completed, total, f"Upscaled {Path(item.source).name}", output_manifest
        )
    if failures:
        detail = f": {first_error}" if first_error else ""
        suffix = "; see the manifest" if output_manifest is not None else ""
        raise ProcessingError(f"Upscaling failed for {failures} item(s){detail}{suffix}")
    return output_manifest
