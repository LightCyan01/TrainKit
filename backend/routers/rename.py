from fastapi import APIRouter, Depends
from pathlib import Path
from models import RenameRequest
from core import get_connection_manager, get_rename_service, ConnectionManager
from service.image_rename import RenameService

router = APIRouter(prefix="", tags=["rename"])

@router.post("/rename")
async def rename(
    request: RenameRequest,
    manager: ConnectionManager = Depends(get_connection_manager),
    rename_service: RenameService = Depends(get_rename_service),
):
    load_path = Path(request.load_path)
    save_path = Path(request.save_path)
    
    rename_service.clear_cache()
    
    async def progress(current: int, total: int, msg: str):
        await manager.send_progress(current, total, msg)
        await manager.send_log("info", msg, "backend")
    
    try:
        await manager.send_log("info", f"Starting rename operation: {request.mode}", "backend")
        
        if request.mode == "sequential":
            await rename_service.rename_sequential(
                load_path, save_path, 
                skip_duplicates=request.skip_duplicates,
                progress_callback=progress
            )
        elif request.mode == "stem_sequential":
            await rename_service.rename_stem_sequential(
                load_path, save_path,
                skip_duplicates=request.skip_duplicates,
                progress_callback=progress
            )
        else:
            return {"error": "Invalid mode. Use 'sequential' or 'stem_sequential'"}
        
        await manager.send_log("success", "Rename complete!", "backend")
        return {"status": "Rename complete!"}
    except Exception as e:
        await manager.send_log("error", str(e), "backend")
        return {"error": str(e)}
