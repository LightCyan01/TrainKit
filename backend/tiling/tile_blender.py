"""
merges processed tiles with smooth blending.
based on chaiNNer's directional blending approach.
"""
import numpy as np
from typing import List
from PIL import Image
from .models import Tile
from .blend_functions import create_blend_mask, half_sin_blend

class TileBlender:
    """
    Merges upscaled tiles with seamless blending.
    Uses chaiNNer's two-stage blending approach:
    1. Blend tiles horizontally into rows (BlendDirection.X)
    2. Blend rows vertically into final image (BlendDirection.Y)
    """
    
    def __init__(self, overlap: int = 16, scale: int = 1, blend_fn=half_sin_blend):
        self.overlap = overlap
        self.scale = scale
        self.blend_fn = blend_fn
    
    def merge(self, tiles: List[Tile], original_width: int, original_height: int):
        """
        Merge tiles into final image with blending.
        """
        out_w = original_width * self.scale
        out_h = original_height * self.scale
        overlap_scaled = self.overlap * self.scale
        
        # Accumulators
        # output: accumulates weighted pixel values
        # weights: tracks total weight at each pixel
        output = np.zeros((out_h, out_w, 3), dtype=np.float32)
        weights = np.zeros((out_h, out_w), dtype=np.float32)
        
        for tile in tiles:
            # Position and size in output image (scaled)
            x = tile.x * self.scale
            y = tile.y * self.scale
            region_w = tile.region.width * self.scale
            region_h = tile.region.height * self.scale
            
            # The tile image includes padding/overlap
            tile_img = tile.image
            
            # Determine edge positions
            # Tiles at image boundaries don't blend on those edges
            is_left = (tile.x == 0)
            is_top = (tile.y == 0)
            is_right = (tile.x + tile.region.width >= original_width)
            is_bottom = (tile.y + tile.region.height >= original_height)
            
            # Create blending mask for the region size
            mask = create_blend_mask(
                region_w, region_h, overlap_scaled, 
                self.blend_fn,
                is_top_edge=is_top,
                is_bottom_edge=is_bottom,
                is_right_edge=is_right,
                is_left_edge=is_left
            )
            
            # Convert tile to numpy array
            tile_arr = np.array(tile_img, dtype=np.float32)
            
            # The tile image may have padding - we need to crop it to match the region
            # Calculate padding that was added
            tile_w_scaled = tile_img.width
            tile_h_scaled = tile_img.height
            
            # Padding is the difference between tile image size and region size
            pad_left = (tile_w_scaled - region_w) // 2 if not is_left else 0
            pad_top = (tile_h_scaled - region_h) // 2 if not is_top else 0
            
            # Crop the tile array to match the region size
            tile_arr_cropped = tile_arr[
                pad_top:pad_top+region_h,
                pad_left:pad_left+region_w,
                :
            ]
            
            # Add weighted contribution to output
            # In non-overlap regions, mask = 1.0, so full contribution
            # In overlap regions, mask varies, creating blend
            for c in range(3):
                try:
                    output[y:y+region_h, x:x+region_w, c] += tile_arr_cropped[:, :, c] * mask
                except ValueError as e:
                    print(f"ERROR at tile ({tile.x}, {tile.y}):")
                    print(f"  x={x}, y={y}, region_w={region_w}, region_h={region_h}")
                    print(f"  Slice would be output[{y}:{y+region_h}, {x}:{x+region_w}, {c}]")
                    print(f"  output.shape={output.shape}")
                    print(f"  tile_arr_cropped[:,:,{c}].shape={tile_arr_cropped[:,:,c].shape}")
                    print(f"  mask.shape={mask.shape}")
                    print(f"  Actual slice shape: {output[y:y+region_h, x:x+region_w, c].shape}")
                    raise
            
            # Track total weight at each pixel
            weights[y:y+region_h, x:x+region_w] += mask
        
        # Normalize: divide accumulated colors by total weights
        # ChaiNNer does this via their _fast_mix function
        # Example: If two tiles overlap with weights 0.3 and 0.7:
        #   output = color1 * 0.3 + color2 * 0.7
        #   weights = 0.3 + 0.7 = 1.0
        #   final = output / weights = (color1 * 0.3 + color2 * 0.7) / 1.0
        for c in range(3):
            output[:, :, c] /= np.maximum(weights, 1e-6)
        
        # Convert to 8-bit image
        output = np.clip(output, 0, 255).astype(np.uint8)
        return Image.fromarray(output)
