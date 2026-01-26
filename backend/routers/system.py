from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from core import get_connection_manager, get_service_manager, ConnectionManager
from service.service_manager import ServiceManager
from utils.image_util import get_device

router = APIRouter(prefix="", tags=["system"])

@router.get("/health")
async def health():
    return {"status": "ok"}

@router.get("/device")
async def device():
    device_info = get_device()
    return {"device": str(device_info)}

@router.post("/cancel")
async def cancel(
    manager: ConnectionManager = Depends(get_connection_manager),
    service_manager: ServiceManager = Depends(get_service_manager),
):
    try:
        await manager.send_log("warning", "Cancelling operation and cleaning up...", "backend")
        service_manager.cleanup()
        await manager.send_log("info", "Cleanup complete", "backend")
        return {"status": "cancelled"}
    except Exception as e:
        await manager.send_log("error", f"Cleanup error: {str(e)}", "backend")
        return {"error": str(e)}

@router.websocket("/ws/progress")
async def websocket_progress(
    websocket: WebSocket,
    manager: ConnectionManager = Depends(get_connection_manager),
):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)


# future ncnn integration point:
# @router.get("/ncnn/status")
