from typing import Dict, Set, List

SUPPORTED_INPUT_EXTENSIONS: Set[str] = {
    '.png', '.jpg', '.bmp', '.tiff', '.webp'
}

SUPPORTED_OUTPUT_FORMATS: Dict[str, Dict[str, str]] = {
    "jpg": {"name": "JPEG", "extension": ".jpg", "pil_format": "JPEG"},
    "png": {"name": "PNG", "extension": ".png", "pil_format": "PNG"},
    "bmp": {"name": "Bitmap", "extension": ".bmp", "pil_format": "BMP"},
    "tiff": {"name": "TIFF", "extension": ".tiff", "pil_format": "TIFF"},
    "webp": {"name": "WebP", "extension": ".webp", "pil_format": "WEBP"}
}

def get_supported_format() -> List[Dict[str, str]]:
    return [
        {"value": key, "label":info["name"], "extension": info["extension"]}
        for key, info in SUPPORTED_OUTPUT_FORMATS.items()
    ]