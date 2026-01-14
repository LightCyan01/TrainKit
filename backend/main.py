from fastapi import FastAPI
from pathlib import Path
from pydantic import BaseModel
from service.image_rename import RenameService
from service.image_upscaling import ImageUpscaleService
from service.image_captioning import ImageCaptioningService
from utils.image_util import get_device
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
    
class CaptionRequest(BaseModel):
    caption_model_path: str
    load_path: str
    save_path: str
    prompt: str

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

@app.post("/caption")
def caption(request: CaptionRequest):
    service = ImageCaptioningService(Path(request.caption_model_path), Path(request.load_path), Path(request.save_path), request.prompt)
    service.caption_image()
    return{"status": "Captioning Complete"}
    

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/device")
def device():
    device = get_device()
    return {"device": str(device)}

