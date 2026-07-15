from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends

from core.dependencies import (
    get_connection_manager,
    get_job_manager,
    get_service_manager,
)
from core.jobs import JobManager
from core.websocket import ConnectionManager
from models import CaptionRequest, JobResponse, ModelStatusRequest, PreloadRequest

router = APIRouter(tags=["caption"])


@router.post("/caption", response_model=JobResponse, status_code=202)
async def caption(
    request: CaptionRequest,
    jobs: JobManager = Depends(get_job_manager),
    services=Depends(get_service_manager),
):
    async def run(context):
        service = services.get_caption_service(
            Path(request.caption_model_path), request.adapter, request.max_new_tokens
        )
        return await service.process(request, context)

    return await jobs.start("caption", run)


@router.post("/preload")
async def preload_model(
    request: PreloadRequest,
    manager: ConnectionManager = Depends(get_connection_manager),
    jobs: JobManager = Depends(get_job_manager),
    services=Depends(get_service_manager),
):
    async with jobs.reserve("caption model preload"):
        await manager.send_log("info", "Loading caption model", "backend")
        result = await services.preload_caption_model(Path(request.model_path), request.adapter)
        await manager.send_log("success", "Caption model loaded", "backend")
        return result


@router.post("/model-status")
async def model_status(
    request: ModelStatusRequest,
    services=Depends(get_service_manager),
):
    return {
        "is_loaded": services.is_caption_model_loaded(Path(request.model_path), request.adapter),
        "model_path": str(Path(request.model_path).resolve()),
        **services.get_gpu_memory_usage(),
    }


@router.post("/unload")
async def unload_model(
    manager: ConnectionManager = Depends(get_connection_manager),
    jobs: JobManager = Depends(get_job_manager),
    services=Depends(get_service_manager),
):
    async with jobs.reserve("caption model unload"):
        result = services.unload_caption_model()
        await manager.send_log("success", "Caption model unloaded", "backend")
        return {"status": "unloaded", **result}
