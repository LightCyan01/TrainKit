from fastapi import FastAPI
from pathlib import Path
from pydantic import BaseModel
from service.image_rename import RenameService
from service.image_upscaling import ImageUpscaleService
from utils.image_util import get_device

app = FastAPI()

class RenameRequest(BaseModel):
    load_path: str
    save_path: str
    mode: str = "sequential"
    skip_duplicates: bool = False
    
class UpscaleRequest(BaseModel):
    upscale_model_path: str
    load_path: str
    save_path: str
    format: str
    use_tiling: bool = True

@app.get("/")
def root():
    return {"Hello": "World"}

@app.post("/rename")
def rename(request: RenameRequest):
    service = RenameService(Path(request.load_path), Path(request.save_path))
    if request.mode == "sequential":
        service.rename_sequential(skip_duplicates=request.skip_duplicates)
    elif request.mode == "stem_sequential":
        service.rename_stem_sequential(skip_duplicates=request.skip_duplicates)
    else:
        return {"error": "invalid mode"}
    return {"status":"Rename complete!"}

@app.post("/upscale")
def upscale(request: UpscaleRequest):
    device = get_device()
    service = ImageUpscaleService(device, Path(request.upscale_model_path), Path(request.load_path), Path(request.save_path), request.format)
    service.upscale(use_tiling=request.use_tiling)
    return {"status": "Upscaling Complete"}

@app.get("/device")
def device():
    device = get_device()
    return {"device": str(device)}

