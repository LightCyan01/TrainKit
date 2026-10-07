from __future__ import annotations

import asyncio
from pathlib import Path

import difPy

from config.image_formats import SUPPORTED_INPUT_EXTENSIONS
from core.exceptions import ProcessingError
from core.jobs import JobContext
from models import RenameRequest
from service.manifest import BatchManifest, build_manifest, manifest_path
from utils.file_util import atomic_copy, list_images, validate_image_path


class RenameService:
    async def process(self, request: RenameRequest, context: JobContext) -> Path | None:
        load_path = Path(request.load_path).resolve()
        save_path = Path(request.save_path).resolve()
        if request.resume_manifest_path:
            output_manifest = Path(request.resume_manifest_path).resolve()
            manifest = BatchManifest.load(output_manifest, expected_operation="rename")
            manifest.validate_scope(load_path, save_path)
            manifest.validate_destination_suffixes(SUPPORTED_INPUT_EXTENSIONS)
            manifest.preflight_resume(request.collision_policy)
        else:
            sources = list_images(load_path)
            if request.skip_duplicates and load_path.is_dir():
                duplicates = await asyncio.to_thread(self.skip_duplicates, sources)
                sources = [path for path in sources if path not in duplicates]

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
            output_manifest = (
                manifest_path(save_path, context.job_id)
                if request.save_manifest or request.dry_run
                else None
            )
        if output_manifest is not None:
            manifest.save(output_manifest)
        total = len(manifest.items)
        completed = sum(item.status in {"completed", "skipped"} for item in manifest.items)
        message = "Rename manifest ready" if output_manifest is not None else "Rename plan ready"
        await context.progress(completed, total, message, output_manifest)
        if request.dry_run:
            return output_manifest

        failures = 0
        first_error: str | None = None
        for item in manifest.items:
            if item.status in {"completed", "skipped"}:
                continue
            context.raise_if_cancelled()
            try:
                await asyncio.to_thread(validate_image_path, Path(item.source))
                await asyncio.to_thread(atomic_copy, Path(item.source), Path(item.destination))
                item.status = "completed"
                item.error = None
            except Exception as exc:
                item.status = "failed"
                item.error = str(exc)
                failures += 1
                first_error = first_error or f"{Path(item.source).name}: {str(exc)[:500]}"
            completed += 1
            if output_manifest is not None:
                manifest.save(output_manifest)
            await context.progress(
                completed, total, f"Renamed {Path(item.source).name}", output_manifest
            )
        if failures:
            detail = f": {first_error}" if first_error else ""
            suffix = "; see the manifest" if output_manifest is not None else ""
            raise ProcessingError(f"Rename failed for {failures} item(s){detail}{suffix}")
        return output_manifest

    def skip_duplicates(self, sources: list[Path]) -> set[Path]:
        for source in sources:
            validate_image_path(source)
        if len(sources) < 2:
            return set()
        dif = difPy.build(
            [str(source) for source in sources], recursive=False, limit_extensions=False
        )
        search = difPy.search(dif)
        duplicates: set[Path] = set()
        for duplicate_group in search.result.values():
            for entry in duplicate_group:
                duplicates.add(Path(entry[0]).resolve())
        return duplicates
