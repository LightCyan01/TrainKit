from __future__ import annotations

import asyncio
from pathlib import Path

import difPy

from config.image_formats import SUPPORTED_INPUT_EXTENSIONS
from core.exceptions import ProcessingError
from core.jobs import JobContext
from models import RenameRequest
from service.manifest import BatchManifest, build_manifest, manifest_path
from utils.file_util import atomic_copy, is_image


class RenameService:
    def __init__(self):
        self._duplicates_cache: set[Path] | None = None

    async def process(self, request: RenameRequest, context: JobContext) -> Path:
        load_path = Path(request.load_path).resolve()
        save_path = Path(request.save_path).resolve()
        if request.resume_manifest_path:
            output_manifest = Path(request.resume_manifest_path).resolve()
            manifest = BatchManifest.load(output_manifest, expected_operation="rename")
            manifest.validate_scope(load_path, save_path)
            manifest.validate_destination_suffixes(SUPPORTED_INPUT_EXTENSIONS)
            manifest.preflight_resume(request.collision_policy)
        else:
            duplicates: set[Path] = set()
            if request.skip_duplicates:
                duplicates = await asyncio.to_thread(self.skip_duplicates, load_path)
            sources = [
                path
                for path in load_path.iterdir()
                if path.is_file() and is_image(path) and path not in duplicates
            ]

            def destination(source: Path, index: int) -> Path:
                number = str(index).zfill(request.zero_pad)
                if request.mode == "sequential":
                    name = f"{number}{source.suffix.casefold()}"
                else:
                    name = f"{source.stem}_{number}{source.suffix.casefold()}"
                return save_path / name

            manifest = build_manifest(
                job_id=context.job_id,
                operation="rename",
                load_path=load_path,
                save_path=save_path,
                sources=sources,
                destination_for=destination,
                collision_policy=request.collision_policy,
            )
            output_manifest = manifest_path(save_path, context.job_id)
        manifest.save(output_manifest)
        total = len(manifest.items)
        completed = sum(item.status in {"completed", "skipped"} for item in manifest.items)
        await context.progress(completed, total, "Rename manifest ready", output_manifest)
        if request.dry_run:
            return output_manifest

        failures = 0
        for item in manifest.items:
            if item.status in {"completed", "skipped"}:
                continue
            context.raise_if_cancelled()
            try:
                await asyncio.to_thread(atomic_copy, Path(item.source), Path(item.destination))
                item.status = "completed"
                item.error = None
            except Exception as exc:
                item.status = "failed"
                item.error = str(exc)
                failures += 1
            completed += 1
            manifest.save(output_manifest)
            await context.progress(
                completed, total, f"Renamed {Path(item.source).name}", output_manifest
            )
        if failures:
            raise ProcessingError(f"Rename failed for {failures} item(s); see the manifest")
        return output_manifest

    def skip_duplicates(self, load_path: Path) -> set[Path]:
        if self._duplicates_cache is not None:
            return self._duplicates_cache
        dif = difPy.build(str(load_path), recursive=False)
        search = difPy.search(dif)
        duplicates: set[Path] = set()
        for duplicate_group in search.result.values():
            for entry in duplicate_group:
                duplicates.add(Path(entry[0]).resolve())
        self._duplicates_cache = duplicates
        return duplicates

    def clear_cache(self):
        self._duplicates_cache = None
