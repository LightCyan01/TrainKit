import pytest
from pydantic import ValidationError

from models import UpscaleRequest


@pytest.mark.parametrize("overlap", [64, 65])
def test_tiled_upscale_rejects_overlap_at_least_tile_size(overlap):
    with pytest.raises(ValidationError, match="Tile overlap must be smaller than tile size"):
        UpscaleRequest(
            upscale_model_path="model.safetensors",
            load_path="input",
            save_path="output",
            tile_size=64,
            tile_overlap=overlap,
        )


def test_tiled_upscale_accepts_overlap_below_tile_size():
    request = UpscaleRequest(
        upscale_model_path="model.safetensors",
        load_path="input",
        save_path="output",
        tile_size=64,
        tile_overlap=63,
    )

    assert request.tile_overlap == 63


def test_untiled_upscale_does_not_require_overlap_smaller_than_tile_size():
    request = UpscaleRequest(
        upscale_model_path="model.safetensors",
        load_path="input",
        save_path="output",
        use_tiling=False,
        tile_size=64,
        tile_overlap=512,
    )

    assert request.tile_overlap == 512
