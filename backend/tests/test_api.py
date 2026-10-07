from fastapi.testclient import TestClient
from PIL import Image

from main import app
from service.service_manager import ServiceManager


def test_health_requires_launch_token():
    with TestClient(app) as client:
        assert client.get("/health").status_code == 401
        response = client.get("/health", headers={"x-trainkit-token": "test-token"})
        assert response.status_code == 200
        assert response.json()["status"] == "ok"


def test_capabilities_are_canonical():
    with TestClient(app) as client:
        response = client.get("/capabilities", headers={"x-trainkit-token": "test-token"})
        assert response.status_code == 200
        body = response.json()
        assert body["upscale_backends"] == ["spandrel", "ncnn"]
        assert "tag" in body["operations"]
        assert any(item["value"] == "bmp" for item in body["output_formats"])


def test_request_validation_uses_error_envelope():
    with TestClient(app) as client:
        response = client.post("/rename", json={}, headers={"x-trainkit-token": "test-token"})
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "validation_error"


def test_model_status_does_not_echo_user_path(monkeypatch, tmp_path):
    services = ServiceManager.get_instance()
    monkeypatch.setattr(services, "is_caption_model_loaded", lambda *_args: False)
    monkeypatch.setattr(
        services,
        "get_gpu_memory_usage",
        lambda: {
            "gpu_memory_allocated_gb": 0,
            "gpu_memory_reserved_gb": 0,
            "gpu_memory_total_gb": 0,
        },
    )

    with TestClient(app) as client:
        response = client.post(
            "/model-status",
            json={"model_path": str(tmp_path), "adapter": "auto"},
            headers={"x-trainkit-token": "test-token"},
        )

    assert response.status_code == 200
    assert response.json() == {
        "is_loaded": False,
        "gpu_memory_allocated_gb": 0,
        "gpu_memory_reserved_gb": 0,
        "gpu_memory_total_gb": 0,
    }


def test_cloud_caption_http_boundary_requires_key_but_allows_dry_run(tmp_path):
    source = tmp_path / "image.png"
    Image.new("RGB", (2, 2), "blue").save(source)
    body = {
        "provider": "openai",
        "cloud_model": "gpt-4.1-mini",
        "load_path": str(source),
        "save_path": str(tmp_path / "output"),
        "prompt": "Describe the image",
    }
    headers = {"x-trainkit-token": "test-token"}
    with TestClient(app) as client:
        assert client.post("/caption", json=body).status_code == 401
        missing = client.post("/caption", json=body, headers=headers)
        assert missing.status_code == 400
        assert missing.json()["error"]["code"] == "provider_key_missing"
        dry_run = client.post("/caption", json={**body, "dry_run": True}, headers=headers)
        assert dry_run.status_code == 202
        assert dry_run.json()["operation"] == "caption"
