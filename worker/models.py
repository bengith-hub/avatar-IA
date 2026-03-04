from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


class JobStatus(str, Enum):
    pending = "pending"
    processing = "processing"
    completed = "completed"
    failed = "failed"


class GenerateRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000)
    language: str = Field(default="fr", pattern=r"^[a-z]{2}$")
    avatar_id: str
    background_url: str | None = None
    emotion: str = "neutral"
    format: str = "16:9"


class GenerateResponse(BaseModel):
    job_id: str


class JobStatusResponse(BaseModel):
    job_id: str
    status: JobStatus
    progress: float | None = None
    result_url: str | None = None
    error: str | None = None
    created_at: datetime
    updated_at: datetime


class JobListItem(BaseModel):
    job_id: str
    status: JobStatus
    created_at: datetime
    text_preview: str


class HealthResponse(BaseModel):
    status: str
    gpu_name: str | None = None
    gpu_memory: str | None = None
    uptime: float
    models_loaded: bool
    last_activity: datetime | None = None
    active_jobs: int = 0


class AvatarInfo(BaseModel):
    id: str
    name: str
    path: str
    type: str = "photo"
