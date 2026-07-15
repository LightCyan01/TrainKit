from core.jobs import JobManager
from core.websocket import ConnectionManager


def get_connection_manager() -> ConnectionManager:
    return ConnectionManager.get_instance()


def get_job_manager() -> JobManager:
    return JobManager.get_instance()


def get_service_manager():
    from service.service_manager import ServiceManager

    return ServiceManager.get_instance()


def get_rename_service():
    from service.image_rename import RenameService

    return RenameService()
