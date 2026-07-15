from pathlib import Path

import torch
from PIL import Image

from utils.file_util import load_rgb_image


def get_device() -> torch.device:
    return torch.device("cuda" if torch.cuda.is_available() else "cpu")


def convert_to_rgb(image_path: Path) -> Image.Image:
    return load_rgb_image(image_path)
