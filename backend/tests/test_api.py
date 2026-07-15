from fastapi.testclient import TestClient

from main import app


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
