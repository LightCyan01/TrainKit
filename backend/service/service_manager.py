from typing import Optional
from pathlib import Path
from .image_captioning import ImageCaptioningService
from .image_upscaling import ImageUpscaleService
from utils.image_util import get_device
import torch
import gc

class ServiceManager:
    _instance: Optional['ServiceManager'] = None
    
    def __init__(self):
        self._caption_service: Optional[ImageCaptioningService] = None
        self._caption_model_path: Optional[Path] = None
        self._caption_model_loaded: bool = False
        self._upscale_service: Optional[ImageUpscaleService] = None
        self._device = get_device()
    
    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance
    
    def get_caption_service(
        self,
        model_path: Path,
        max_new_tokens: int = 512,
        temperature: float = 0.6,
        top_p: float = 0.9,
    ) -> ImageCaptioningService:
        model_cleaned_up = (
            self._caption_service is not None and
            (self._caption_service._model is None or self._caption_service._processor is None)
        )
        
        needs_new_service = (
            self._caption_service is None or 
            self._caption_model_path != model_path or
            model_cleaned_up
        )
        
        if needs_new_service:
            if self._caption_service is not None:
                self._caption_service.cleanup()
                self._caption_model_loaded = False
            
            self._caption_service = ImageCaptioningService(
                model=model_path,
                max_new_tokens=max_new_tokens,
                temperature=temperature,
                top_p=top_p,
            )
            self._caption_model_path = model_path
        return self._caption_service
    
    async def preload_caption_model(self, model_path: Path, progress_callback=None) -> dict:
        service = self.get_caption_service(model_path)
        await service._load_model_async(progress_callback)
        self._caption_model_loaded = True
        
        # Get memory usage
        memory_info = self.get_gpu_memory_usage()
        return {
            "status": "loaded",
            "model_path": str(model_path),
            **memory_info
        }
    
    def is_caption_model_loaded(self, model_path: Path = None) -> bool:
        if model_path is not None:
            return (
                self._caption_model_loaded and 
                self._caption_model_path == model_path and
                self._caption_service is not None and
                self._caption_service._model is not None and
                self._caption_service._processor is not None
            )
        return (
            self._caption_model_loaded and 
            self._caption_service is not None and
            self._caption_service._model is not None and
            self._caption_service._processor is not None
        )
    
    def unload_caption_model(self) -> dict:
        if self._caption_service is not None:
            self._caption_service.cleanup()
            del self._caption_service
            self._caption_service = None
        
        self._caption_model_loaded = False
        self._caption_model_path = None
        
        # Force garbage collection
        gc.collect()
        
        # Clear GPU cache
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            torch.cuda.synchronize()
        
        return self.get_gpu_memory_usage()
    
    def get_gpu_memory_usage(self) -> dict:
        if torch.cuda.is_available():
            allocated = torch.cuda.memory_allocated() / (1024 ** 3)  # GB
            reserved = torch.cuda.memory_reserved() / (1024 ** 3)  # GB
            total = torch.cuda.get_device_properties(0).total_memory / (1024 ** 3)
            return {
                "gpu_memory_allocated_gb": round(allocated, 2),
                "gpu_memory_reserved_gb": round(reserved, 2),
                "gpu_memory_total_gb": round(total, 2)
            }
        return {"gpu_memory_allocated_gb": 0, "gpu_memory_reserved_gb": 0, "gpu_memory_total_gb": 0}
    
    def get_upscale_service(
        self,
        model_path: Path,
        tile_size: int = 512,
        tile_overlap: int = 16,
    ) -> ImageUpscaleService:
        needs_new_service = (
            self._upscale_service is None or 
            self._upscale_service.model_path != model_path or
            self._upscale_service.model is None
        )
        
        if needs_new_service:
            if self._upscale_service is not None:
                self._upscale_service.cleanup()
            
            self._upscale_service = ImageUpscaleService(
                device=self._device,
                model_path=model_path,
                tile_size=tile_size,
                tile_overlap=tile_overlap,
            )
        return self._upscale_service
    
    def cleanup(self):
        if self._caption_service:
            self._caption_service.cleanup()
            self._caption_service = None
            self._caption_model_loaded = False
        if self._upscale_service:
            self._upscale_service.cleanup()
            self._upscale_service = None
    
    @classmethod
    def reset(cls):
        if cls._instance:
            cls._instance.cleanup()
            cls._instance = None
