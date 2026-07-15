SUPPORTED_INPUT_EXTENSIONS: set[str] = {".png", ".jpg", ".jpeg", ".bmp", ".webp"}

SUPPORTED_OUTPUT_FORMATS: dict[str, dict[str, str]] = {
    "jpg": {"name": "JPEG", "extension": ".jpg", "pil_format": "JPEG"},
    "png": {"name": "PNG", "extension": ".png", "pil_format": "PNG"},
    "bmp": {"name": "Bitmap", "extension": ".bmp", "pil_format": "BMP"},
    "webp": {"name": "WebP", "extension": ".webp", "pil_format": "WEBP"},
}


def get_supported_format() -> list[dict[str, str]]:
    return [
        {"value": key, "label": info["name"], "extension": info["extension"]}
        for key, info in SUPPORTED_OUTPUT_FORMATS.items()
    ]
