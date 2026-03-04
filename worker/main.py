from __future__ import annotations

import asyncio
import logging
import os
import time

from fastapi import FastAPI, HTTPException, Request, UploadFile, File
from fastapi.responses import FileResponse

from config import settings
from models import (
    GenerateRequest,
    GenerateResponse,
    HealthResponse,
    AvatarInfo,
)
from jobs import job_manager
from pipeline import run_pipeline, tts_engine, avatar_engine

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(title="Avatar IA Worker", version="0.1.0")
start_time = time.time()


# --- Auth middleware ---

@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    if request.url.path == "/health":
        return await call_next(request)

    token = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
    if not settings.worker_token or token != settings.worker_token:
        raise HTTPException(status_code=401, detail="Invalid or missing token")

    return await call_next(request)


# --- Health ---

@app.get("/health", response_model=HealthResponse)
async def health():
    gpu_name = None
    gpu_memory = None
    try:
        import subprocess

        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode == 0:
            parts = result.stdout.strip().split(", ")
            gpu_name = parts[0] if len(parts) > 0 else None
            gpu_memory = parts[1] if len(parts) > 1 else None
    except Exception:
        pass

    return HealthResponse(
        status="ok",
        gpu_name=gpu_name,
        gpu_memory=gpu_memory,
        uptime=time.time() - start_time,
        models_loaded=tts_engine.is_loaded and avatar_engine.is_loaded,
        last_activity=job_manager.last_activity,
        active_jobs=job_manager.active_jobs_count(),
    )


# --- Generation ---

@app.post("/generate", response_model=GenerateResponse)
async def generate(request: GenerateRequest):
    job_id = job_manager.create_job(request)
    asyncio.create_task(run_pipeline(job_id))
    return GenerateResponse(job_id=job_id)


@app.get("/status/{job_id}")
async def job_status(job_id: str):
    job = job_manager.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@app.get("/jobs")
async def list_jobs():
    return job_manager.list_jobs()


@app.get("/download/{job_id}")
async def download(job_id: str):
    job = job_manager.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")

    file_path = os.path.join(settings.output_path, job_id, "final.mp4")
    if not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail="Video file not found")

    return FileResponse(file_path, media_type="video/mp4", filename=f"avatar-{job_id}.mp4")


# --- Avatars ---

@app.get("/avatars", response_model=list[AvatarInfo])
async def list_avatars():
    avatars: list[AvatarInfo] = []
    photos_dir = settings.photos_path
    if not os.path.isdir(photos_dir):
        return avatars

    for filename in sorted(os.listdir(photos_dir)):
        if filename.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
            name = os.path.splitext(filename)[0]
            avatars.append(
                AvatarInfo(
                    id=name,
                    name=name.replace("_", " ").replace("-", " ").title(),
                    path=os.path.join(photos_dir, filename),
                )
            )
    return avatars


@app.post("/avatars", response_model=AvatarInfo)
async def upload_avatar(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    photos_dir = settings.photos_path
    os.makedirs(photos_dir, exist_ok=True)

    file_path = os.path.join(photos_dir, file.filename)
    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    name = os.path.splitext(file.filename)[0]
    return AvatarInfo(
        id=name,
        name=name.replace("_", " ").replace("-", " ").title(),
        path=file_path,
    )
