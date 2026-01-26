from spandrel import ModelLoader
from pathlib import Path
from PIL import Image
from typing import Optional, Callable, Awaitable
import torch
import torchvision.transforms as transforms
import numpy as np
import asyncio
from tiler import Tiler, Merger
from config.image_formats import SUPPORTED_OUTPUT_FORMATS, SUPPORTED_INPUT_EXTENSIONS

# Type alias for async progress callback
ProgressCallback = Callable[[int, int, str], Awaitable[None]]

class ImageUpscaleService:
    
    def __init__(self, device, model_path: Path, tile_size: int = 512, tile_overlap: int = 16):
        self.model_path = model_path
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
        
        #cleanup
        del tile_tensor, result
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        
        return output_img
        
    
    def upscale_with_tiler(self, image: Image.Image, progress_callback: Optional[Callable[[int, int], None]] = None):
        img_array = np.array(image)
        
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
        
        total_tiles = len(tiler)
        
        for tile_id, tile in tiler(img_array):
            tile_img = Image.fromarray(tile.astype(np.uint8))
            tile_upscaled = self._process_tile(tile_img)
            upscaled_array = np.array(tile_upscaled)
            merger.add(tile_id, upscaled_array)
            
            if progress_callback:
                progress_callback(tile_id + 1, total_tiles)
        
        result = merger.merge(unpad=True)
        result = np.clip(result, 0, 255)
        result_img = Image.fromarray(result.astype(np.uint8))
        
        return result_img
    
    async def upscale_images(
        self,
        load_path: Path,
        save_path: Path,
        output_format: str = "jpg",
        use_tiling: bool = True,
        progress_callback: Optional[ProgressCallback] = None
    ):
        save_path.mkdir(parents=True, exist_ok=True)
        
        files = [f for f in load_path.iterdir() 
                if f.is_file() and f.suffix.lower() in SUPPORTED_INPUT_EXTENSIONS]
        
        format_info = SUPPORTED_OUTPUT_FORMATS[output_format.lower()]
        total = len(files)
        
        print(f"\nFound {total} images to process")
        print("=" * 60)
        
        for idx, img_file in enumerate(files, 1):
            if progress_callback:
                await progress_callback(idx, total, f"Upscaling {img_file.name}")
            
            print(f"\nProcessing: {img_file.name}")
            
            # Run CPU/GPU-bound work in executor
            loop = asyncio.get_event_loop()
            image = await loop.run_in_executor(None, Image.open, img_file)
            
            # Convert color mode if needed
            if image.mode == "RGBA":
                print("Converting RGBA to RGB")
                image = image.convert('RGB')
            elif image.mode != "RGB":
                image = image.convert('RGB')
            
            if use_tiling:
                output = await loop.run_in_executor(None, self.upscale_with_tiler, image)
            else:
                print("Direct upscaling (no tiling)")
                output = await loop.run_in_executor(None, self._direct_upscale, image)
            
            out_path = save_path / (img_file.stem + format_info["extension"])
            await loop.run_in_executor(None, output.save, out_path, format_info["pil_format"])
            print(f"Saved: {out_path}")
        
        print("\n" + "=" * 60)
        print(f"Complete! Processed {total} images")
    
    def _direct_upscale(self, image: Image.Image):
        to_tensor = transforms.ToTensor()
        img_tensor = to_tensor(image).unsqueeze(0).to(self.device)
        
        with torch.no_grad():
            result = self.model(img_tensor)
        
        to_pil = transforms.ToPILImage()
        output = to_pil(result.cpu().squeeze(0))
        
        # Explicit cleanup
        del img_tensor, result
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        
        return output
    
    def cleanup(self):
        if hasattr(self, 'model') and self.model is not None:
            del self.model
            self.model = None
        
        if torch.cuda.is_available():
            torch.cuda.empty_cache()