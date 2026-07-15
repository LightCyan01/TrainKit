from .caption import router as caption_router
from .rename import router as rename_router
from .system import router as system_router
from .tag import router as tag_router
from .upscale import router as upscale_router

__all__ = [
    "caption_router",
    "rename_router",
    "system_router",
    "tag_router",
    "upscale_router",
]
