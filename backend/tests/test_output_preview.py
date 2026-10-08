from pathlib import Path
from unittest.mock import AsyncMock, Mock

import pytest
from PIL import Image

from core.jobs import JobManager
from models import CaptionRequest, JobResponse, TagRequest
from service.image_captioning import process_caption_batch
from service.image_tagging import ImageTaggingService


class Connections:
    def __init__(self):
        self.events = []

    async def send_job(self, job):
        self.events.append(job.copy())


def image_paths(tmp_path: Path):
    source = tmp_path / "input"
    output = tmp_path / "output"
    source.mkdir()
    output.mkdir()
    Image.new("RGB", (4, 4), "orange").save(source / "image.png")
    return source, output


@pytest.mark.asyncio
async def test_caption_preview_points_to_actual_renamed_output(tmp_path):
    source, output = image_paths(tmp_path)
    (output / "image.txt").write_text("Original caption", encoding="utf-8")
    request = CaptionRequest(
        provider="openai",
        cloud_model="gpt-4.1-mini",
        load_path=str(source),
        save_path=str(output),
        prompt="Describe it",
        collision_policy="rename",
    )
    connections = Connections()
    manager = JobManager(connections)  # type: ignore[arg-type]
    created = await manager.start(
        "caption",
        lambda context: process_caption_batch(
            request, context, AsyncMock(return_value="New caption")
        ),
    )
    await manager.tasks[created["job_id"]]
    final = manager.get(created["job_id"])
    assert final["status"] == "completed"
    assert final["preview_source"] == str(source / "image.png")
    assert final["preview_output"] == str(output / "image_1.txt")
    assert Path(final["preview_output"]).read_text(encoding="utf-8") == "New caption"
    assert (output / "image.txt").read_text(encoding="utf-8") == "Original caption"
    assert JobResponse(**final).model_dump()["preview_output"] == final["preview_output"]
    assert any(event["preview_output"] == final["preview_output"] for event in connections.events)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "output_mode,suffix", [("txt", ".tags.txt"), ("json", ".tags.json"), ("both", ".tags.json")]
)
async def test_tag_preview_publishes_saved_output_and_closes_images(
    tmp_path, monkeypatch, output_mode, suffix
):
    source, output = image_paths(tmp_path)
    service = ImageTaggingService(tmp_path / "model")
    monkeypatch.setattr(service, "load", AsyncMock())
    monkeypatch.setattr(service, "_tag", lambda *_args: [{"tag": "orange", "score": 0.9}])
    image = Mock()
    monkeypatch.setattr("service.image_tagging.load_rgb_image", lambda _path: image)
    request = TagRequest(
        tag_model_path=str(tmp_path / "model"),
        load_path=str(source),
        save_path=str(output),
        output=output_mode,
    )
    manager = JobManager(Connections())  # type: ignore[arg-type]
    created = await manager.start("tag", lambda context: service.process(request, context))
    await manager.tasks[created["job_id"]]
    final = manager.get(created["job_id"])
    assert final["status"] == "completed"
    assert final["preview_output"] == str(output / f"image{suffix}")
    assert Path(final["preview_output"]).is_file()
    image.close.assert_called_once()


@pytest.mark.asyncio
async def test_fully_skipped_tag_batch_does_not_load_model(tmp_path, monkeypatch):
    source, output = image_paths(tmp_path)
    (output / "image.tags.txt").write_text("existing tags", encoding="utf-8")
    service = ImageTaggingService(tmp_path / "model")
    load = AsyncMock()
    monkeypatch.setattr(service, "load", load)
    request = TagRequest(
        tag_model_path=str(tmp_path / "model"),
        load_path=str(source),
        save_path=str(output),
        output="txt",
        collision_policy="skip",
    )
    manager = JobManager(Connections())  # type: ignore[arg-type]
    created = await manager.start("tag", lambda context: service.process(request, context))
    await manager.tasks[created["job_id"]]
    assert manager.get(created["job_id"])["status"] == "completed"
    load.assert_not_called()


@pytest.mark.asyncio
@pytest.mark.parametrize("cancel,fail", [(True, False), (False, True)])
async def test_tag_inference_cancellation_and_failure_close_image_without_writing(
    tmp_path, monkeypatch, cancel, fail
):
    source, output = image_paths(tmp_path)
    service = ImageTaggingService(tmp_path / "model")
    monkeypatch.setattr(service, "load", AsyncMock())
    image = Mock()
    monkeypatch.setattr("service.image_tagging.load_rgb_image", lambda _path: image)
    request = TagRequest(
        tag_model_path=str(tmp_path / "model"),
        load_path=str(source),
        save_path=str(output),
        output="txt",
    )
    manager = JobManager(Connections())  # type: ignore[arg-type]

    def tag(*_args):
        if cancel:
            next(iter(manager.cancel_events.values())).set()
        if fail:
            raise RuntimeError("inference failed")
        return [{"tag": "orange", "score": 0.9}]

    monkeypatch.setattr(service, "_tag", tag)
    created = await manager.start("tag", lambda context: service.process(request, context))
    await manager.tasks[created["job_id"]]
    assert manager.get(created["job_id"])["status"] == ("cancelled" if cancel else "failed")
    assert not (output / "image.tags.txt").exists()
    image.close.assert_called_once()
