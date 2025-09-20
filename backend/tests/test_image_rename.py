from service.image_rename import rename_service

def test_rename_service_init():
    service = rename_service(load_path=".", save_path=".")
    assert service.load_path.exists()
    assert service.save_path.exists()

def test_list_files_runs():
    service = rename_service(load_path=".", save_path=".")
    files = service.list_files()
    assert isinstance(files, list)