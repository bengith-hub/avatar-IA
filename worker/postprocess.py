from __future__ import annotations

import asyncio
import logging
import os

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
        raise RuntimeError(f"ffmpeg failed: {stderr.decode()[-500:]}")


async def normalize_video(
    input_path: str,
    output_path: str,
    video_format: str = "16:9",
) -> str:
    """Normalize video to standard format: H.264, AAC, web-optimized."""
    width, height = (1920, 1080) if video_format == "16:9" else (1080, 1920)

    await run_ffmpeg([
        "-i", input_path,
        "-vf", (
            f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
            f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black"
        ),
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "23",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "128k",
        "-ar", "44100",
        "-ac", "2",
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
    """Composite avatar video over a background image using chroma key.

    Attempts green-screen removal first. If the avatar video has no green
    screen, falls back to overlay with the background scaled to match.
    """
    # First, try chromakey compositing (green screen removal)
    # This works if HunyuanVideo-Avatar outputs with a green/solid background
    try:
        await run_ffmpeg([
            "-i", background_path,
            "-i", video_path,
            "-filter_complex", (
                # Scale background to match video
                "[0:v]scale=1920:1080:force_original_aspect_ratio=increase,"
                "crop=1920:1080[bg];"
                # Apply chromakey to remove green background from avatar
                "[1:v]chromakey=0x00FF00:0.3:0.1[avatar];"
                # Overlay avatar on background
                "[bg][avatar]overlay=(W-w)/2:(H-h)/2:shortest=1[out]"
            ),
            "-map", "[out]",
            "-map", "1:a?",
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac",
            "-movflags", "+faststart",
            output_path,
        ])
        logger.info("Chromakey composited video saved to %s", output_path)
        return output_path

    except RuntimeError:
        logger.warning("Chromakey failed, falling back to simple overlay")

    # Fallback: overlay video centered on background (no chroma removal)
    try:
        await run_ffmpeg([
            "-i", background_path,
            "-i", video_path,
            "-filter_complex", (
                "[0:v]scale=1920:1080:force_original_aspect_ratio=increase,"
                "crop=1920:1080,setsar=1[bg];"
                "[1:v]scale=1920:1080[fg];"
                "[bg][fg]blend=all_mode=normal:all_opacity=1[out]"
            ),
            "-map", "[out]",
            "-map", "1:a?",
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac",
            "-movflags", "+faststart",
            output_path,
        ])
        logger.info("Blend composited video saved to %s", output_path)
        return output_path

    except RuntimeError:
        logger.warning("Blend compositing failed, copying video as-is")
        await run_ffmpeg(["-i", video_path, "-c", "copy", output_path])
        return output_path
