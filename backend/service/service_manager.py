from __future__ import annotations

import gc
from pathlib import Path
from typing import Any


class ServiceManager:
    _instance: ServiceManager | None = None

    def __init__(self):
        self._caption_service: Any = None
        self._caption_key: tuple[str, str, int] | None = None
        self._tag_service: Any = None
        self._tag_model_path: Path | None = None
        self._upscale_service: Any = None
        self._upscale_key: tuple[Any, ...] | None = None
        self._device: Any = None

    @classmethod
    def get_instance(cls) -> ServiceManager:
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def get_caption_service(
        self, model_path: Path, adapter: str = "auto", max_new_tokens: int = 256
    ):
        from service.image_captioning import ImageCaptioningService

        key = (str(model_path.resolve()), adapter, max_new_tokens)
        if self._caption_service is None or self._caption_key != key:
            if self._caption_service is not None:
                self._caption_service.cleanup()
            self._caption_service = ImageCaptioningService(
                model=model_path,
                adapter=adapter,
                max_new_tokens=max_new_tokens,
            )
            self._caption_key = key
        return self._caption_service

    async def preload_caption_model(
        self, model_path: Path, adapter: str = "auto"
    ) -> dict[str, Any]:
        service = self.get_caption_service(model_path, adapter)
        await service.load()
        return {
            "status": "loaded",
            "model_path": str(model_path.resolve()),
            "adapter": service.adapter.name,
            **self.get_gpu_memory_usage(),
        }

    def is_caption_model_loaded(self, model_path: Path, adapter: str = "auto") -> bool:
        return bool(
            self._caption_service
            and self._caption_service.loaded
            and self._caption_service.model_path == model_path.resolve()
            and (adapter == "auto" or self._caption_service.adapter.name == adapter)
        )

    def unload_caption_model(self) -> dict[str, Any]:
        if self._caption_service is not None:
            self._caption_service.cleanup()
        self._caption_service = None
        self._caption_key = None
        return self.get_gpu_memory_usage()

    def get_tag_service(self, model_path: Path):
        from service.image_tagging import ImageTaggingService

        resolved = model_path.resolve()
        if self._tag_service is None or self._tag_model_path != resolved:
            if self._tag_service is not None:
                self._tag_service.cleanup()
            self._tag_service = ImageTaggingService(resolved)
            self._tag_model_path = resolved
        return self._tag_service

    def get_upscale_service(self, request):
        if request.backend == "ncnn":
            from service.ncnn_upscaling import NCNNUpscaleService

            key = (
                "ncnn",
                str(Path(request.upscale_model_path).resolve()),
                (
                    str(Path(request.ncnn_model_bin_path).resolve())
                    if request.ncnn_model_bin_path
                    else None
                ),
                request.ncnn_input_blob,
                request.ncnn_output_blob,
                request.ncnn_scale,
                request.ncnn_use_vulkan,
                request.tile_size,
                request.tile_overlap,
            )

            def factory():
                return NCNNUpscaleService(
                    model_param_path=Path(request.upscale_model_path),
                    model_bin_path=(
                        Path(request.ncnn_model_bin_path) if request.ncnn_model_bin_path else None
                    ),
                    input_blob=request.ncnn_input_blob,
                    output_blob=request.ncnn_output_blob,
                    scale=request.ncnn_scale,
                    use_vulkan=request.ncnn_use_vulkan,
                    tile_size=request.tile_size,
                    tile_overlap=request.tile_overlap,
                )
        else:
            from service.image_upscaling import ImageUpscaleService
            from utils.image_util import get_device

            if self._device is None:
                self._device = get_device()
            key = (
                "spandrel",
                str(Path(request.upscale_model_path).resolve()),
                request.tile_size,
                request.tile_overlap,
            )

            def factory():
                return ImageUpscaleService(
                    device=self._device,
                    model_path=Path(request.upscale_model_path),
                    tile_size=request.tile_size,
                    tile_overlap=request.tile_overlap,
                )

        if self._upscale_service is None or self._upscale_key != key:
            if self._upscale_service is not None:
                self._upscale_service.cleanup()
            self._upscale_service = factory()
            self._upscale_key = key
        return self._upscale_service

    def get_gpu_memory_usage(self) -> dict[str, float]:
        import torch

        if not torch.cuda.is_available():
            return {
                "gpu_memory_allocated_gb": 0,
                "gpu_memory_reserved_gb": 0,
                "gpu_memory_total_gb": 0,
            }
        return {
            "gpu_memory_allocated_gb": round(torch.cuda.memory_allocated() / 1024**3, 2),
            "gpu_memory_reserved_gb": round(torch.cuda.memory_reserved() / 1024**3, 2),
            "gpu_memory_total_gb": round(
                torch.cuda.get_device_properties(0).total_memory / 1024**3, 2
            ),
        }

    def cleanup(self):
        had_loaded_service = any(
            service is not None
            for service in (self._caption_service, self._tag_service, self._upscale_service)
        )
        for service in (self._caption_service, self._tag_service, self._upscale_service):
            if service is not None:
                service.cleanup()
        self._caption_service = None
        self._caption_key = None
        self._tag_service = None
        self._tag_model_path = None
        self._upscale_service = None
        self._upscale_key = None
        gc.collect()
        if had_loaded_service:
            import torch

            if torch.cuda.is_available():
                torch.cuda.empty_cache()

    @classmethod
    def reset(cls):
        if cls._instance is not None:
            cls._instance.cleanup()
        cls._instance = None
