from __future__ import annotations

from fastapi import Request
from fastapi.responses import JSONResponse


class TrainKitException(Exception):
    def __init__(self, message: str, status_code: int = 500, code: str = "trainkit_error"):
        self.message = message
        self.status_code = status_code
        self.code = code
        super().__init__(message)


class AuthenticationError(TrainKitException):
    def __init__(self, message: str):
        super().__init__(message, status_code=401, code="unauthorized")


class ConflictError(TrainKitException):
    def __init__(self, message: str):
        super().__init__(message, status_code=409, code="conflict")


class ModelLoadError(TrainKitException):
    def __init__(self, message: str):
        super().__init__(message, status_code=422, code="model_load_error")


class ProcessingError(TrainKitException):
    def __init__(self, message: str):
        super().__init__(message, status_code=500, code="processing_error")


class InvalidPathError(TrainKitException):
    def __init__(self, message: str):
        super().__init__(message, status_code=400, code="invalid_path")


class JobCancelledError(Exception):
    pass


async def trainkit_exception_handler(_request: Request, exc: TrainKitException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": exc.code, "message": exc.message}},
    )
