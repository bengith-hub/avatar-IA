from __future__ import annotations

import asyncio
import json
import logging
import os
import subprocess
import sys

logger = logging.getLogger(__name__)


class AvatarEngine:
    """Interface to HunyuanVideo-Avatar for photo + audio -> video generation."""

    def __init__(self, model_path: str) -> None:
        self.model_path = model_path
        self._loaded = False
        self._hunyuan_dir: str | None = None

    @property
    def is_loaded(self) -> bool:
        return self._loaded

    def _find_hunyuan(self) -> str:
        """Locate the HunyuanVideo-Avatar installation directory."""
        candidates = [
            os.path.join(self.model_path, "HunyuanVideo-Avatar"),
            "/root/avatar-data/models/hunyuan/HunyuanVideo-Avatar",
            os.path.expanduser("~/HunyuanVideo-Avatar"),
        ]
        for path in candidates:
            if os.path.isdir(path):
                # Check for key files that indicate a valid installation
                if os.path.isfile(os.path.join(path, "infer.py")) or os.path.isfile(
                    os.path.join(path, "scripts", "infer.sh")
                ):
                    return path
                # Check for sample_audio2video.py (common entry point)
                if os.path.isfile(
                    os.path.join(path, "sample_audio2video.py")
                ):
                    return path
        raise FileNotFoundError(
            f"HunyuanVideo-Avatar installation not found in: {candidates}"
        )

    async def load_model(self) -> None:
        """Verify HunyuanVideo-Avatar is installed and ready."""
        logger.info("Verifying HunyuanVideo-Avatar installation...")

        try:
            self._hunyuan_dir = self._find_hunyuan()
            logger.info("Found HunyuanVideo-Avatar at: %s", self._hunyuan_dir)

            # Check for model weights
            weights_indicators = [
                "ckpts",
                "checkpoints",
                "weights",
                "pretrained_models",
            ]
            has_weights = any(
                os.path.isdir(os.path.join(self._hunyuan_dir, d))
                for d in weights_indicators
            )
            if has_weights:
                logger.info("Model weights directory found")
            else:
                logger.warning(
                    "Model weights not found. Run setup.sh to download them."
                )

            self._loaded = True
            logger.info("HunyuanVideo-Avatar ready")

        except FileNotFoundError as e:
            logger.warning("HunyuanVideo-Avatar setup incomplete: %s", e)
            self._loaded = True  # Allow worker to start

    async def generate_video(
        self,
        photo_path: str,
        audio_path: str,
        output_path: str = "/tmp/avatar_output.mp4",
        emotion: str = "neutral",
    ) -> str:
        """Generate avatar video from reference photo and audio.

        Uses HunyuanVideo-Avatar inference script. The model generates a
        talking-head/body video synchronized with the audio, using the
        reference photo as appearance guidance.
        """
        if not self.is_loaded:
            await self.load_model()

        if self._hunyuan_dir is None:
            self._hunyuan_dir = self._find_hunyuan()

        logger.info(
            "Generating avatar video: photo=%s, audio=%s, emotion=%s, output=%s",
            photo_path,
            audio_path,
            emotion,
            output_path,
        )

        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        # Determine which inference script exists
        infer_script = None
        for candidate in [
            "sample_audio2video.py",
            "infer.py",
            "inference.py",
            os.path.join("scripts", "infer.py"),
        ]:
            full_path = os.path.join(self._hunyuan_dir, candidate)
            if os.path.isfile(full_path):
                infer_script = candidate
                break

        if infer_script is None:
            raise RuntimeError(
                f"No inference script found in {self._hunyuan_dir}. "
                "Ensure HunyuanVideo-Avatar is properly installed."
            )

        # Build inference command
        # HunyuanVideo-Avatar typically uses sample_audio2video.py
        cmd = [
            sys.executable,
            infer_script,
            "--image-path", photo_path,
            "--audio-path", audio_path,
            "--output-path", output_path,
        ]

        # Enable TeaCache for RTX 3090 (24GB) to reduce VRAM usage
        cmd.extend(["--use-teacache"])

        # Set resolution suitable for the GPU
        cmd.extend(["--height", "576", "--width", "576"])

        logger.info(
            "Running HunyuanVideo-Avatar inference: %s",
            " ".join(cmd[:6]) + "...",
        )

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=self._hunyuan_dir,
            env={
                **os.environ,
                "CUDA_VISIBLE_DEVICES": "0",
            },
        )
        stdout, stderr = await proc.communicate()

        stdout_text = stdout.decode() if stdout else ""
        stderr_text = stderr.decode() if stderr else ""

        if proc.returncode != 0:
            error_msg = stderr_text[-800:] if stderr_text else "Unknown error"
            logger.error("HunyuanVideo-Avatar stderr: %s", error_msg)

            # Try with shell script if Python script failed
            shell_script = os.path.join(self._hunyuan_dir, "scripts", "infer.sh")
            if os.path.isfile(shell_script):
                logger.info("Trying shell script fallback: %s", shell_script)
                proc = await asyncio.create_subprocess_exec(
                    "bash",
                    shell_script,
                    "--image-path", photo_path,
                    "--audio-path", audio_path,
                    "--output-path", output_path,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    cwd=self._hunyuan_dir,
                )
                stdout, stderr = await proc.communicate()
                if proc.returncode != 0:
                    error_msg = stderr.decode()[-800:] if stderr else "Unknown"
                    raise RuntimeError(
                        f"HunyuanVideo-Avatar inference failed: {error_msg}"
                    )
            else:
                raise RuntimeError(
                    f"HunyuanVideo-Avatar inference failed: {error_msg}"
                )

        # Check output exists - sometimes the script writes to a different path
        if not os.path.isfile(output_path):
            # Look for output in common locations
            output_dir = os.path.dirname(output_path)
            possible_outputs = []
            for root, dirs, files in os.walk(output_dir):
                for f in files:
                    if f.endswith(".mp4"):
                        possible_outputs.append(os.path.join(root, f))

            # Also check the hunyuan output directory
            hunyuan_output = os.path.join(self._hunyuan_dir, "outputs")
            if os.path.isdir(hunyuan_output):
                for f in sorted(os.listdir(hunyuan_output), reverse=True):
                    if f.endswith(".mp4"):
                        possible_outputs.append(
                            os.path.join(hunyuan_output, f)
                        )
                        break

            if possible_outputs:
                # Use the most recent output
                found = max(possible_outputs, key=os.path.getmtime)
                logger.info("Found output at alternative path: %s", found)
                import shutil
                shutil.move(found, output_path)
            else:
                raise RuntimeError(
                    f"Avatar video not created at {output_path}. "
                    "Check HunyuanVideo-Avatar installation and GPU memory."
                )

        logger.info("Avatar video generated: %s", output_path)
        return output_path
