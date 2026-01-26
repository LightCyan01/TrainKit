from PIL import Image
from pathlib import Path

def is_image(file_path: Path) -> bool:
    try:
        with Image.open(file_path) as img:
            img.verify()
        return True
    except Exception:
        return False