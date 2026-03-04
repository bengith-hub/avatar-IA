from __future__ import annotations

import asyncio
import logging

logger = logging.getLogger(__name__)


async def run_ffmpeg(args: list[str]) -> None:
    cmd = ["ffmpeg", "-y"] + args
    logger.info("Running ffmpeg: %s", " ".join(cmd))
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {stderr.decode()}")


async def normalize_video(
    input_path: str,
    output_path: str,
    video_format: str = "16:9",
) -> str:
    width, height = (1920, 1080) if video_format == "16:9" else (1080, 1920)

    await run_ffmpeg([
        "-i", input_path,
        "-vf", f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
               f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2",
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-ar", "16000",
        "-ac", "1",
        "-movflags", "+faststart",
        output_path,
    ])

    logger.info("Normalized video saved to %s", output_path)
    return output_path


async def composite_background(
    video_path: str,
    background_path: str,
    output_path: str,
) -> str:
    # TODO: Implement segmentation + background compositing
    # For now, just copy the video
    await run_ffmpeg(["-i", video_path, "-c", "copy", output_path])
    logger.info("Composited video saved to %s", output_path)
    return output_path
