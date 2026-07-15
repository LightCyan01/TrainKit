from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

CollisionPolicy = Literal["fail", "skip", "overwrite", "rename"]
JobOperation = Literal["rename", "caption", "upscale", "tag"]
JobStatus = Literal["queued", "running", "cancelling", "cancelled", "completed", "failed"]


class BatchRequest(BaseModel):
    load_path: str
    save_path: str
    collision_policy: CollisionPolicy = "fail"
    dry_run: bool = False
    save_manifest: bool = False
    resume_manifest_path: str | None = None


class RenameRequest(BatchRequest):
    mode: Literal["sequential", "stem_sequential"] = "sequential"
    skip_duplicates: bool = False
    zero_pad: int = Field(default=5, ge=1, le=12)


class UpscaleRequest(BatchRequest):
    upscale_model_path: str
    format: Literal["jpg", "png", "bmp", "webp"] = "png"
    use_tiling: bool = True
    backend: Literal["spandrel", "ncnn"] = "spandrel"
    tile_size: int = Field(default=512, ge=64, le=4096)
    tile_overlap: int = Field(default=16, ge=0, le=512)
    ncnn_model_bin_path: str | None = None
    ncnn_input_blob: str | None = None
    ncnn_output_blob: str | None = None
    ncnn_scale: int = Field(default=4, ge=1, le=16)
    ncnn_use_vulkan: bool = True


class CaptionRequest(BatchRequest):
    caption_model_path: str
    prompt: str = Field(min_length=1, max_length=8000)
    adapter: Literal["auto", "multimodal", "blip", "instructblip"] = "auto"
    max_new_tokens: int = Field(default=256, ge=1, le=2048)


class TagRequest(BatchRequest):
    tag_model_path: str
    threshold: float = Field(default=0.35, ge=0, le=1)
    top_k: int = Field(default=20, ge=1, le=1000)
    output: Literal["json", "txt", "both"] = "both"


class PreloadRequest(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    model_path: str
    adapter: Literal["auto", "multimodal", "blip", "instructblip"] = "auto"


class ModelStatusRequest(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    model_path: str
    adapter: str = "auto"


class ModelInfoRequest(BaseModel):
    model_path: str
    backend: Literal["spandrel", "ncnn"] = "spandrel"
    model_bin_path: str | None = None
    scale: int = Field(default=4, ge=1, le=16)
    input_blob: str | None = None
    output_blob: str | None = None
    use_vulkan: bool = True


class JobResponse(BaseModel):
    job_id: str
    operation: JobOperation
    status: JobStatus
    current: int = 0
    total: int = 0
    message: str = ""
    percent: float = 0
    manifest_path: str | None = None
    error: str | None = None
    created_at: datetime
    updated_at: datetime


class StatusResponse(BaseModel):
    status: str


class ErrorDetail(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    error: ErrorDetail


class ManifestResumeRequest(BaseModel):
    manifest_path: str

    @field_validator("manifest_path")
    @classmethod
    def manifest_must_be_json(cls, value: str) -> str:
        if not value.lower().endswith(".json"):
            raise ValueError("Manifest must be a JSON file")
        return value
