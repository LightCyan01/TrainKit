"""
splits large images into overlapping tiles.
based on chaiNNer's optimal tile size calculation to prevent uneven tiles.
"""
import math
from PIL import Image
from .models import Tile, Region


class TileSplitter:
    """
    Splits images into memory-efficient overlapping tiles.
    """

    def __init__(self, tile_size: int = 512, overlap: int = 16):
        self.max_tile_size = tile_size
        self.overlap = overlap
    
    def calculate_optimal_tile_size(self, width: int, height: int):
        # Calculate how many tiles needed in each direction
        tile_count_x = math.ceil(width / self.max_tile_size)
        tile_count_y = math.ceil(height / self.max_tile_size)
        
        # Distribute image evenly across tiles
        optimal_x = math.ceil(width / tile_count_x)
        optimal_y = math.ceil(height / tile_count_y)
        
        return optimal_x, optimal_y
    
    def split(self, image: Image.Image):
        
        width, height = image.size
        tile_w, tile_h = self.calculate_optimal_tile_size(width, height)
        
        # Image boundary for intersection checks
        img_region = Region(0, 0, width, height)
        
        tiles = []
        
        # Step size: tile size minus overlap
        # This creates the overlapping pattern
        step_x = tile_w - self.overlap
        step_y = tile_h - self.overlap
        
        # Generate tiles row by row
        for y in range(0, height, step_y):
            for x in range(0, width, step_x):
                # Create base tile region
                tile_region = Region(x, y, tile_w, tile_h)
                
                # Clip to image boundaries (for edge tiles)
                tile_region = tile_region.intersect(img_region)
                
                # Calculate padding for overlap
                # ChaiNNer's approach: img_region.child_padding(tile).min(overlap)
                pad = img_region.child_padding(tile_region).min(self.overlap)
                
                padded_region = tile_region.add_padding(pad)
                
                tile_img = image.crop((
                    padded_region.x,
                    padded_region.y,
                    padded_region.x + padded_region.width,
                    padded_region.y + padded_region.height
                ))
                
                tiles.append(Tile(
                    image=tile_img,
                    region=tile_region,
                    x=tile_region.x,
                    y=tile_region.y,
                    padding=pad
                ))
        
        return tiles
