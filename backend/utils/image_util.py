import torch
from pathlib import Path
from PIL import Image

def get_device() -> torch.device:
    return torch.device('cuda' if torch.cuda.is_available() else 'cpu')

def convert_to_rgb(image_path: Path) -> Image.Image:
    image = Image.open(image_path)
    
    if image.mode != "RGB":
        image = image.convert('RGB')
    
    return image

