from fastapi import APIRouter, Depends
from pathlib import Path
from pydantic import BaseModel
from models import UpscaleRequest
from core import get_connection_manager, get_service_manager, ConnectionManager
from service.service_manager import ServiceManager
from spandrel import ModelLoader

router = APIRouter(prefix="", tags=["upscale"])

class ModelInfoRequest(BaseModel):
    model_path: str

@router.post("/upscale-model-info")
async def get_model_info(request: ModelInfoRequest):
    try:
        model_path = Path(request.model_path)
        if not model_path.exists():
            return {"error": "Model file not found"}
        
        loader = ModelLoader()
        model_descriptor = loader.load_from_file(model_path)
        
        scale = model_descriptor.scale
        architecture = model_descriptor.architecture.name if hasattr(model_descriptor, 'architecture') else "Unknown"
        
        #just get the info
        del model_descriptor
        
        return {
            "scale": scale,
            "architecture": architecture,
            "name": model_path.name,
        }
    except Exception as e:
        return {"error": str(e)}

@router.post("/upscale")
async def upscale(
    request: UpscaleRequest,
    manager: ConnectionManager = Depends(get_connection_manager),
    service_manager: ServiceManager = Depends(get_service_manager),
):
    try:
        await manager.send_log("info", f"Loading upscale model from {request.upscale_model_path}", "backend")
        
        # Future: Add backend selection for NCNN
        service = service_manager.get_upscale_service(
            model_path=Path(request.upscale_model_path)
        )
        
        async def progress(current: int, total: int, msg: str):
            await manager.send_progress(current, total, msg)
            await manager.send_log("info", msg, "backend")
        
        await service.upscale_images(
            load_path=Path(request.load_path),
            save_path=Path(request.save_path),
            output_format=request.format,
            use_tiling=request.use_tiling,
            progress_callback=progress
        )
        
        await manager.send_log("success", "Upscaling complete!", "backend")
        return {"status": "Upscaling complete!"}
    except Exception as e:
        await manager.send_log("error", str(e), "backend")
        return {"error": str(e)}


# future ncnn integration point:
# @router.post("/upscale/ncnn")
