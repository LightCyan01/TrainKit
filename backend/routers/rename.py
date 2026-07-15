from fastapi import APIRouter, Depends

from core.dependencies import get_job_manager, get_rename_service
from core.jobs import JobManager
from models import JobResponse, RenameRequest

router = APIRouter(tags=["rename"])


@router.post("/rename", response_model=JobResponse, status_code=202)
async def rename(
    request: RenameRequest,
    jobs: JobManager = Depends(get_job_manager),
    service=Depends(get_rename_service),
):
    service.clear_cache()

    async def run(context):
        return await service.process(request, context)

    return await jobs.start("rename", run)
