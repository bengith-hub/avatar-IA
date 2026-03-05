from __future__ import annotations

import glob
import logging
import os
import time

from config import settings
from jobs import job_manager
from models import JobStatus
from tts import TTSEngine
from avatar import AvatarEngine
from postprocess import normalize_video, composite_background

logger = logging.getLogger(__name__)

tts_engine = TTSEngine(
    model_path=settings.fish_model_path,
    voice_path=settings.voice_path,
)
avatar_engine = AvatarEngine(
    model_path=settings.hunyuan_model_path,
    install_path=settings.hunyuan_install_path,
)


def resolve_photo_path(avatar_id: str) -> str:
    """Find the avatar photo file, trying multiple extensions."""
    for ext in ("png", "jpg", "jpeg", "webp"):
        path = os.path.join(settings.photos_path, f"{avatar_id}.{ext}")
        if os.path.isfile(path):
            return path

    # Try matching by prefix
    pattern = os.path.join(settings.photos_path, f"{avatar_id}.*")
    matches = glob.glob(pattern)
    if matches:
        return matches[0]

    raise FileNotFoundError(
        f"Avatar photo not found for '{avatar_id}' in {settings.photos_path}"
    )


async def run_pipeline(job_id: str) -> None:
    job_data = job_manager._jobs.get(job_id)
    if job_data is None:
        logger.error("Job %s not found", job_id)
        return

    request = job_data["request"]
    output_dir = os.path.join(settings.output_path, job_id)
    os.makedirs(output_dir, exist_ok=True)
    start_time = time.time()

    try:
        job_manager.update_job(job_id, status=JobStatus.processing, progress=0.0)

        # Validate avatar photo exists
        photo_path = resolve_photo_path(request["avatar_id"])
        logger.info("[%s] Using avatar photo: %s", job_id, photo_path)

        # Step 1: TTS (text → wav)
        logger.info("[%s] Step 1/3: Generating speech (%s, %s)",
                     job_id, request["language"], f"{len(request['text'])} chars")
        job_manager.update_job(job_id, progress=0.05)
        audio_path = await tts_engine.generate_speech(
            text=request["text"],
            language=request["language"],
            output_path=os.path.join(output_dir, "speech.wav"),
        )
        job_manager.update_job(job_id, progress=0.25)
        logger.info("[%s] TTS completed in %.1fs", job_id, time.time() - start_time)

        # Step 2: Avatar video (photo + wav → raw mp4)
        step2_start = time.time()
        logger.info("[%s] Step 2/3: Generating avatar video (emotion=%s)",
                     job_id, request.get("emotion", "neutral"))
        raw_video_path = await avatar_engine.generate_video(
            photo_path=photo_path,
            audio_path=audio_path,
            output_path=os.path.join(output_dir, "raw.mp4"),
            emotion=request.get("emotion", "neutral"),
        )
        job_manager.update_job(job_id, progress=0.75)
        logger.info("[%s] Avatar video generated in %.1fs",
                     job_id, time.time() - step2_start)

        # Step 3: Post-production (normalize + optional background composite)
        step3_start = time.time()
        logger.info("[%s] Step 3/3: Post-processing (format=%s)",
                     job_id, request.get("format", "16:9"))

        background_url = request.get("background_url")
        if background_url and background_url.startswith("http"):
            # Download background and composite
            composited_path = os.path.join(output_dir, "composited.mp4")
            bg_path = os.path.join(output_dir, "background.jpg")
            # Download background image
            import urllib.request
            urllib.request.urlretrieve(background_url, bg_path)
            await composite_background(raw_video_path, bg_path, composited_path)
            raw_video_path = composited_path

        final_path = await normalize_video(
            input_path=raw_video_path,
            output_path=os.path.join(output_dir, "final.mp4"),
            video_format=request.get("format", "16:9"),
        )
        job_manager.update_job(job_id, progress=1.0)
        logger.info("[%s] Post-processing completed in %.1fs",
                     job_id, time.time() - step3_start)

        total_time = time.time() - start_time
        job_manager.update_job(
            job_id,
            status=JobStatus.completed,
            result_url=f"/download/{job_id}",
        )
        logger.info("[%s] Pipeline completed in %.1fs: %s", job_id, total_time, final_path)

    except FileNotFoundError as e:
        logger.error("[%s] File not found: %s", job_id, e)
        job_manager.update_job(
            job_id,
            status=JobStatus.failed,
            error=f"Fichier introuvable: {e}",
        )
    except Exception as e:
        logger.exception("[%s] Pipeline failed after %.1fs",
                         job_id, time.time() - start_time)
        job_manager.update_job(job_id, status=JobStatus.failed, error=str(e))
