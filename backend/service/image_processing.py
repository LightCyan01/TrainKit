from spandrel import ModelLoader
from pathlib import Path
from PIL import Image
import torch
import torchvision.transforms as transforms
from config.image_formats import SUPPORTED_OUTPUT_FORMATS, SUPPORTED_INPUT_EXTENSIONS, get_supported_format

class ImageService():
    def __init__(self, model_path, device):
        loader = ModelLoader()
        model = loader.load_from_file(model_path)
        self.model = model.to(device).eval()
        
    @staticmethod
    def get_supported_output_formats():
        return get_supported_format()
        
    
    def upscale(self, images_path: str, save_path: str, format: str = "jpg"):
        images_path = Path(images_path)
        save_path = Path(save_path)
        
        image_files = [f for f in images_path.iterdir() if f.is_file() and f.suffix.lower() in SUPPORTED_INPUT_EXTENSIONS]
        format_info = SUPPORTED_OUTPUT_FORMATS[format.lower()]
        
        for image_file in image_files:
            image = Image.open(image_file)
        
            if image.mode == "RGBA":
                image = image.convert('RGB')
        
         
            to_tensor = transforms.ToTensor()
            image_tensor = to_tensor(image).unsqueeze(0).to(self.model.device)
        
            with torch.no_grad():
                result = self.model(image_tensor)
            
            to_pil = transforms.ToPILImage()
            output_image = to_pil(result.cpu().squeeze(0))
        
            file_name = image_file.stem + "_upscaled" + format_info["extension"]
            output_image.save(save_path / file_name, format=format_info["pil_format"])
