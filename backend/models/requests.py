from pydantic import BaseModel, ConfigDict

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
    # backend: str = "pytorch" | "ncnn"

class CaptionRequest(BaseModel):
    caption_model_path: str
    load_path: str
    save_path: str
    prompt: str

class PreloadRequest(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    model_path: str

class ModelStatusRequest(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    model_path: str

class StatusResponse(BaseModel):
    status: str


class ErrorResponse(BaseModel):
    error: str
