from __future__ import annotations

import json
import os
import re
from collections.abc import Callable, Iterable
from datetime import UTC, datetime
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Literal

from pydantic import BaseModel, Field, ValidationError

from core.exceptions import InvalidPathError

ItemStatus = Literal["pending", "completed", "skipped", "failed"]
MAX_MANIFEST_BYTES = 32 * 1024 * 1024


class ManifestItem(BaseModel):
    source: str
    destination: str
    status: ItemStatus = "pending"
    error: str | None = None
    metadata: dict[str, str | int | float | bool] = Field(default_factory=dict)


class BatchManifest(BaseModel):
    schema_version: Literal[1] = 1
    job_id: str
    operation: str
    load_path: str
    save_path: str
    collision_policy: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    items: list[ManifestItem]

    def save(self, path: Path) -> Path:
        self.updated_at = datetime.now(UTC)
        path.parent.mkdir(parents=True, exist_ok=True)
        atomic_write_text(path, self.model_dump_json(indent=2))
        return path

    @classmethod
    def load(cls, path: Path, expected_operation: str | None = None) -> BatchManifest:
        if not path.is_file():
            raise InvalidPathError(f"Manifest does not exist: {path}")
        if path.stat().st_size > MAX_MANIFEST_BYTES:
            raise InvalidPathError("Manifest is larger than the 32 MiB safety limit")
        try:
            manifest = cls.model_validate_json(path.read_text(encoding="utf-8"))
        except (OSError, UnicodeError, ValidationError) as exc:
            raise InvalidPathError(f"Invalid manifest: {exc}") from exc
        if expected_operation and manifest.operation != expected_operation:
            raise InvalidPathError(
                f"Manifest operation is {manifest.operation}, expected {expected_operation}"
            )
        for item in manifest.items:
            if item.status == "failed":
                item.status = "pending"
                item.error = None
        return manifest

    def validate_scope(self, load_path: Path, save_path: Path):
        load_root = load_path.resolve()
        save_root = save_path.resolve()
        if _path_key(Path(self.load_path)) != _path_key(load_root):
            raise InvalidPathError("Manifest input directory does not match this request")
        if _path_key(Path(self.save_path)) != _path_key(save_root):
            raise InvalidPathError("Manifest output directory does not match this request")
        for item in self.items:
            if not _is_within(Path(item.source), load_root):
                raise InvalidPathError(
                    f"Manifest source escapes the input directory: {item.source}"
                )
            if not _is_within(Path(item.destination), save_root):
                raise InvalidPathError(
                    f"Manifest destination escapes the output directory: {item.destination}"
                )

    def preflight_resume(self, collision_policy: str):
        source_keys = {_path_key(Path(item.source)) for item in self.items}
        reserved: set[str] = set()
        collisions: list[str] = []
        for item in self.items:
            destination = Path(item.destination)
            destination_key = _path_key(destination)
            if item.status in {"completed", "skipped"}:
                reserved.add(destination_key)
                continue

            existing_collision = destination.exists()
            planned_collision = destination_key in reserved
            source_collision = destination_key in source_keys
            collision = existing_collision or planned_collision or source_collision
            if collision and collision_policy == "rename":
                destination = _renamed_destination(destination, reserved | source_keys)
                destination_key = _path_key(destination)
                item.destination = str(destination)
                collision = False

            if collision:
                if collision_policy == "skip":
                    item.status = "skipped"
                    item.error = "Destination already exists at resume time"
                elif (
                    collision_policy == "overwrite"
                    and existing_collision
                    and not planned_collision
                    and not source_collision
                ):
                    item.error = None
                else:
                    collisions.append(str(destination))
            reserved.add(destination_key)

        if collisions:
            preview = ", ".join(collisions[:3])
            suffix = "..." if len(collisions) > 3 else ""
            raise InvalidPathError(f"Resume output collision detected: {preview}{suffix}")
        self.collision_policy = collision_policy

    def validate_destination_suffixes(self, allowed: set[str]):
        normalized = {suffix.casefold() for suffix in allowed}
        for item in self.items:
            if Path(item.destination).suffix.casefold() not in normalized:
                raise InvalidPathError(
                    f"Manifest destination has an invalid extension: {item.destination}"
                )


