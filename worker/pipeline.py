from __future__ import annotations

import logging
import os

from config import settings
from jobs import job_manager
from models import JobStatus
from tts import TTSEngine
from avatar import AvatarEngine
from postprocess import normalize_video

logger = logging.getLogger(__name__)

tts_engine = TTSEngine(
    model_path=settings.fish_model_path,
    voice_path=settings.voice_path,
)
avatar_engine = AvatarEngine(model_path=settings.hunyuan_model_path)


async def run_pipeline(job_id: str) -> None:
    job_data = job_manager._jobs.get(job_id)
    if job_data is None:
        logger.error("Job %s not found", job_id)
        return

    request = job_data["request"]
    output_dir = os.path.join(settings.output_path, job_id)
    os.makedirs(output_dir, exist_ok=True)

    try:
        job_manager.update_job(job_id, status=JobStatus.processing, progress=0.0)

        # Step 1: TTS
        logger.info("[%s] Step 1/3: Generating speech", job_id)
        job_manager.update_job(job_id, progress=0.1)
        audio_path = await tts_engine.generate_speech(
            text=request["text"],
            language=request["language"],
            output_path=os.path.join(output_dir, "speech.wav"),
        )
        job_manager.update_job(job_id, progress=0.3)

        # Step 2: Avatar video
        logger.info("[%s] Step 2/3: Generating avatar video", job_id)
        photo_path = os.path.join(settings.photos_path, f"{request['avatar_id']}.png")
        raw_video_path = await avatar_engine.generate_video(
            photo_path=photo_path,
            audio_path=audio_path,
            output_path=os.path.join(output_dir, "raw.mp4"),
            emotion=request.get("emotion", "neutral"),
        )
        job_manager.update_job(job_id, progress=0.8)

        # Step 3: Post-production
        logger.info("[%s] Step 3/3: Post-processing", job_id)
        final_path = await normalize_video(
            input_path=raw_video_path,
            output_path=os.path.join(output_dir, "final.mp4"),
            video_format=request.get("format", "16:9"),
        )
        job_manager.update_job(job_id, progress=1.0)

        job_manager.update_job(
            job_id,
            status=JobStatus.completed,
            result_url=f"/download/{job_id}",
        )
        logger.info("[%s] Pipeline completed: %s", job_id, final_path)

    except Exception as e:
        logger.exception("[%s] Pipeline failed", job_id)
        job_manager.update_job(job_id, status=JobStatus.failed, error=str(e))
