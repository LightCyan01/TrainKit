from pathlib import Path

from PIL import Image

from service.ncnn_upscaling import NCNNUpscaleService


def test_ncnn_python_binding_runs_minimal_image_graph(tmp_path: Path):
    param = tmp_path / "identity.param"
    weights = tmp_path / "identity.bin"
    param.write_text(
        "7767517\n2 2\nInput in0 0 1 in0\nReLU relu_0 1 1 in0 out0\n",
        encoding="utf-8",
    )
    weights.write_bytes(b"")
    service = NCNNUpscaleService(
        model_param_path=param,
        model_bin_path=weights,
        input_blob="in0",
        output_blob="out0",
        scale=1,
        use_vulkan=False,
    )
    image = Image.new("RGB", (2, 2), (32, 64, 128))

    output = service._process_tile(image)

    assert output.size == image.size
    assert output.getpixel((0, 0)) == (32, 64, 128)
    service.cleanup()
