from pathlib import Path

import pytest

from core.exceptions import InvalidPathError
from service.manifest import BatchManifest, build_manifest


def test_manifest_naturally_sorts_and_zero_collision_renames(tmp_path: Path):
    load = tmp_path / "input"
    output = tmp_path / "output"
    load.mkdir()
    output.mkdir()
    sources = [load / "image10.png", load / "image2.png", load / "image1.png"]
    for source in sources:
        source.write_bytes(b"x")
    (output / "image1.txt").write_text("existing", encoding="utf-8")

    manifest = build_manifest(
        job_id="job",
        operation="caption",
        load_path=load,
        save_path=output,
        sources=sources,
        destination_for=lambda source, _index: output / f"{source.stem}.txt",
        collision_policy="rename",
    )

    assert [Path(item.source).name for item in manifest.items] == [
        "image1.png",
        "image2.png",
        "image10.png",
    ]
    assert Path(manifest.items[0].destination).name == "image1_1.txt"


def test_manifest_fails_before_writing_on_collision(tmp_path: Path):
    load = tmp_path / "input"
    output = tmp_path / "output"
    load.mkdir()
    output.mkdir()
    source = load / "image.png"
    source.write_bytes(b"x")
    (output / "image.txt").write_text("existing", encoding="utf-8")

    with pytest.raises(InvalidPathError, match="collision"):
        build_manifest(
            job_id="job",
            operation="caption",
            load_path=load,
            save_path=output,
            sources=[source],
            destination_for=lambda item, _index: output / f"{item.stem}.txt",
            collision_policy="fail",
        )


def test_manifest_overwrite_rejects_duplicate_planned_destinations(tmp_path: Path):
    load = tmp_path / "input"
    output = tmp_path / "output"
    first = load / "first"
    second = load / "second"
    first.mkdir(parents=True)
    second.mkdir()
    output.mkdir()
    sources = [first / "image.png", second / "image.png"]
    for source in sources:
        source.write_bytes(b"x")

    with pytest.raises(InvalidPathError, match="collision"):
        build_manifest(
            job_id="job",
            operation="tag",
            load_path=load,
            save_path=output,
            sources=sources,
            destination_for=lambda source, _index: output / f"{source.stem}.json",
            collision_policy="overwrite",
        )


def test_new_manifest_rejects_destination_outside_output_root(tmp_path: Path):
    load = tmp_path / "input"
    output = tmp_path / "output"
    load.mkdir()
    output.mkdir()
    source = load / "image.png"
    source.write_bytes(b"x")

    with pytest.raises(InvalidPathError, match="escapes"):
        build_manifest(
            job_id="job",
            operation="caption",
            load_path=load,
            save_path=output,
            sources=[source],
            destination_for=lambda _source, _index: tmp_path / "outside.txt",
            collision_policy="fail",
        )


def test_manifest_accepts_and_validates_a_single_input_file(tmp_path: Path):
    source = tmp_path / "image.png"
    output = tmp_path / "output"
    source.write_bytes(b"x")

    manifest = build_manifest(
        job_id="job",
        operation="caption",
        load_path=source,
        save_path=output,
        sources=[source],
        destination_for=lambda item, _index: output / f"{item.stem}.txt",
        collision_policy="fail",
    )

    manifest.validate_scope(source, output)
    assert [Path(item.source) for item in manifest.items] == [source]


def test_overwrite_never_replaces_another_source_file(tmp_path: Path):
    dataset = tmp_path / "dataset"
    dataset.mkdir()
    first = dataset / "a.png"
    second = dataset / "b.png"
    first.write_bytes(b"first")
    second.write_bytes(b"second")

    with pytest.raises(InvalidPathError, match="collision"):
        build_manifest(
            job_id="job",
            operation="rename",
            load_path=dataset,
            save_path=dataset,
            sources=[first, second],
            destination_for=lambda _source, index: (
                second if index == 1 else dataset / "finished.png"
            ),
            collision_policy="overwrite",
        )


def test_manifest_round_trip_resets_only_failed_items(tmp_path: Path):
    path = tmp_path / "manifest.json"
    manifest = BatchManifest(
        job_id="job",
        operation="tag",
        load_path=str(tmp_path),
        save_path=str(tmp_path),
        collision_policy="fail",
        items=[
            {"source": "a", "destination": "b", "status": "completed"},
            {"source": "c", "destination": "d", "status": "failed", "error": "boom"},
        ],
    )
    manifest.save(path)
    loaded = BatchManifest.load(path, expected_operation="tag")
    assert loaded.items[0].status == "completed"
    assert loaded.items[1].status == "pending"
    assert loaded.items[1].error is None


def test_resume_manifest_rejects_paths_outside_request_scope(tmp_path: Path):
    load = tmp_path / "input"
    output = tmp_path / "output"
    outside = tmp_path / "outside"
    load.mkdir()
    output.mkdir()
    outside.mkdir()
    manifest = BatchManifest(
        job_id="job",
        operation="caption",
        load_path=str(load),
        save_path=str(output),
        collision_policy="fail",
        items=[
            {
                "source": str(load / "image.png"),
                "destination": str(outside / "caption.txt"),
            }
        ],
    )

    with pytest.raises(InvalidPathError, match="escapes"):
        manifest.validate_scope(load, output)


def test_resume_rechecks_destinations_created_after_original_run(tmp_path: Path):
    load = tmp_path / "input"
    output = tmp_path / "output"
    load.mkdir()
    output.mkdir()
    source = load / "image.png"
    destination = output / "image.txt"
    source.write_bytes(b"source")
    manifest = BatchManifest(
        job_id="job",
        operation="caption",
        load_path=str(load),
        save_path=str(output),
        collision_policy="fail",
        items=[
            {
                "source": str(source),
                "destination": str(destination),
                "status": "failed",
                "error": "old failure",
            }
        ],
    )
    path = tmp_path / "manifest.json"
    manifest.save(path)
    loaded = BatchManifest.load(path, expected_operation="caption")
    destination.write_text("created later", encoding="utf-8")

    with pytest.raises(InvalidPathError, match="Resume output collision"):
        loaded.preflight_resume("fail")

    loaded.preflight_resume("overwrite")
    assert loaded.items[0].status == "pending"
