"""data models for tiling operations"""
"""based on chaiNNer's region and tileoverlap structures"""
from dataclasses import dataclass
from PIL import Image
import numpy as np

@dataclass
class Region:
    """Rectangular region in an image"""
    x: int
    y: int
    width: int
    height:int
    
    def intersect(self, other: 'Region'):
        """
        Get the intersection of two regions.
        Ensures tiles don't extend beyond image boundaries.
        """
        x1 = max(self.x, other.x)
        y1 = max(self.y, other.y)
        x2 = min(self.x + self.width, other.x + other.width)
        y2 = min(self.y + self.height, other.y + other.height)
        return Region(x1, y1, max(0, x2 - x1), max(0, y2 - y1))
    
    def add_padding(self, padding: 'Padding'):
        """
        Expand this region by adding padding on all sides.
        Used to create overlap between tiles.
        """
        return Region(
            x=self.x - padding.left,
            y=self.y - padding.top,
            width=self.width + padding.left + padding.right,
            height=self.height + padding.top + padding.bottom
        )
    
    def child_padding(self, child: 'Region'):
        """
        Calculate how much padding a child region has relative to this region.
        Used to determine overlap amounts for tiles.
        """
        return Padding(
            top=child.y - self.y,
            bottom=(self.y + self.height) - (child.y + child.height),
            left=child.x - self.x,
            right=(self.x + self.width) - (child.x + child.width)
        )
    
    def read_from(self, img: np.ndarray) -> np.ndarray:
        """Extract this region from an image array"""
        return img[self.y:self.y+self.height, self.x:self.x+self.width, ...]
    
@dataclass
class Padding:
    """Padding amounts for each side"""
    top: int
    bottom: int
    left: int
    right: int
    
    def min(self, max_padding: int):
        """
        Limit padding to a maximum value.
        Prevents overlap from being larger than necessary.
        """
        return Padding(
            top=min(self.top, max_padding),
            bottom=min(self.bottom, max_padding),
            left=min(self.left, max_padding),
            right=min(self.right, max_padding)
        )

@dataclass
class TileOverlap:
    """
    ChaiNNer's structure for tracking overlap on a single axis.
    Start overlap is on the leading edge, end overlap is on the trailing edge.
    """
    start: int  # Overlap at the start (left for X, top for Y)
    end: int    # Overlap at the end (right for X, bottom for Y)
    
    @property
    def total(self) -> int:
        """Total overlap amount"""
        return self.start + self.end
    
@dataclass
class Tile:
    """
    A tile with image data and position
    used to track tiles during split -> process -> merge
    """
    image: Image.Image
    region: Region
    x: int #x pos of orig image
    y: int #y pos of orig image
    padding: Padding = None