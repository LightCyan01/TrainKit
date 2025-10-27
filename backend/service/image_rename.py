from pathlib import Path
from utils.file_util import is_image
import shutil
import difPy

class rename_service:
    def __init__(self, load_path="", save_path=""):
        self.load_path = Path(load_path)
        self.save_path = Path(save_path)
    
    def list_files(self):
        file_list = []
        for file in self.load_path.iterdir():
            file_list.append(file)
        return file_list
    
    def rename_sequential(self, skip_duplicates=False):
        for idx, file in enumerate(self.get_valid_files(skip_duplicates), start=1):
            new_name = f"{idx}{file.suffix}"
            new_path = self.save_path / new_name
            shutil.copy2(file, new_path)
        print("Rename Complete!")
    
    def rename_stem_sequential(self, skip_duplicates=False):
        for idx, file in enumerate(self.get_valid_files(skip_duplicates), start=1):
            new_name = f"{file.stem}_{idx}{file.suffix}"
            new_path = self.save_path / new_name
            shutil.copy2(file, new_path)
        print("Rename Complete!")
                
    def skip_duplicates(self):
        dif = difPy.build(str(self.load_path), recursive=False)
        search = difPy.search(dif)  
        duplicates = set()
        
        for dupe in search.result.values():
            for entry in dupe:
                duplicates.add(Path(entry[0]))
        return duplicates
    
    def get_valid_files(self, skip_duplicates=False):
        duplicates = self.skip_duplicates() if skip_duplicates else set()
        for file in self.load_path.iterdir():
            if file.is_file() and is_image(file) and file not in duplicates:
                yield file