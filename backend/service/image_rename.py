from pathlib import Path
from typing import Set, Optional, Callable, Awaitable
import asyncio
import shutil
import difPy
from utils.file_util import is_image

# Type alias for async progress callback
ProgressCallback = Callable[[int, int, str], Awaitable[None]]

class RenameService:
    def __init__(self):
        self._duplicates_cache: Optional[Set[Path]] = None
    
    def list_files(self, load_path: Path):
        return list(load_path.iterdir())

    async def rename_sequential(
        self,
        load_path: Path,
        save_path: Path,
        skip_duplicates: bool = False,
        progress_callback: Optional[ProgressCallback] = None
    ):
        files = list(self.get_valid_files(load_path, skip_duplicates))
        total = len(files)
        
        print(f"Found {total} files to rename")
        
        for idx, file in enumerate(files, start=1):
            if progress_callback:
                await progress_callback(idx, total, f"Renaming {file.name}")
            
            new_name = f"{idx}{file.suffix}"
            new_path = save_path / new_name
            
            # Run I/O in executor to not block event loop
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, shutil.copy2, file, new_path)
        
        print(f"Rename complete! Processed {total} files")
    
    async def rename_stem_sequential(
        self,
        load_path: Path,
        save_path: Path,
        skip_duplicates: bool = False,
        progress_callback: Optional[ProgressCallback] = None
    ):
        files = list(self.get_valid_files(load_path, skip_duplicates))
        total = len(files)
        
        print(f"Found {total} files to rename")
        
        for idx, file in enumerate(files, start=1):
            if progress_callback:
                await progress_callback(idx, total, f"Renaming {file.name}")
            
            new_name = f"{file.stem}_{idx}{file.suffix}"
            new_path = save_path / new_name
            
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, shutil.copy2, file, new_path)
        
        print(f"Rename complete! Processed {total} files")
                
    def skip_duplicates(self, load_path: Path) -> Set[Path]:
        if self._duplicates_cache is not None:
            return self._duplicates_cache
        
        dif = difPy.build(str(load_path), recursive=False)
        search = difPy.search(dif)
        
        duplicates = set()
        for dupe in search.result.values():
            for entry in dupe:
                duplicates.add(Path(entry[0]))
        
        self._duplicates_cache = duplicates
        return duplicates
    
    def get_valid_files(self, load_path: Path, skip_duplicates: bool = False):
        duplicates = self.skip_duplicates(load_path) if skip_duplicates else set()
        
        for file in load_path.iterdir():
            if file.is_file() and is_image(file) and file not in duplicates:
                yield file
    
    def clear_cache(self):
        self._duplicates_cache = None