def natural_key(path: Path) -> list[str | int]:
    return [
        int(part) if part.isdigit() else part.casefold() for part in re.split(r"(\d+)", path.name)
    ]


def sorted_files(paths: Iterable[Path]) -> list[Path]:
    return sorted(paths, key=natural_key)


def manifest_path(save_path: Path, job_id: str) -> Path:
    return save_path / ".trainkit" / "manifests" / f"{job_id}.json"


def _path_key(path: Path) -> str:
    return os.path.normcase(str(path.resolve()))


def _is_within(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


def _renamed_destination(destination: Path, reserved: set[str]) -> Path:
    counter = 1
    candidate = destination
    while candidate.exists() or _path_key(candidate) in reserved:
        candidate = destination.with_name(f"{destination.stem}_{counter}{destination.suffix}")
        counter += 1
    return candidate


def build_manifest(
    *,
    job_id: str,
    operation: str,
    load_path: Path,
    save_path: Path,
    sources: Iterable[Path],
    destination_for: Callable[[Path, int], Path],
    collision_policy: str,
) -> BatchManifest:
    if not load_path.is_dir():
        raise InvalidPathError(f"Input directory does not exist: {load_path}")
    save_path.mkdir(parents=True, exist_ok=True)
    reserved: set[str] = set()
    items: list[ManifestItem] = []
    collisions: list[str] = []
    ordered_sources = sorted_files(sources)
    source_keys = {_path_key(source) for source in ordered_sources}
    for index, source in enumerate(ordered_sources, start=1):
        destination = destination_for(source, index)
        if not _is_within(source, load_path):
            raise InvalidPathError(f"Source escapes the input directory: {source}")
        if not _is_within(destination, save_path):
            raise InvalidPathError(f"Destination escapes the output directory: {destination}")
        source_key = _path_key(source)
        destination_key = _path_key(destination)
        existing_collision = destination.exists()
        planned_collision = destination_key in reserved
        same_file_collision = source_key == destination_key
        source_collision = destination_key in source_keys
        collision = (
            existing_collision or planned_collision or same_file_collision or source_collision
        )
        if collision and collision_policy == "rename":
            destination = _renamed_destination(destination, reserved)
            destination_key = _path_key(destination)
            collision = False
        item = ManifestItem(source=str(source), destination=str(destination))
        if collision:
            if collision_policy == "skip":
                item.status = "skipped"
                item.error = "Destination already exists"
            elif (
                collision_policy == "overwrite"
                and existing_collision
                and not planned_collision
                and not same_file_collision
                and not source_collision
            ):
                pass
            else:
                collisions.append(str(destination))
        reserved.add(destination_key)
        items.append(item)
    if collisions:
        preview = ", ".join(collisions[:3])
        suffix = "..." if len(collisions) > 3 else ""
        raise InvalidPathError(f"Output collision detected: {preview}{suffix}")
    return BatchManifest(
        job_id=job_id,
        operation=operation,
        load_path=str(load_path),
        save_path=str(save_path),
        collision_policy=collision_policy,
        items=items,
    )


def atomic_write_text(path: Path, contents: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile(
        "w", encoding="utf-8", dir=path.parent, prefix=f".{path.name}.", delete=False
    ) as handle:
        handle.write(contents)
        handle.flush()
        os.fsync(handle.fileno())
        temporary = Path(handle.name)
    os.replace(temporary, path)


def atomic_write_json(path: Path, value: object):
    atomic_write_text(path, json.dumps(value, ensure_ascii=False, indent=2))
