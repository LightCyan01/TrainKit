from multiprocessing.dummy import Pool as ThreadPool
from pathlib import Path
from unittest.mock import Mock

import pytest
from PIL import Image

from core.jobs import JobManager
from models import RenameRequest
from service.image_rename import RenameService
from service.manifest import BatchManifest
from utils.file_util import atomic_copy, atomic_save_image, list_images


def test_image_listing_is_natural_and_atomic_outputs_replace(tmp_path: Path):
    source = tmp_path / "source"
    output = tmp_path / "output"
    source.mkdir()
    output.mkdir()
    for name in ("10.png", "2.png", "1.png"):
        Image.new("RGB", (2, 2), "red").save(source / name)
    assert [path.name for path in list_images(source)] == ["1.png", "2.png", "10.png"]

    copied = output / "copy.png"
    atomic_copy(source / "1.png", copied)
    assert copied.is_file()
    atomic_save_image(Image.new("RGB", (3, 3), "blue"), copied, "PNG")
    with Image.open(copied) as image:
        assert image.size == (3, 3)


def test_image_listing_accepts_an_individual_image(tmp_path: Path):
    source = tmp_path / "single.webp"
    Image.new("RGB", (2, 2), "green").save(source)

    assert list_images(source) == [source]


@pytest.mark.asyncio
@pytest.mark.parametrize("resume", [False, True])
async def test_rename_rejects_invalid_images_from_folders_and_resume_manifests(
    tmp_path: Path, resume: bool
):
    source = tmp_path / "input"
    output = tmp_path / "output"
    source.mkdir()
    image = source / "broken.png"
    image.write_bytes(b"not an image")
    manifest_path = tmp_path / "resume.json"
    if resume:
        BatchManifest(
            job_id="previous",
            operation="rename",
            load_path=str(source),
            save_path=str(output),
            collision_policy="fail",
            items=[{"source": str(image), "destination": str(output / "00001.png")}],
        ).save(manifest_path)
    request = RenameRequest(
        load_path=str(source),
        save_path=str(output),
        resume_manifest_path=str(manifest_path) if resume else None,
    )
    service = RenameService()
    manager = JobManager()

    async def runner(context):
        return await service.process(request, context)

    created = await manager.start("rename", runner)
    await manager.tasks[created["job_id"]]
    job = manager.get(created["job_id"])

    assert job["status"] == "failed"
    assert "Invalid or unsafe image broken.png" in job["error"]
    assert not (output / "00001.png").exists()


@pytest.mark.asyncio
@pytest.mark.parametrize("extension", ["png", "bmp"])
async def test_rename_duplicate_search_ignores_unsupported_images(
    monkeypatch, tmp_path: Path, extension: str
):
    source = tmp_path / "input"
    output = tmp_path / "output"
    source.mkdir()
    image = Image.new("RGB", (4, 4), "red")
    for name in ("a.tiff", f"b.{extension}", f"c.{extension}"):
        image.save(source / name)
    # Keep the real difPy algorithm while avoiding extra worker processes in the test.
    monkeypatch.setattr("difPy.dif.Pool", ThreadPool)
    request = RenameRequest(load_path=str(source), save_path=str(output), skip_duplicates=True)
    manager = JobManager()

    async def runner(context):
        return await RenameService().process(request, context)

    created = await manager.start("rename", runner)
    await manager.tasks[created["job_id"]]
    job = manager.get(created["job_id"])

    assert job["status"] == "completed"
    assert job["total"] == 1
    assert [path.name for path in output.iterdir()] == [f"00001.{extension}"]
    with Image.open(output / f"00001.{extension}") as copied:
        assert copied.getpixel((0, 0)) == (255, 0, 0)


@pytest.mark.asyncio
async def test_rename_validates_images_before_duplicate_search(monkeypatch, tmp_path: Path):
    source = tmp_path / "input"
    source.mkdir()
    (source / "broken.png").write_bytes(b"not an image")
    Image.new("RGB", (4, 4), "red").save(source / "valid.png")
    duplicate_build = Mock()
    monkeypatch.setattr("difPy.build", duplicate_build)
    request = RenameRequest(
        load_path=str(source), save_path=str(tmp_path / "output"), skip_duplicates=True
    )
    manager = JobManager()

    async def runner(context):
        return await RenameService().process(request, context)

    created = await manager.start("rename", runner)
    await manager.tasks[created["job_id"]]
    job = manager.get(created["job_id"])

    assert job["status"] == "failed"
    assert "Invalid or unsafe image broken.png" in job["error"]
    duplicate_build.assert_not_called()
