from fastapi import APIRouter, Depends
from pathlib import Path
from models import CaptionRequest, PreloadRequest, ModelStatusRequest
from core import get_connection_manager, get_service_manager, ConnectionManager
from service.service_manager import ServiceManager

router = APIRouter(prefix="", tags=["caption"])

@router.post("/caption")
async def caption(
    request: CaptionRequest,
    manager: ConnectionManager = Depends(get_connection_manager),
    service_manager: ServiceManager = Depends(get_service_manager),
):
    try:
        await manager.send_log("info", f"Loading caption model from {request.caption_model_path}", "backend")
        
        service = service_manager.get_caption_service(
            model_path=Path(request.caption_model_path)
        )
        
        async def progress(current: int, total: int, msg: str):
            await manager.send_progress(current, total, msg)
            await manager.send_log("info", msg, "backend")
        
        await service.caption_images(
            load_path=Path(request.load_path),
            save_path=Path(request.save_path),
            prompt=request.prompt,
            progress_callback=progress
        )
        
        await manager.send_log("success", "Captioning complete!", "backend")
        return {"status": "Captioning complete!"}
    except Exception as e:
        await manager.send_log("error", str(e), "backend")
        return {"error": str(e)}

@router.post("/preload")
async def preload_model(
    request: PreloadRequest,
    manager: ConnectionManager = Depends(get_connection_manager),
    service_manager: ServiceManager = Depends(get_service_manager),
):
    try:
        model_path = Path(request.model_path)
        
        if not model_path.exists():
            return {"error": "Model path does not exist"}
        
        await manager.send_log("info", f"Preloading caption model from {model_path}...", "backend")
        
        async def progress(current: int, total: int, msg: str):
            await manager.send_progress(current, total, msg)
            await manager.send_log("info", msg, "backend")
        
        result = await service_manager.preload_caption_model(model_path, progress)
        
        await manager.send_log("success", f"Model preloaded! Using {result.get('gpu_memory_allocated_gb', 0):.2f} GB GPU memory", "backend")
        
        return result
    except Exception as e:
        await manager.send_log("error", f"Failed to preload model: {str(e)}", "backend")
        return {"error": str(e)}

@router.post("/model-status")
async def model_status(
    request: ModelStatusRequest,
    service_manager: ServiceManager = Depends(get_service_manager),
):
    try:
        model_path = Path(request.model_path)
        is_loaded = service_manager.is_caption_model_loaded(model_path)
        memory_info = service_manager.get_gpu_memory_usage()
        
        return {
            "is_loaded": is_loaded,
            "model_path": str(model_path),
            **memory_info
        }
    except Exception as e:
        return {"error": str(e), "is_loaded": False}

@router.post("/unload")
async def unload_model(
    manager: ConnectionManager = Depends(get_connection_manager),
    service_manager: ServiceManager = Depends(get_service_manager),
):
    try:
        await manager.send_log("info", "Unloading caption model...", "backend")
        
        memory_info = service_manager.unload_caption_model()
        
        await manager.send_log("success", "Caption model unloaded from GPU memory", "backend")
        
        return {
            "status": "unloaded",
            **memory_info
        }
    except Exception as e:
        await manager.send_log("error", f"Failed to unload model: {str(e)}", "backend")
        return {"error": str(e)}
