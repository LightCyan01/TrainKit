from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image
from tiler import Merger, Tiler

from core.exceptions import JobCancelledError, ModelLoadError
from service.image_upscaling import process_upscale_batch


class NCNNUpscaleService:
    backend_name = "ncnn"

    def __init__(
        self,
        model_param_path: Path,
        model_bin_path: Path | None,
        input_blob: str,
        output_blob: str,
        scale: int,
        use_vulkan: bool,
        tile_size: int = 512,
        tile_overlap: int = 16,
    ):
        self.model_path = model_param_path.resolve()
        self.model_bin_path = (
            model_bin_path.resolve() if model_bin_path else self.model_path.with_suffix(".bin")
        )
        self.input_blob = input_blob
        self.output_blob = output_blob
        self.scale = scale
        self.use_vulkan = use_vulkan
        self.tile_size = tile_size
        self.overlap = tile_overlap
        self.net = None
        self._load()

    def _load(self):
        if self.model_path.suffix.casefold() != ".param" or not self.model_path.is_file():
            raise ModelLoadError("NCNN graph must be an existing .param file")
        if not self.model_bin_path.is_file():
            raise ModelLoadError(f"NCNN weights not found: {self.model_bin_path}")
        try:
            import ncnn

            self.net = ncnn.Net()
            self.net.opt.use_vulkan_compute = self.use_vulkan
            if self.net.load_param(str(self.model_path)) != 0:
                raise RuntimeError("load_param returned an error")
            if self.net.load_model(str(self.model_bin_path)) != 0:
                raise RuntimeError("load_model returned an error")
        except Exception as exc:
            raise ModelLoadError(f"Could not load NCNN model: {exc}") from exc

    @property
    def info(self) -> dict[str, str | int | bool]:
        return {
            "backend": self.backend_name,
            "scale": self.scale,
            "architecture": "NCNN",
            "name": self.model_path.name,
            "tiling": True,
            "vulkan": self.use_vulkan,
            "input_blob": self.input_blob,
            "output_blob": self.output_blob,
        }

    def _process_tile(self, image: Image.Image) -> Image.Image:
        import ncnn

        array = np.asarray(image, dtype=np.float32) / 255.0
        chw = np.ascontiguousarray(array.transpose(2, 0, 1))
        # The Python binding can wrap NumPy memory without taking ownership.
        # Clone before native inference so the extractor always owns stable storage.
        input_mat = ncnn.Mat(chw).clone()
        extractor = self.net.create_extractor()
        if extractor.input(self.input_blob, input_mat) != 0:
            raise RuntimeError(f"NCNN input blob not found: {self.input_blob}")
        result, output = extractor.extract(self.output_blob)
        if result != 0:
            raise RuntimeError(f"NCNN output blob not found: {self.output_blob}")
        output_array = np.asarray(output, dtype=np.float32)
        if output_array.ndim == 3 and output_array.shape[0] in {1, 3, 4}:
            output_array = output_array.transpose(1, 2, 0)
        if output_array.ndim == 2:
            output_array = np.repeat(output_array[:, :, None], 3, axis=2)
        output_array = output_array[:, :, :3]
        if output_array.max(initial=0) <= 1.5:
            output_array *= 255.0
        return Image.fromarray(np.clip(output_array, 0, 255).astype(np.uint8), mode="RGB")

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
            merger.add(
                tile_id,
                np.asarray(self._process_tile(Image.fromarray(tile.astype(np.uint8)))),
            )
        return Image.fromarray(
            np.clip(merger.merge(unpad=True), 0, 255).astype(np.uint8), mode="RGB"
        )

    def upscale_image(self, image: Image.Image, use_tiling: bool, cancelled) -> Image.Image:
        if use_tiling:
            return self._upscale_with_tiler(image, cancelled)
        return self._process_tile(image)

    async def process(self, request, context):
        return await process_upscale_batch(self, request, context)

    def cleanup(self):
        if self.net is not None:
            try:
                self.net.clear()
            except Exception:
                pass
        self.net = None
