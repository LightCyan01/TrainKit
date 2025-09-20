import torch
from pathlib import Path
from PIL import Image

def get_device():
    return torch.device('cuda' if torch.cuda.is_available() else 'cpu')

def convert_to_rgb(image_path: Path):
    image = Image.open(image_path)
    
    if image.mode == "RGBA":
        image = image.convert('RGB')
    return image

