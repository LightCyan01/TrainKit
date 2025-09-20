from PIL import Image

def is_image(file_path):
    try:
        with Image.open(file_path) as img:
            img.verify()
            return True
    except Exception:
        return False