from pathlib import Path

from PIL import Image

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
