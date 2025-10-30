from spandrel import ModelLoader
from pathlib import Path
from PIL import Image
import torch
import torchvision.transforms as transforms
from config.image_formats import SUPPORTED_OUTPUT_FORMATS, SUPPORTED_INPUT_EXTENSIONS
from tiling import TileSplitter, TileBlender, Tile

class ImageUpscaleService:
    def __init__(self, device, model_path: Path="", load_path: Path="", save_path: Path ="", format:str = "jpg", tile_size: int = 512, tile_overlap:int = 16):
        self.load_path = load_path
        self.save_path = save_path
        self.format = format
        self.device = device
        
        loader = ModelLoader()
        model_descriptor = loader.load_from_file(model_path)
        self.model = model_descriptor.model.to(device).eval()
        self.scale = model_descriptor.scale
        
        self.splitter = TileSplitter(tile_size=tile_size, overlap=tile_overlap)
        self.blender = TileBlender(overlap=tile_overlap, scale=self.scale)
        
        print(f"Model: {model_path.name}")
        print(f"Scale: {self.scale}x")
        print(f"Tiling: {tile_size}px tiles with {tile_overlap}px overlap")
        print(f"Tiling support: {model_descriptor.tiling}")
        
    
    def process_tile(self, tile: Tile):
        to_tensor = transforms.ToTensor()
        tile_tensor = to_tensor(tile.image).unsqueeze(0).to(self.device)
        
        with torch.no_grad():
            result = self.model(tile_tensor)
        
        to_pil = transforms.ToPILImage()
        output_img = to_pil(result.cpu().squeeze(0))
        
        del tile_tensor, result
        torch.cuda.empty_cache()
        
        return Tile(
            image=output_img,
            region=tile.region,
            x=tile.x,
            y=tile.y
        )
        
    def upscale_tiled(self, image: Image.Image):
        print(f"Input: {image.width}x{image.height}")
        
        tiles = self.splitter.split(image)
        print(f"Split into {len(tiles)} tiles")
        
        processed = []
        for i, tile in enumerate(tiles):
            print(f"Processing tile {i+1}/{len(tiles)}...", end='\r')
            processed.append(self.process_tile(tile))
        print()
        
        # Merge tiles with blending
        print("Merging tiles with blending...")
        result = self.blender.merge(processed, image.width, image.height)
        print(f"Output: {result.width}x{result.height}")
        
        return result
    
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
            
            if use_tiling:
                output = self.upscale_tiled(image)
            else:
                print("Direct upscaling (no tiling)")
                output = self._direct_upscale(image)
            
            out_path = self.save_path / (img_file.stem + format_info["extension"])
            output.save(out_path, format=format_info["pil_format"])
            print(f"Saved: {out_path}")
        
        print("\n" + "=" * 60)
        print(f"Complete! Processed {len(files)} images")

    def _direct_upscale(self, image: Image.Image) -> Image.Image:
        
        to_tensor = transforms.ToTensor()
        img_tensor = to_tensor(image).unsqueeze(0).to(self.device)
        
        with torch.no_grad():
            result = self.model(img_tensor)
        
        to_pil = transforms.ToPILImage()
        output = to_pil(result.cpu().squeeze(0))
        
        del img_tensor, result
        torch.cuda.empty_cache()
        
        return output