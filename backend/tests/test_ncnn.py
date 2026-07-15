from pathlib import Path

import pytest
from PIL import Image

from core.exceptions import ModelLoadError
from service.ncnn_upscaling import NCNNUpscaleService


def test_ncnn_python_binding_runs_minimal_image_graph(tmp_path: Path):
    param = tmp_path / "identity.param"
    weights = tmp_path / "identity.bin"
    param.write_text(
        "7767517\n2 2\nInput data 0 1 data\nReLU relu_0 1 1 data result\n",
        encoding="utf-8",
    )
    weights.write_bytes(b"")
    service = NCNNUpscaleService(
        model_param_path=param,
        model_bin_path=weights,
        input_blob=None,
        output_blob=None,
        scale=1,
        use_vulkan=False,
    )
    image = Image.new("RGB", (2, 2), (32, 64, 128))

    output = service._process_tile(image)

    assert service.input_blob == "data"
    assert service.output_blob == "result"
    assert output.size == image.size
    assert output.getpixel((0, 0)) == (32, 64, 128)
    service.cleanup()


def test_ncnn_blob_override_reports_discovered_names(tmp_path: Path):
    param = tmp_path / "identity.param"
    weights = tmp_path / "identity.bin"
    param.write_text(
        "7767517\n2 2\nInput data 0 1 data\nReLU relu_0 1 1 data result\n",
        encoding="utf-8",
    )
    weights.write_bytes(b"")

    with pytest.raises(ModelLoadError, match="Available: data"):
        NCNNUpscaleService(
            model_param_path=param,
            model_bin_path=weights,
            input_blob="in0",
            output_blob=None,
            scale=1,
            use_vulkan=False,
        )
