from pathlib import Path

from fastapi import APIRouter, Depends

from core.dependencies import get_job_manager, get_service_manager
from core.jobs import JobManager
from models import JobResponse, TagRequest

router = APIRouter(tags=["tagging"])


@router.post("/tag", response_model=JobResponse, status_code=202)
async def tag_images(
    request: TagRequest,
    jobs: JobManager = Depends(get_job_manager),
    services=Depends(get_service_manager),
):
    async def run(context):
        service = services.get_tag_service(Path(request.tag_model_path))
        return await service.process(request, context)

    return await jobs.start("tag", run)
