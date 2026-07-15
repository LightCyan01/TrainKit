from __future__ import annotations

import asyncio
from types import SimpleNamespace

from fastapi import APIRouter, Depends

from core.dependencies import get_job_manager, get_service_manager
from core.jobs import JobManager
from models import JobResponse, ModelInfoRequest, UpscaleRequest

router = APIRouter(tags=["upscale"])


def _info_request(request: ModelInfoRequest):
    return SimpleNamespace(
        backend=request.backend,
        upscale_model_path=request.model_path,
        ncnn_model_bin_path=request.model_bin_path,
        ncnn_input_blob=request.input_blob,
        ncnn_output_blob=request.output_blob,
        ncnn_scale=request.scale,
        ncnn_use_vulkan=request.use_vulkan,
        tile_size=512,
        tile_overlap=16,
    )


@router.post("/upscale-model-info")
async def get_model_info(
    request: ModelInfoRequest,
    jobs: JobManager = Depends(get_job_manager),
    services=Depends(get_service_manager),
):
    async with jobs.reserve("upscale model inspection"):
        service = await asyncio.to_thread(services.get_upscale_service, _info_request(request))
        return service.info


@router.post("/upscale", response_model=JobResponse, status_code=202)
async def upscale(
    request: UpscaleRequest,
    jobs: JobManager = Depends(get_job_manager),
    services=Depends(get_service_manager),
):
    async def run(context):
        if request.dry_run:
            from service.image_upscaling import prepare_upscale_manifest

            _manifest, output_manifest, _format = await prepare_upscale_manifest(request, context)
            return output_manifest
        service = await asyncio.to_thread(services.get_upscale_service, request)
        return await service.process(request, context)

    return await jobs.start("upscale", run)
