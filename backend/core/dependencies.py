from .websocket import ConnectionManager
from service.service_manager import ServiceManager
from service.image_rename import RenameService

def get_connection_manager() -> ConnectionManager:
    return ConnectionManager.get_instance()

def get_service_manager() -> ServiceManager:
    return ServiceManager.get_instance()

def get_rename_service() -> RenameService:
    return RenameService()

# future ncnn integration point:
# def get_upscale_backend(backend: str = "pytorch"):
#     if backend == "ncnn":
#         from service.ncnn_upscale import NCNNUpscaleService
#         return NCNNUpscaleService.get_instance()
#     return get_service_manager()
