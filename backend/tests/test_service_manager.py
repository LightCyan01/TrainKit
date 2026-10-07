import sys
from pathlib import Path
from types import ModuleType

import pytest

from core.exceptions import ModelLoadError
from models import UpscaleRequest
from service.service_manager import ServiceManager


@pytest.mark.parametrize(
    "operation,module_name,class_name,service_attribute,key_attribute",
    [
        (
            "caption",
            "service.image_captioning",
            "ImageCaptioningService",
            "_caption_service",
            "_caption_key",
        ),
        (
            "tag",
            "service.image_tagging",
            "ImageTaggingService",
            "_tag_service",
            "_tag_model_path",
        ),
        (
            "spandrel",
            "service.image_upscaling",
            "ImageUpscaleService",
            "_upscale_service",
            "_upscale_key",
        ),
        (
            "ncnn",
            "service.ncnn_upscaling",
            "NCNNUpscaleService",
            "_upscale_service",
            "_upscale_key",
        ),
    ],
)
def test_failed_model_switch_discards_cleaned_service_and_reloads_previous_model(
    monkeypatch,
    tmp_path: Path,
    operation,
    module_name,
    class_name,
    service_attribute,
    key_attribute,
):
    events = []

    class FakeService:
        def __init__(self, *args, **kwargs):
            model_path = (
                args[0]
                if args
                else kwargs.get("model", kwargs.get("model_path", kwargs.get("model_param_path")))
            )
            events.append(f"load:{model_path.name}")
            if model_path.name == "broken":
                raise ModelLoadError("Broken model")
            self.cleaned = False

        def cleanup(self):
            events.append("cleanup")
            self.cleaned = True

    module = ModuleType(module_name)
    setattr(module, class_name, FakeService)
    monkeypatch.setitem(sys.modules, module_name, module)
    image_util = ModuleType("utils.image_util")
    image_util.get_device = lambda: "cpu"
    monkeypatch.setitem(sys.modules, "utils.image_util", image_util)
    manager = ServiceManager()

    def get_service(model_path):
        if operation == "caption":
            return manager.get_caption_service(model_path)
        if operation == "tag":
            return manager.get_tag_service(model_path)
        return manager.get_upscale_service(
            UpscaleRequest(
                backend=operation,
                upscale_model_path=str(model_path),
                load_path=str(tmp_path),
                save_path=str(tmp_path),
            )
        )

    previous = get_service(tmp_path / "good")
    with pytest.raises(ModelLoadError, match="Broken model"):
        get_service(tmp_path / "broken")

    assert previous.cleaned
    assert getattr(manager, service_attribute) is None
    assert getattr(manager, key_attribute) is None
    recovered = get_service(tmp_path / "good")
    assert recovered is not previous
    assert not recovered.cleaned
    assert events == ["load:good", "cleanup", "load:broken", "load:good"]
