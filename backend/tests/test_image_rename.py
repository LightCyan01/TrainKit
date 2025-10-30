from service.image_rename import RenameService
from pathlib import Path

def test_rename_service_init():
    service = RenameService(load_path=Path("."), save_path=Path("."))
    assert service.load_path.exists()
    assert service.save_path.exists()

def test_list_files_runs():
    service = RenameService(load_path=Path("."), save_path=Path("."))
    files = service.list_files()
    assert isinstance(files, list)