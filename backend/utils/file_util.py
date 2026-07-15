from __future__ import annotations

import os
import shutil
from pathlib import Path
from tempfile import NamedTemporaryFile

from PIL import Image, UnidentifiedImageError

from config.image_formats import SUPPORTED_INPUT_EXTENSIONS
from config.settings import MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS
from core.exceptions import InvalidPathError, ProcessingError

Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS


def validate_directory(path: Path, *, create: bool = False) -> Path:
    if create:
        path.mkdir(parents=True, exist_ok=True)
    if not path.is_dir():
        raise InvalidPathError(f"Directory does not exist: {path}")
    return path.resolve()


def validate_image_path(file_path: Path) -> Path:
    if not file_path.is_file():
        raise InvalidPathError(f"Image does not exist: {file_path}")
    if file_path.suffix.casefold() not in SUPPORTED_INPUT_EXTENSIONS:
        raise InvalidPathError(f"Unsupported image extension: {file_path.suffix}")
    size = file_path.stat().st_size
    if size > MAX_IMAGE_BYTES:
        raise InvalidPathError(
            f"Image exceeds {MAX_IMAGE_BYTES // (1024 * 1024)} MiB limit: {file_path.name}"
        )
    try:
        with Image.open(file_path) as image:
            if image.width * image.height > MAX_IMAGE_PIXELS:
                raise InvalidPathError(
                    f"Image exceeds {MAX_IMAGE_PIXELS:,} decoded pixels: {file_path.name}"
                )
            image.verify()
    except InvalidPathError:
        raise
    except (Image.DecompressionBombError, UnidentifiedImageError, OSError) as exc:
        raise InvalidPathError(f"Invalid or unsafe image {file_path.name}: {exc}") from exc
    return file_path


def is_image(file_path: Path) -> bool:
    try:
        validate_image_path(file_path)
        return True
    except InvalidPathError:
        return False


def list_images(directory: Path) -> list[Path]:
    validate_directory(directory)
    from service.manifest import sorted_files

    return sorted_files(
        path
        for path in directory.iterdir()
        if path.is_file() and path.suffix.casefold() in SUPPORTED_INPUT_EXTENSIONS
    )


def load_rgb_image(file_path: Path) -> Image.Image:
    validate_image_path(file_path)
    try:
        with Image.open(file_path) as image:
            image.load()
            return image.convert("RGB")
    except (Image.DecompressionBombError, UnidentifiedImageError, OSError) as exc:
        raise ProcessingError(f"Could not decode {file_path.name}: {exc}") from exc


def atomic_copy(source: Path, destination: Path):
    destination.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile(
        dir=destination.parent, prefix=f".{destination.name}.", delete=False
    ) as handle:
        temporary = Path(handle.name)
    try:
        shutil.copy2(source, temporary)
        os.replace(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)


def atomic_save_image(image: Image.Image, destination: Path, pil_format: str):
    destination.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile(
        dir=destination.parent,
        prefix=f".{destination.stem}.",
        suffix=destination.suffix,
        delete=False,
    ) as handle:
        temporary = Path(handle.name)
    try:
        image.save(temporary, format=pil_format)
        os.replace(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)
