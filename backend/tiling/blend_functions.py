"""blending weight functions for smooth tile merging"""
import math
import numpy as np

def linear_blend(distance: float, overlap: float):
    """
    linear gradient blending
    weight increase from 0.0 to 1.0 linearly
    """
    if overlap == 0:
        return 1.0
    return distance / (overlap - 1)

def sin_blend_fn(x: float):
    """
    chaiNNer's sine blending function
    Formula: (sin(x * π - π/2) + 1) / 2
    """
    return (math.sin(x * math.pi - math.pi / 2) + 1) / 2

def half_sin_blend(distance: float, overlap: float):
    """
    chaiNNer's half-sine blending function
    """
    if overlap == 0:
        return 1.0
    
    normalized = distance / (overlap - 1)
    compressed = min(max(normalized * 2 - 0.5, 0), 1)
    return sin_blend_fn(compressed)

def create_blend_mask(
    tile_width: int,
    tile_height: int,
    overlap: int,
    blend_fn=half_sin_blend,
    is_top_edge: bool = False,
    is_bottom_edge: bool = False,
    is_right_edge: bool = False,
    is_left_edge: bool = False
):
    """
    Create 2D weight mask for tile blending.
    Edges at image boundaries don't get blended (full weight)
    Internal edges get gradual blending based on blend_fn
    
    Returns: 2D numpy array of weights (0.0 to 1.0)
    """
    
    # start with full contribution
    mask = np.ones((tile_height, tile_width), dtype=np.float32)
    
    if overlap <= 1:
        return mask
    
    # apply blending gradient to each edge that overlaps another tile
    
    # top edge: blend from 0.0 to 1.0 going top to bottom
    if not is_top_edge:
        for i in range(overlap):
            weight = blend_fn(i, overlap)
            mask[i, :] *= weight
            
    # bottom edge: blend from 1.0 to 0.0 approaching bottom
    if not is_bottom_edge:
        for i in range(overlap):
            weight = blend_fn(i, overlap)
            mask[-(i+1), :] *= weight
            
    # right edge: blend from 1.0 to 0.0 approaching right edge
    if not is_right_edge:
        for i in range(overlap):
            weight = blend_fn(i, overlap)
            mask[:, -(i+1)] *= weight
    
    # left edge: blend from 0.0 to 1.0 going left to right
    if not is_left_edge:
        for i in range(overlap):
            weight = blend_fn(i, overlap)
            mask[:, i] *= weight
    
    return mask