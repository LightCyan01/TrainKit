from fastapi import Request
from fastapi.responses import JSONResponse

class TrainKitException(Exception):
    def __init__(self, message: str, status_code: int = 500):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)

class ModelLoadError(TrainKitException):
    def __init__(self, message: str):
        super().__init__(message, status_code=500)

class ProcessingError(TrainKitException):
    def __init__(self, message: str):
        super().__init__(message, status_code=500)

class InvalidPathError(TrainKitException):
    def __init__(self, message: str):
        super().__init__(message, status_code=400)

async def trainkit_exception_handler(request: Request, exc: TrainKitException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.message}
    )

# future ncnn integration point:
# class NCNNError(TrainKitException):
#     def __init__(self, message: str):
#         super().__init__(f"NCNN Error: {message}", status_code=500)
#
# class NCNNTimeoutError(NCNNError):
#     pass
