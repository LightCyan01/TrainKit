import asyncio

import pytest

from core.exceptions import ConflictError
from core.jobs import JobManager


class FakeConnections:
    def __init__(self):
        self.events = []

    async def send_job(self, job):
        self.events.append(job.copy())


@pytest.mark.asyncio
async def test_job_completes_only_after_runner_finishes():
    connections = FakeConnections()
    manager = JobManager(connections)  # type: ignore[arg-type]

    async def runner(context):
        await context.progress(0, 1, "working")
        await asyncio.sleep(0)
        await context.progress(1, 1, "written")
        return "manifest.json"

    created = await manager.start("rename", runner)
    assert created["status"] == "queued"
    await manager.tasks[created["job_id"]]
    final = manager.get(created["job_id"])
    assert final["status"] == "completed"
    assert final["message"] == "Rename completed"
    assert final["manifest_path"] == "manifest.json"


@pytest.mark.asyncio
async def test_job_cancellation_is_cooperative_and_terminal():
    connections = FakeConnections()
    manager = JobManager(connections)  # type: ignore[arg-type]
    started = asyncio.Event()

    async def runner(context):
        started.set()
        while True:
            await asyncio.sleep(0)
            context.raise_if_cancelled()

    created = await manager.start("caption", runner)
    await started.wait()
    await manager.cancel(created["job_id"])
    await manager.tasks[created["job_id"]]
    assert manager.get(created["job_id"])["status"] == "cancelled"


@pytest.mark.asyncio
async def test_model_maintenance_blocks_jobs_and_releases_reservation():
    manager = JobManager(FakeConnections())  # type: ignore[arg-type]

    async def runner(_context):
        return None

    async with manager.reserve("model preload"):
        with pytest.raises(ConflictError, match="model preload"):
            await manager.start("tag", runner)

    created = await manager.start("tag", runner)
    await manager.tasks[created["job_id"]]
    assert manager.get(created["job_id"])["status"] == "completed"
