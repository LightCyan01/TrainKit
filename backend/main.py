from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from config.settings import APP_VERSION, api_token
from core.auth import token_is_valid
from core.exceptions import TrainKitException, trainkit_exception_handler
from core.jobs import JobManager
from core.websocket import ConnectionManager
from routers import caption_router, rename_router, system_router, tag_router, upscale_router


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    if not api_token():
        raise RuntimeError("TRAINKIT_BACKEND_TOKEN must be set by the desktop process")
    print("Starting TrainKit backend...")
    yield
    print("Shutting down TrainKit backend...")
    await JobManager.get_instance().shutdown()
    from service.service_manager import ServiceManager

    ServiceManager.get_instance().cleanup()
    await ConnectionManager.get_instance().close_all()


app = FastAPI(
    title="TrainKit API",
    description="Local backend for TrainKit",
    version=APP_VERSION,
    lifespan=lifespan,
)


@app.middleware("http")
async def authenticate(request: Request, call_next):
    if not token_is_valid(request.headers.get("x-trainkit-token")):
        return JSONResponse(
            status_code=401,
            content={"error": {"code": "unauthorized", "message": "Invalid backend token"}},
        )
    return await call_next(request)


app.add_exception_handler(TrainKitException, trainkit_exception_handler)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_request: Request, exc: RequestValidationError):
    error = exc.errors()[0] if exc.errors() else None
    if error:
        location = ".".join(str(part) for part in error.get("loc", []) if part != "body")
        message = f"{location}: {error['msg']}" if location else str(error["msg"])
    else:
        message = "Request validation failed"
    return JSONResponse(
        status_code=422,
        content={"error": {"code": "validation_error", "message": message}},
    )


app.include_router(caption_router)
app.include_router(upscale_router)
app.include_router(rename_router)
app.include_router(system_router)
app.include_router(tag_router)
