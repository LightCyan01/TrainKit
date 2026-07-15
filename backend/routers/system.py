from __future__ import annotations

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect

from config.image_formats import SUPPORTED_INPUT_EXTENSIONS, get_supported_format
from config.settings import APP_VERSION
from core.dependencies import get_connection_manager, get_job_manager
from core.jobs import JobManager
from core.websocket import ConnectionManager

router = APIRouter(tags=["system"])


@router.get("/health")
async def health():
    return {"status": "ok", "version": APP_VERSION}


@router.get("/device")
async def device():
    from utils.image_util import get_device

    return {"device": str(get_device())}


@router.get("/capabilities")
async def capabilities():
    return {
        "version": APP_VERSION,
        "input_extensions": sorted(SUPPORTED_INPUT_EXTENSIONS),
        "output_formats": get_supported_format(),
        "collision_policies": ["fail", "skip", "overwrite", "rename"],
        "caption_adapters": ["auto", "multimodal", "blip", "instructblip"],
        "upscale_backends": ["spandrel", "ncnn"],
        "operations": ["caption", "upscale", "rename", "tag"],
    }


@router.get("/jobs")
async def list_jobs(jobs: JobManager = Depends(get_job_manager)):
    return {"jobs": jobs.list()}


@router.get("/jobs/{job_id}")
async def get_job(job_id: str, jobs: JobManager = Depends(get_job_manager)):
    return jobs.get(job_id)


@router.delete("/jobs/{job_id}")
async def cancel_job(job_id: str, jobs: JobManager = Depends(get_job_manager)):
    return await jobs.cancel(job_id)


@router.post("/cancel")
async def cancel(jobs: JobManager = Depends(get_job_manager)):
    return await jobs.cancel()


@router.websocket("/ws/events")
async def websocket_events(
    websocket: WebSocket,
    manager: ConnectionManager = Depends(get_connection_manager),
):
    if not await manager.connect(websocket):
        return
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
