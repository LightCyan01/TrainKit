import asyncio
import base64
import errno
import json
from io import BytesIO
from threading import Event
from unittest.mock import patch

import httpx
import pytest
from PIL import Image
from pydantic import ValidationError

from core.exceptions import InvalidPathError, JobCancelledError, ProcessingError, TrainKitException
from models import CaptionRequest
from routers.caption import caption
from service import cloud_captioning, image_captioning
from service.image_captioning import process_caption_batch
from service.manifest import BatchManifest
from utils.file_util import load_rgb_image

TEST_KEY = "test-provider-secret"


class FakeContext:
    job_id = "cloud-job"

    def __init__(self):
        self.cancelled = Event()
        self.updates = []

    def raise_if_cancelled(self):
        if self.cancelled.is_set():
            raise JobCancelledError()

    async def progress(self, current, total, message, manifest_path=None, **_preview):
        self.raise_if_cancelled()
        self.updates.append((current, total, message, manifest_path))


def make_request(tmp_path, **options):
    source = tmp_path / "input"
    source.mkdir(exist_ok=True)
    Image.new("RGB", (2, 2), "blue").save(source / "image.bmp")
    return CaptionRequest(
        **{
            "provider": "openai",
            "cloud_model": "gpt-4.1-mini",
            "load_path": str(source),
            "save_path": str(tmp_path / "output"),
            "prompt": "Describe this image",
            **options,
        }
    )


def success_response(provider="openai", text="A blue square."):
    if provider == "anthropic":
        return {"stop_reason": "end_turn", "content": [{"type": "text", "text": text}]}
    return {
        "status": "completed",
        "output": [
            {
                "type": "message",
                "status": "completed",
                "role": "assistant",
                "content": [{"type": "output_text", "text": text}],
            }
        ],
    }


def install_transport(monkeypatch, handler):
    client_type = httpx.AsyncClient
    clients = []

    def create_client(**options):
        clients.append(options)
        return client_type(transport=httpx.MockTransport(handler), **options)

    monkeypatch.setattr(cloud_captioning.httpx, "AsyncClient", create_client)
    return clients


def test_caption_request_requires_provider_settings(tmp_path):
    legacy = CaptionRequest(
        caption_model_path="model", load_path="input", save_path="output", prompt="Describe it"
    )
    assert legacy.provider == "local"
    for options in ({"provider": "local"}, {"cloud_model": " "}):
        with pytest.raises(ValidationError):
            make_request(tmp_path, **options)
    assert make_request(tmp_path).provider == "openai"
    assert make_request(tmp_path, dry_run=True).dry_run
    assert "api_key" not in CaptionRequest.model_fields


@pytest.mark.parametrize("provider", ["openai", "anthropic"])
async def test_provider_contract_and_shared_atomic_batch(monkeypatch, tmp_path, provider):
    request = make_request(tmp_path, provider=provider, save_manifest=True)
    original = (tmp_path / "input" / "image.bmp").read_bytes()
    calls = []

    def handler(sent):
        calls.append(sent)
        body = json.loads(sent.content)
        assert sent.method == "POST"
        assert str(sent.url) == cloud_captioning.ENDPOINTS[provider]
        assert body["model"] == request.cloud_model
        assert TEST_KEY not in sent.content.decode()
        if provider == "anthropic":
            assert sent.headers["x-api-key"] == TEST_KEY
            assert sent.headers["anthropic-version"] == "2023-06-01"
            assert body["max_tokens"] == 256
            content = body["messages"][0]["content"]
            encoded = content[0]["source"]["data"]
            assert content[0]["source"]["media_type"] == "image/jpeg"
            assert content[1] == {"type": "text", "text": request.prompt}
        else:
            assert sent.headers["authorization"] == f"Bearer {TEST_KEY}"
            assert body["store"] is False
            assert body["max_output_tokens"] == 256
            content = body["input"][0]["content"]
            encoded = content[0]["image_url"].removeprefix("data:image/jpeg;base64,")
            assert content[1] == {"type": "input_text", "text": request.prompt}
        with Image.open(BytesIO(base64.b64decode(encoded))) as image:
            assert image.format == "JPEG" and image.mode == "RGB"
        return httpx.Response(200, json=success_response(provider))

    clients = install_transport(monkeypatch, handler)
    manifest_path = await cloud_captioning.process_cloud_caption_batch(
        request, FakeContext(), TEST_KEY
    )
    assert (tmp_path / "output" / "image.txt").read_text() == "A blue square."
    assert (tmp_path / "input" / "image.bmp").read_bytes() == original
    assert len(clients) == len(calls) == 1
    assert clients[0]["follow_redirects"] is False and clients[0]["trust_env"] is False
    assert manifest_path and TEST_KEY not in manifest_path.read_text()
    assert BatchManifest.load(manifest_path).items[0].status == "completed"


