from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from contextlib import asynccontextmanager
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from threading import Event
from typing import Any
from uuid import uuid4

from core.exceptions import ConflictError, JobCancelledError, TrainKitException
from core.websocket import ConnectionManager

Runner = Callable[["JobContext"], Awaitable[str | Path | None]]
ACTIVE_STATUSES = {"queued", "running", "cancelling"}


def _now() -> datetime:
    return datetime.now(UTC)


@dataclass
class JobRecord:
    job_id: str
    operation: str
    status: str
    current: int
    total: int
    message: str
    percent: float
    manifest_path: str | None
    error: str | None
    created_at: datetime
    updated_at: datetime

    def to_dict(self) -> dict[str, Any]:
        value = asdict(self)
        value["created_at"] = self.created_at.isoformat()
        value["updated_at"] = self.updated_at.isoformat()
        return value


class JobContext:
    def __init__(self, manager: JobManager, record: JobRecord, cancelled: Event):
        self.manager = manager
        self.record = record
        self.cancelled = cancelled

    @property
    def job_id(self) -> str:
        return self.record.job_id

    @property
    def operation(self) -> str:
        return self.record.operation

    def raise_if_cancelled(self):
        if self.cancelled.is_set():
            raise JobCancelledError()

    async def progress(
        self,
        current: int,
        total: int,
        message: str,
        manifest_path: str | Path | None = None,
    ):
        self.raise_if_cancelled()
        await self.manager.update(
            self.job_id,
            current=current,
            total=total,
            message=message,
            manifest_path=str(manifest_path) if manifest_path else None,
        )


class JobManager:
    _instance: JobManager | None = None

    def __init__(self, connections: ConnectionManager | None = None):
        self.connections = connections or ConnectionManager.get_instance()
        self.jobs: dict[str, JobRecord] = {}
        self.tasks: dict[str, asyncio.Task[None]] = {}
        self.cancel_events: dict[str, Event] = {}
        self._lock = asyncio.Lock()
        self._maintenance: str | None = None

    @classmethod
    def get_instance(cls) -> JobManager:
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    async def start(self, operation: str, runner: Runner) -> dict[str, Any]:
        async with self._lock:
            if self._maintenance:
                raise ConflictError(f"Backend is busy with {self._maintenance}")
            active = next(
                (record for record in self.jobs.values() if record.status in ACTIVE_STATUSES),
                None,
            )
            if active:
                raise ConflictError(
                    f"Job {active.job_id} ({active.operation}) is already {active.status}"
                )
            timestamp = _now()
            record = JobRecord(
                job_id=uuid4().hex,
                operation=operation,
                status="queued",
                current=0,
                total=0,
                message=f"Queued {operation}",
                percent=0,
                manifest_path=None,
                error=None,
                created_at=timestamp,
                updated_at=timestamp,
            )
            cancelled = Event()
            self.jobs[record.job_id] = record
            self.cancel_events[record.job_id] = cancelled
            self.tasks[record.job_id] = asyncio.create_task(
                self._execute(record, cancelled, runner),
                name=f"trainkit-{operation}-{record.job_id}",
            )
        await self.connections.send_job(record.to_dict())
        return record.to_dict()

    @asynccontextmanager
    async def reserve(self, operation: str):
        async with self._lock:
            active = next(
                (record for record in self.jobs.values() if record.status in ACTIVE_STATUSES),
                None,
            )
            if active:
                raise ConflictError(
                    f"Job {active.job_id} ({active.operation}) is already {active.status}"
                )
            if self._maintenance:
                raise ConflictError(f"Backend is busy with {self._maintenance}")
            self._maintenance = operation
        try:
            yield
        finally:
            async with self._lock:
                if self._maintenance == operation:
                    self._maintenance = None

    async def _execute(self, record: JobRecord, cancelled: Event, runner: Runner):
        context = JobContext(self, record, cancelled)
        await self.update(record.job_id, status="running", message=f"Starting {record.operation}")
        try:
            manifest_path = await runner(context)
            context.raise_if_cancelled()
            await self.update(
                record.job_id,
                status="completed",
                current=record.total,
                message=f"{record.operation.capitalize()} completed",
                manifest_path=str(manifest_path) if manifest_path else record.manifest_path,
            )
        except JobCancelledError:
            await self.update(
                record.job_id,
                status="cancelled",
                message=f"{record.operation.capitalize()} cancelled",
            )
        except asyncio.CancelledError:
            cancelled.set()
            await self.update(
                record.job_id,
                status="cancelled",
                message=f"{record.operation.capitalize()} cancelled",
            )
            raise
        except Exception as exc:
            message = exc.message if isinstance(exc, TrainKitException) else str(exc)
            await self.update(
                record.job_id,
                status="failed",
                message=f"{record.operation.capitalize()} failed",
                error=message,
            )

    async def update(self, job_id: str, **changes: Any):
        record = self.jobs[job_id]
        for key, value in changes.items():
            if value is not None and hasattr(record, key):
                setattr(record, key, value)
        record.updated_at = _now()
        record.percent = round((record.current / record.total) * 100, 1) if record.total else 0
        await self.connections.send_job(record.to_dict())

    def get(self, job_id: str) -> dict[str, Any]:
        if job_id not in self.jobs:
            raise TrainKitException("Job not found", status_code=404, code="job_not_found")
        return self.jobs[job_id].to_dict()

    def list(self) -> list[dict[str, Any]]:
        return [
            record.to_dict()
            for record in sorted(self.jobs.values(), key=lambda item: item.created_at, reverse=True)
        ]

    async def cancel(self, job_id: str | None = None) -> dict[str, Any]:
        if job_id is None:
            active = next(
                (record for record in self.jobs.values() if record.status in ACTIVE_STATUSES),
                None,
            )
            if not active:
                raise TrainKitException("No active job", status_code=404, code="job_not_found")
            job_id = active.job_id
        record = self.jobs.get(job_id)
        if record is None:
            raise TrainKitException("Job not found", status_code=404, code="job_not_found")
        if record.status not in ACTIVE_STATUSES:
            return record.to_dict()
        self.cancel_events[job_id].set()
        await self.update(job_id, status="cancelling", message="Cancellation requested")
        return record.to_dict()

    async def shutdown(self):
        for event in self.cancel_events.values():
            event.set()
        active = [task for task in self.tasks.values() if not task.done()]
        if active:
            await asyncio.gather(*active, return_exceptions=True)

    @classmethod
    def reset(cls):
        cls._instance = None
