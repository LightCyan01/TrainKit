from abc import ABC, abstractmethod
from pathlib import Path
from typing import Optional, Callable, Awaitable

#Type alias for async progress callback
ProgressCallback = Callable[[int, int, str], Awaitable[None]]

class BaseProcessingService(ABC):
    @abstractmethod
    async def process(
        self,
        load_path: Path,
        save_path: Path,
        progress_callback: Optional[ProgressCallback] = None,
        **kwargs
    ) -> None:
        pass
    
    @abstractmethod
    def cleanup(self) -> None:
        pass

# future ncnn integration point: 
# class NCNNUpscaleService(BaseProcessingService):  
#     def __init__(self, ncnn_executable_path: Path, model_path: Path):
#         self.executable = ncnn_executable_path
#         self.model_path = model_path
#         self._process = None
#     
#     async def process(self, load_path, save_path, progress_callback=None, **kwargs):
#         pass
#     
#     def cleanup(self):
#         if self._process:
#             self._process.terminate()
#             self._process = None
