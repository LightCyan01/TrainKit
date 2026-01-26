from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from typing import AsyncIterator
from contextlib import asynccontextmanager
from routers import caption_router, upscale_router, rename_router, system_router
from core import TrainKitException, trainkit_exception_handler
from service.service_manager import ServiceManager

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    print("Starting TrainKit backend...")
    yield
    #Cleanup resources
    print("Shutting down TrainKit backend...")
    service_manager = ServiceManager.get_instance()
    service_manager.cleanup()


app = FastAPI(
    title="TrainKit API",
    description="Backend for TrainKit",
    version="1.0.0",
    lifespan=lifespan,
)

#CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

#exception handlers
app.add_exception_handler(TrainKitException, trainkit_exception_handler)

#routers
app.include_router(caption_router)
app.include_router(upscale_router)
app.include_router(rename_router)
app.include_router(system_router)


# future ncnn integration point:
# add NCNN endpoints to existing upscale router with backend selection.
# the UpscaleRequest model already has a placeholder for 'backend' field.