def test_cloud_image_resize_strips_metadata_without_modifying_source():
    with Image.new("RGB", (4000, 2000), "blue") as image:
        image.info["comment"] = b"private metadata"
        exif = Image.Exif()
        exif[315] = "private metadata"
        image.info["exif"] = exif.tobytes()
        encoded = cloud_captioning.encode_cloud_image(image)
        assert image.size == (4000, 2000) and image.info["comment"] == b"private metadata"
        with Image.open(BytesIO(base64.b64decode(encoded))) as uploaded:
            assert uploaded.size == (1568, 784)
            assert "comment" not in uploaded.info and not uploaded.getexif()


@pytest.mark.parametrize(
    "orientation,size,expected_colors",
    [
        (6, (40, 80), [(20, 20, 240), (240, 20, 20), (240, 220, 20), (20, 220, 20)]),
        (2, (80, 40), [(20, 220, 20), (240, 20, 20), (240, 220, 20), (20, 20, 240)]),
    ],
)
def test_cloud_jpeg_encoding_applies_exif_orientation_without_changing_source(
    tmp_path, orientation, size, expected_colors
):
    source = tmp_path / "oriented.jpg"
    exif = Image.Exif()
    exif[274] = orientation
    exif[315] = "private author"
    with Image.new("RGB", (80, 40)) as image:
        for color, box in [
            ((240, 20, 20), (0, 0, 40, 20)),
            ((20, 220, 20), (40, 0, 80, 20)),
            ((20, 20, 240), (0, 20, 40, 40)),
            ((240, 220, 20), (40, 20, 80, 40)),
        ]:
            image.paste(color, box)
        image.save(source, quality=95, subsampling=0, exif=exif, comment=b"private comment")
    original_file = source.read_bytes()
    with load_rgb_image(source) as image:
        original_pixels = image.tobytes()
        original_info = image.info.copy()
        assert image.getexif()[274] == orientation

        encoded = cloud_captioning.encode_cloud_image(image)

        assert image.size == (80, 40)
        assert image.tobytes() == original_pixels and image.info == original_info
        assert image.getexif()[274] == orientation
    assert source.read_bytes() == original_file
    with Image.open(BytesIO(base64.b64decode(encoded))) as uploaded:
        assert uploaded.size == size
        assert not uploaded.getexif() and "comment" not in uploaded.info
        width, height = uploaded.size
        points = [
            (width // 4, height // 4),
            (3 * width // 4, height // 4),
            (width // 4, 3 * height // 4),
            (3 * width // 4, 3 * height // 4),
        ]
        for point, expected in zip(points, expected_colors, strict=True):
            assert all(
                abs(actual - wanted) <= 15
                for actual, wanted in zip(uploaded.getpixel(point), expected, strict=True)
            )


@pytest.mark.parametrize("mode", ["dry_run", "skip", "resume"])
async def test_cloud_plans_without_requests(monkeypatch, tmp_path, mode):
    request = make_request(tmp_path, dry_run=True)

    def handler(_sent):
        pytest.fail("A planned or completed batch must not contact the provider")

    install_transport(monkeypatch, handler)
    manifest_path = await cloud_captioning.process_cloud_caption_batch(request, FakeContext(), "")
    assert manifest_path and not (tmp_path / "output" / "image.txt").exists()
    if mode == "dry_run":
        return
    destination = tmp_path / "output" / "image.txt"
    destination.write_text("Existing caption")
    options = {"dry_run": False}
    if mode == "skip":
        options["collision_policy"] = "skip"
    else:
        manifest = BatchManifest.load(manifest_path)
        manifest.items[0].status = "completed"
        manifest.save(manifest_path)
        options["resume_manifest_path"] = str(manifest_path)
    await cloud_captioning.process_cloud_caption_batch(
        request.model_copy(update=options), FakeContext(), TEST_KEY
    )
    assert destination.read_text() == "Existing caption"


async def test_collision_preflight_prevents_cloud_charge(monkeypatch, tmp_path):
    request = make_request(tmp_path)
    destination = tmp_path / "output" / "image.txt"
    destination.parent.mkdir()
    destination.write_text("Existing caption")
    install_transport(monkeypatch, lambda _sent: pytest.fail("Collision must precede request"))
    with pytest.raises(InvalidPathError, match="collision"):
        await cloud_captioning.process_cloud_caption_batch(request, FakeContext(), TEST_KEY)
    assert destination.read_text() == "Existing caption"


@pytest.mark.parametrize(
    "provider,response",
    [
        ("openai", {"status": "incomplete", "output": []}),
        (
            "openai",
            {
                "status": "completed",
                "output": [
                    {
                        "type": "message",
                        "status": "completed",
                        "role": "assistant",
                        "content": [{"type": "refusal", "refusal": TEST_KEY}],
                    }
                ],
            },
        ),
        ("openai", success_response(text=" ")),
        (
            "anthropic",
            {"stop_reason": "max_tokens", "content": [{"type": "text", "text": TEST_KEY}]},
        ),
        ("anthropic", {"stop_reason": "refusal", "content": [{"type": "text", "text": TEST_KEY}]}),
        ("anthropic", {"stop_reason": "end_turn", "content": []}),
        ("anthropic", {"stop_reason": "model_context_window_exceeded", "content": []}),
    ],
)
async def test_invalid_cloud_output_preserves_destination_and_safe_manifest(
    monkeypatch, tmp_path, provider, response
):
    request = make_request(
        tmp_path, provider=provider, save_manifest=True, collision_policy="overwrite"
    )
    Image.new("RGB", (2, 2)).save(tmp_path / "input" / "later.png")
    destination = tmp_path / "output" / "image.txt"
    destination.parent.mkdir()
    destination.write_text("Existing caption")
    calls = []

    def handler(sent):
        calls.append(sent)
        return httpx.Response(200, json=response)

    install_transport(monkeypatch, handler)
    with pytest.raises(ProcessingError) as error:
        await cloud_captioning.process_cloud_caption_batch(request, FakeContext(), TEST_KEY)
    assert TEST_KEY not in str(error.value) and len(calls) == 1
    assert destination.read_text() == "Existing caption"
    assert not (tmp_path / "output" / "later.txt").exists()
    saved = tmp_path / "output" / ".trainkit" / "manifests" / "cloud-job.json"
    data = json.loads(saved.read_text())
    assert data["items"][0]["status"] == "failed"
    assert data["items"][1]["status"] == "pending"
    assert TEST_KEY not in saved.read_text()


@pytest.mark.parametrize("status", [401, 403, 429, 500, 302])
async def test_http_errors_do_not_retry_or_leak_provider_response(monkeypatch, tmp_path, status):
    request = make_request(tmp_path, save_manifest=True)
    calls = []

    def handler(sent):
        calls.append(sent)
        return httpx.Response(status, text=TEST_KEY, headers={"location": "https://example.com"})

    install_transport(monkeypatch, handler)
    with pytest.raises(ProcessingError) as error:
        await cloud_captioning.process_cloud_caption_batch(request, FakeContext(), TEST_KEY)
    assert TEST_KEY not in str(error.value) and len(calls) == 1
    assert not (tmp_path / "output" / "image.txt").exists()


async def test_pending_cloud_request_cancels_and_closes_transport(monkeypatch, tmp_path):
    request = make_request(tmp_path, save_manifest=True)
    started, closed = asyncio.Event(), asyncio.Event()

    async def handler(_sent):
        started.set()
        try:
            await asyncio.Event().wait()
        finally:
            closed.set()

    install_transport(monkeypatch, handler)
    context = FakeContext()
    running = asyncio.create_task(
        cloud_captioning.process_cloud_caption_batch(request, context, TEST_KEY)
    )
    await asyncio.wait_for(started.wait(), 1)
    context.cancelled.set()
    with pytest.raises(JobCancelledError):
        await asyncio.wait_for(running, 1)
    assert closed.is_set() and not (tmp_path / "output" / "image.txt").exists()


async def test_total_timeout_cancels_transport_without_retry(monkeypatch, tmp_path):
    request = make_request(tmp_path)
    closed = asyncio.Event()

    async def handler(_sent):
        try:
            await asyncio.Event().wait()
        finally:
            closed.set()

    install_transport(monkeypatch, handler)
    monkeypatch.setattr(cloud_captioning, "REQUEST_TIMEOUT_SECONDS", 0.02)
    with pytest.raises(ProcessingError, match="timed out"):
        await asyncio.wait_for(
            cloud_captioning.process_cloud_caption_batch(request, FakeContext(), TEST_KEY), 1
        )
    assert closed.is_set() and not (tmp_path / "output" / "image.txt").exists()


async def test_cancel_after_generation_prevents_atomic_publish(tmp_path):
    request = make_request(tmp_path)
    context = FakeContext()

    async def generate(_image, _prompt, _cancelled):
        context.cancelled.set()
        return "Must not be published"

    with pytest.raises(JobCancelledError):
        await process_caption_batch(request, context, generate)
    assert not (tmp_path / "output" / "image.txt").exists()


async def test_missing_key_rejected_before_job_start(tmp_path):
    class NeverStart:
        async def start(self, *_args):
            pytest.fail("Missing key must not create a job")

    with pytest.raises(TrainKitException, match="API key"):
        await caption(make_request(tmp_path), provider_key=None, jobs=NeverStart(), services=None)


async def test_resume_sends_only_pending_images_with_one_client(monkeypatch, tmp_path):
    plan = make_request(tmp_path, dry_run=True)
    Image.new("RGB", (2, 2), "red").save(tmp_path / "input" / "second.png")
    Image.new("RGB", (2, 2), "green").save(tmp_path / "input" / "third.png")
    calls = []

    def handler(sent):
        calls.append(sent)
        return httpx.Response(200, json=success_response())

    clients = install_transport(monkeypatch, handler)
    manifest_path = await cloud_captioning.process_cloud_caption_batch(plan, FakeContext(), "")
    manifest = BatchManifest.load(manifest_path)
    manifest.items[0].status = "completed"
    manifest.save(manifest_path)
    (tmp_path / "output" / "image.txt").write_text("Original caption")
    request = plan.model_copy(
        update={
            "dry_run": False,
            "resume_manifest_path": str(manifest_path),
        }
    )
    await cloud_captioning.process_cloud_caption_batch(request, FakeContext(), TEST_KEY)
    assert len(calls) == 2 and len(clients) == 2
    assert (tmp_path / "output" / "image.txt").read_text() == "Original caption"
    assert all(item.status == "completed" for item in BatchManifest.load(manifest_path).items)


async def test_transport_exception_is_sanitized(monkeypatch, tmp_path):
    def handler(_sent):
        raise httpx.ReadError(f"Sensitive provider detail: {TEST_KEY}")

    install_transport(monkeypatch, handler)
    request = make_request(tmp_path, save_manifest=True)
    with pytest.raises(ProcessingError, match="Could not reach") as error:
        await cloud_captioning.process_cloud_caption_batch(request, FakeContext(), TEST_KEY)
    assert TEST_KEY not in str(error.value)
    saved = tmp_path / "output" / ".trainkit" / "manifests" / "cloud-job.json"
    assert TEST_KEY not in saved.read_text()


async def test_cloud_batch_preserves_local_image_failure_details(monkeypatch, tmp_path):
    request = make_request(tmp_path, save_manifest=True)
    (tmp_path / "input" / "image.bmp").write_bytes(b"not an image")
    install_transport(monkeypatch, lambda _sent: pytest.fail("Invalid input must precede upload"))

    with pytest.raises(ProcessingError, match="Invalid or unsafe image image.bmp"):
        await cloud_captioning.process_cloud_caption_batch(request, FakeContext(), TEST_KEY)

    saved = tmp_path / "output" / ".trainkit" / "manifests" / "cloud-job.json"
    item = json.loads(saved.read_text())["items"][0]
    assert item["status"] == "failed"
    assert "Invalid or unsafe image image.bmp" in item["error"]
    assert TEST_KEY not in saved.read_text()


@pytest.mark.parametrize("save_manifest", [False, True])
async def test_cloud_batch_reports_disk_full_after_successful_provider_response(
    monkeypatch, tmp_path, save_manifest
):
    request = make_request(tmp_path, save_manifest=save_manifest, collision_policy="overwrite")
    destination = tmp_path / "output" / "image.txt"
    destination.parent.mkdir()
    destination.write_text("Existing caption")
    calls = []

    def handler(sent):
        calls.append(sent)
        return httpx.Response(200, json=success_response())

    install_transport(monkeypatch, handler)
    write_caption = image_captioning.atomic_write_text

    def disk_full(path, contents):
        with patch(
            "service.manifest.os.replace",
            side_effect=OSError(errno.ENOSPC, "No space left on device", str(path)),
        ):
            write_caption(path, contents)

    monkeypatch.setattr(image_captioning, "atomic_write_text", disk_full)
    with pytest.raises(
        ProcessingError, match="Could not save caption image.txt.*No space left on device"
    ) as error:
        await cloud_captioning.process_cloud_caption_batch(request, FakeContext(), TEST_KEY)

    assert len(calls) == 1 and TEST_KEY not in str(error.value)
    assert destination.read_text() == "Existing caption"
    assert not list(destination.parent.glob(".image.txt.*"))
    if not save_manifest:
        assert not (tmp_path / "output" / ".trainkit").exists()
        return
    saved = tmp_path / "output" / ".trainkit" / "manifests" / "cloud-job.json"
    item = json.loads(saved.read_text())["items"][0]
    assert item["status"] == "failed"
    assert "Could not save caption image.txt" in item["error"]
    assert "No space left on device" in item["error"]
    assert TEST_KEY not in saved.read_text()


@pytest.mark.parametrize("exception_type", [RuntimeError, OSError])
async def test_unexpected_provider_exceptions_remain_redacted(
    monkeypatch, tmp_path, exception_type
):
    def handler(_sent):
        raise exception_type(f"Sensitive provider detail: {TEST_KEY}")

    install_transport(monkeypatch, handler)
    request = make_request(tmp_path, save_manifest=True)
    with pytest.raises(ProcessingError, match="Cloud captioning failed") as error:
        await cloud_captioning.process_cloud_caption_batch(request, FakeContext(), TEST_KEY)

    assert TEST_KEY not in str(error.value)
    saved = tmp_path / "output" / ".trainkit" / "manifests" / "cloud-job.json"
    item = json.loads(saved.read_text())["items"][0]
    assert item["status"] == "failed"
    assert item["error"] == "Cloud captioning failed; no caption was written"
    assert TEST_KEY not in saved.read_text()


async def test_route_passes_header_key_only_to_cloud_runner(monkeypatch, tmp_path):
    received = []

    async def process(request, _context, key):
        received.append((request.model_dump(), key))
        return None

    class RunImmediately:
        async def start(self, operation, runner):
            assert operation == "caption"
            return await runner(FakeContext())

    monkeypatch.setattr(cloud_captioning, "process_cloud_caption_batch", process)
    await caption(
        make_request(tmp_path), provider_key=TEST_KEY, jobs=RunImmediately(), services=None
    )
    assert received[0][1] == TEST_KEY
    assert TEST_KEY not in json.dumps(received[0][0])


async def test_shared_local_batch_keeps_per_image_failure_behavior(tmp_path):
    request = make_request(tmp_path, provider="local", caption_model_path="model")
    Image.new("RGB", (2, 2), "red").save(tmp_path / "input" / "second.png")
    calls = []

    async def generate(image, _prompt, _cancelled):
        calls.append(image.getpixel((0, 0)))
        if len(calls) == 1:
            raise RuntimeError("Local model input failed")
        return "A red square."

    with pytest.raises(ProcessingError, match="Local model input failed"):
        await process_caption_batch(request, FakeContext(), generate)
    assert len(calls) == 2 and (tmp_path / "output" / "second.txt").read_text() == "A red square."
