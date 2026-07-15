from pathlib import Path
from threading import Event

import pytest
from PIL import Image

from models import UpscaleRequest
from service.image_upscaling import process_upscale_batch


class FakeContext:
    job_id = "upscale-job"

    def __init__(self):
        self.cancelled = Event()
        self.updates = []

    def raise_if_cancelled(self):
        assert not self.cancelled.is_set()

    async def progress(self, current, total, message, manifest_path=None):
        self.updates.append((current, total, message, manifest_path))


class IdentityUpscaler:
    backend_name = "spandrel"
    scale = 1

    def upscale_image(self, image, _use_tiling, _cancelled):
        return image


@pytest.mark.asyncio
async def test_upscale_batch_writes_output_and_terminal_progress(tmp_path: Path):
    source = tmp_path / "input"
    output = tmp_path / "output"
    source.mkdir()
    Image.new("RGB", (2, 2), "blue").save(source / "image.png")
    context = FakeContext()
    request = UpscaleRequest(
        upscale_model_path=str(tmp_path / "unused.safetensors"),
        load_path=str(source),
        save_path=str(output),
        use_tiling=False,
    )

    manifest = await process_upscale_batch(IdentityUpscaler(), request, context)

    assert (output / "image.png").is_file()
    assert manifest.is_file()
    assert context.updates[-1][0:2] == (1, 1)
