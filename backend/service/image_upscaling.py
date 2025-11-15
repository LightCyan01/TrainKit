from spandrel import ModelLoader
from pathlib import Path
from PIL import Image
import torch
import torchvision.transforms as transforms
import numpy as np
from tiler import Tiler, Merger
from config.image_formats import SUPPORTED_OUTPUT_FORMATS, SUPPORTED_INPUT_EXTENSIONS

class ImageUpscaleService:
    def __init__(self, device, model_path: Path, load_path: Path, save_path: Path, format:str = "jpg", tile_size: int = 512, tile_overlap:int = 16):
        self.load_path = load_path
        self.save_path = save_path
        self.format = format
        self.device = device
        self.tile_size = tile_size
        self.overlap = tile_overlap
        
        loader = ModelLoader()
        model_descriptor = loader.load_from_file(model_path)
        self.model = model_descriptor.model.to(device).eval()
        self.scale = model_descriptor.scale
        
        print(f"Model: {model_path.name}")
        print(f"Scale: {self.scale}x")
        print(f"Tiling: {tile_size}px tiles with {tile_overlap}px overlap")
        print(f"Tiling support: {model_descriptor.tiling}")
        
    
    def _process_tile(self, tile_pil):
        to_tensor = transforms.ToTensor()
        tile_tensor = to_tensor(tile_pil).unsqueeze(0).to(self.device)
        
        with torch.no_grad():
            result = self.model(tile_tensor)
        
        result = torch.clamp(result, 0, 1)
    
        to_pil = transforms.ToPILImage()
        output_img = to_pil(result.cpu().squeeze(0))
        
        del tile_tensor, result
        torch.cuda.empty_cache()
        
        return output_img
        
    
    def upscale_with_tiler(self, image: Image.Image):
        img_array = np.array(image)  # Shape: (H, W, 3)
        
        print(f"Input: {image.width}x{image.height}")
        
        tiler = Tiler(
            data_shape=img_array.shape,
            tile_shape=(self.tile_size, self.tile_size, 3),
            channel_dimension=2,
            overlap=self.overlap
        )
        
        output_shape = (
            img_array.shape[0] * self.scale,
            img_array.shape[1] * self.scale,
            3
        )
        
        output_tiler = Tiler(
            data_shape=output_shape,
            tile_shape=(self.tile_size * self.scale, self.tile_size * self.scale, 3),
            channel_dimension=2,
            overlap=self.overlap * self.scale
        )
        
        merger = Merger(output_tiler, window='hamming')
        
        print(f"Processing {len(tiler)} tiles...")
        
        for tile_id, tile in tiler(img_array):
            tile_img = Image.fromarray(tile.astype(np.uint8))
            tile_upscaled = self._process_tile(tile_img)
            upscaled_array = np.array(tile_upscaled)
            merger.add(tile_id, upscaled_array)
            print(f"Processed tile {tile_id + 1}/{len(tiler)}", end='\r')
        
        print()
        
        result = merger.merge(unpad=True)
        result = np.clip(result, 0, 255)
        result_img = Image.fromarray(result.astype(np.uint8))
        
        print(f"Output: {result_img.width}x{result_img.height}")
        return result_img
    
    def upscale(self, use_tiling=True):
        self.save_path.mkdir(parents=True, exist_ok=True)
        
        files = [f for f in self.load_path.iterdir() 
                if f.is_file() and f.suffix.lower() in SUPPORTED_INPUT_EXTENSIONS]
        
        format_info = SUPPORTED_OUTPUT_FORMATS[self.format.lower()]
        
        print(f"\nFound {len(files)} images to process")
        print("=" * 60)
        
        for img_file in files:
            print(f"\nProcessing: {img_file.name}")
            image = Image.open(img_file)
            
            if image.mode == "RGBA":
                print("Converting RGBA to RGB")
                image = image.convert('RGB')
            elif image.mode != "RGB":
                image = image.convert('RGB')
            
            if use_tiling:
                output = self.upscale_with_tiler(image)
            else:
                print("Direct upscaling (no tiling)")
                output = self._direct_upscale(image)
            
            out_path = self.save_path / (img_file.stem + format_info["extension"])
            output.save(out_path, format=format_info["pil_format"])
            print(f"Saved: {out_path}")
        
        print("\n" + "=" * 60)
        print(f"Complete! Processed {len(files)} images")
    
    def _direct_upscale(self, image: Image.Image):
        to_tensor = transforms.ToTensor()
        img_tensor = to_tensor(image).unsqueeze(0).to(self.device)
        
        with torch.no_grad():
            result = self.model(img_tensor)
        
        to_pil = transforms.ToPILImage()
        output = to_pil(result.cpu().squeeze(0))
        
        del img_tensor, result
        torch.cuda.empty_cache()
        
        return output