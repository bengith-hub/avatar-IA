from __future__ import annotations

import asyncio
import csv
import logging
import os
import shutil
import sys
import tempfile

logger = logging.getLogger(__name__)

# Emotion → prompt mapping for HunyuanVideo-Avatar
EMOTION_PROMPTS: dict[str, str] = {
    "neutral": "A person speaking naturally with a calm expression.",
    "happy": "A person speaking happily with a warm smile.",
    "sad": "A person speaking with a somber, sad expression.",
    "angry": "A person speaking with an intense, angry expression.",
    "surprised": "A person speaking with a surprised, wide-eyed expression.",
    "serious": "A person speaking seriously with a focused expression.",
}


class AvatarEngine:
    """Interface to HunyuanVideo-Avatar for photo + audio -> video generation.

    Uses hymm_sp/sample_gpu_poor.py with CSV input, optimized for RTX 3090
    (24GB VRAM) with CPU offloading and FP8 precision.
    """

    def __init__(self, model_path: str, install_path: str = "/root/HunyuanVideo-Avatar") -> None:
        self.model_path = model_path
        self.install_path = install_path
        self._loaded = False
        self._checkpoint: str | None = None

    @property
    def is_loaded(self) -> bool:
        return self._loaded

    def _find_checkpoint(self) -> str:
        """Locate the transformer checkpoint (FP8 preferred)."""
        base = os.path.join(self.install_path, "weights", "ckpts", "hunyuan-video-t2v-720p", "transformers")

        # Prefer FP8 checkpoint (lower VRAM)
        fp8 = os.path.join(base, "mp_rank_00_model_states_fp8.pt")
        if os.path.isfile(fp8):
            return fp8

        # Fallback to full precision
        full = os.path.join(base, "mp_rank_00_model_states.pt")
        if os.path.isfile(full):
            return full

        raise FileNotFoundError(
            f"HunyuanVideo-Avatar checkpoint not found in {base}. "
            "Download with: python3.10 -c \"from huggingface_hub import snapshot_download; "
            "snapshot_download('tencent/HunyuanVideo-Avatar', "
            f"local_dir='{self.install_path}/weights/')\""
        )

    def _verify_dependencies(self) -> None:
        """Check that required model dependencies exist."""
        weights_dir = os.path.join(self.install_path, "weights", "ckpts")

        required = ["whisper-tiny", "det_align"]
        for dep in required:
            dep_path = os.path.join(weights_dir, dep)
            if not os.path.isdir(dep_path):
                logger.warning("Missing dependency: %s (expected at %s)", dep, dep_path)

        # Check VAE
        vae_path = os.path.join(weights_dir, "hunyuan-video-t2v-720p", "vae", "pytorch_model.pt")
        if not os.path.isfile(vae_path):
            logger.warning("VAE model not found at %s", vae_path)

    async def load_model(self) -> None:
        """Verify HunyuanVideo-Avatar is installed and ready."""
        logger.info("Verifying HunyuanVideo-Avatar at %s ...", self.install_path)

        if not os.path.isdir(self.install_path):
            logger.warning(
                "HunyuanVideo-Avatar not found at %s. "
                "Clone with: git clone https://github.com/Tencent-Hunyuan/HunyuanVideo-Avatar.git %s",
                self.install_path,
                self.install_path,
            )
            self._loaded = True  # Allow worker to start
            return

        # Check for inference script
        script = os.path.join(self.install_path, "hymm_sp", "sample_gpu_poor.py")
        if not os.path.isfile(script):
            logger.warning("Inference script not found: %s", script)

        try:
            self._checkpoint = self._find_checkpoint()
            logger.info("Checkpoint: %s", self._checkpoint)
        except FileNotFoundError as e:
            logger.warning("Checkpoint not ready: %s", e)

        self._verify_dependencies()
        self._loaded = True
        logger.info("HunyuanVideo-Avatar ready")

    async def generate_video(
        self,
        photo_path: str,
        audio_path: str,
        output_path: str = "/tmp/avatar_output.mp4",
        emotion: str = "neutral",
    ) -> str:
        """Generate avatar video from reference photo and audio.

        Creates a temporary CSV, runs hymm_sp/sample_gpu_poor.py, and
        retrieves the generated MP4 from the results directory.
        """
        if not self.is_loaded:
            await self.load_model()

        if self._checkpoint is None:
            self._checkpoint = self._find_checkpoint()

        logger.info(
            "Generating avatar video: photo=%s, audio=%s, emotion=%s, output=%s",
            photo_path,
            audio_path,
            emotion,
            output_path,
        )

        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        # Create a unique results directory for this job
        job_results_dir = tempfile.mkdtemp(prefix="hunyuan_", dir=os.path.dirname(output_path))

        # Build prompt from emotion
        prompt = EMOTION_PROMPTS.get(emotion, EMOTION_PROMPTS["neutral"])

        # Create temporary CSV input file
        csv_path = os.path.join(job_results_dir, "input.csv")
        with open(csv_path, "w", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(["videoid", "image", "audio", "prompt", "fps"])
            writer.writerow([1, photo_path, audio_path, prompt, 25])

        logger.info("Created input CSV: %s", csv_path)

        # Determine if FP8 checkpoint
        use_fp8 = "fp8" in os.path.basename(self._checkpoint).lower()

        # Detect GPU VRAM to choose optimal settings
        gpu_vram_mb = 0
        try:
            import subprocess as _sp
            _out = _sp.check_output(
                ["nvidia-smi", "--query-gpu=memory.total", "--format=csv,noheader,nounits"],
                text=True,
            ).strip()
            gpu_vram_mb = int(_out.split("\n")[0])
        except Exception:
            gpu_vram_mb = 24000  # fallback: assume 24GB

        # Choose settings based on VRAM (3 tiers):
        #   >= 70GB: no cpu-offload, 50 steps → FASTEST (A100 80GB, H100)
        #   40-70GB: cpu-offload, 50 steps   → FAST (A100 40GB — fast bandwidth)
        #   < 40GB:  cpu-offload + infer-min, 30 steps → SLOW (RTX 3090 24GB)
        use_infer_min = False
        if gpu_vram_mb >= 70000:
            # 80GB+ GPUs: full model on GPU, no offload
            use_offload = False
            infer_steps = "50"
            mode_desc = "full GPU mode (no offload)"
        elif gpu_vram_mb >= 38000:
            # 40-70GB GPUs: offload weights to CPU, but full steps
            use_offload = True
            infer_steps = "50"
            mode_desc = "cpu-offload mode (mid VRAM, full steps)"
        else:
            # < 40GB GPUs: offload + minimal memory mode
            use_offload = True
            use_infer_min = True
            infer_steps = "30"
            mode_desc = "cpu-offload + infer-min mode (low VRAM)"
        logger.info(
            "GPU VRAM: %d MB — %s (steps=%s)",
            gpu_vram_mb,
            mode_desc,
            infer_steps,
        )

        # Build inference command
        # 129 frames ≈ 5.2s at 25fps, 704px resolution
        cmd = [
            sys.executable,
            "hymm_sp/sample_gpu_poor.py",
            "--input", csv_path,
            "--ckpt", self._checkpoint,
            "--sample-n-frames", "129",
            "--seed", "128",
            "--image-size", "704",
            "--cfg-scale", "7.5",
            "--infer-steps", infer_steps,
            "--use-deepcache", "1",
            "--flow-shift-eval-video", "5.0",
            "--save-path", job_results_dir,
        ]
        if use_offload:
            cmd.append("--cpu-offload")
        if use_infer_min:
            cmd.append("--infer-min")
        if use_fp8:
            cmd.append("--use-fp8")

        env = {
            **os.environ,
            "MODEL_BASE": os.path.join(self.install_path, "weights"),
            "CPU_OFFLOAD": "1" if use_offload else "0",
            "PYTHONPATH": ".",
            "CUDA_VISIBLE_DEVICES": "0",
            "PYTORCH_CUDA_ALLOC_CONF": "expandable_segments:True",
        }

        logger.info("Running HunyuanVideo-Avatar: %s", " ".join(cmd[:8]) + " ...")

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=self.install_path,
            env=env,
        )
        stdout, stderr = await proc.communicate()

        stdout_text = stdout.decode() if stdout else ""
        stderr_text = stderr.decode() if stderr else ""

        if proc.returncode != 0:
            error_msg = stderr_text[-1000:] if stderr_text else "Unknown error"
            logger.error("HunyuanVideo-Avatar failed (exit %d): %s", proc.returncode, error_msg)
            raise RuntimeError(f"HunyuanVideo-Avatar inference failed: {error_msg}")

        # Find the generated MP4 in results directory
        found_mp4 = self._find_output_video(job_results_dir)
        if found_mp4 is None:
            # Also check default results directories
            for fallback_dir in ["results-poor", "results-single"]:
                fallback_path = os.path.join(self.install_path, fallback_dir)
                if os.path.isdir(fallback_path):
                    found_mp4 = self._find_output_video(fallback_path)
                    if found_mp4:
                        break

        if found_mp4 is None:
            raise RuntimeError(
                f"No MP4 output found in {job_results_dir}. "
                "Check HunyuanVideo-Avatar logs and GPU memory."
            )

        # Move to the expected output path
        shutil.move(found_mp4, output_path)
        logger.info("Avatar video generated: %s", output_path)

        # Clean up temp directory
        try:
            shutil.rmtree(job_results_dir, ignore_errors=True)
        except Exception:
            pass

        return output_path

    @staticmethod
    def _find_output_video(search_dir: str) -> str | None:
        """Find the most recent MP4 file in a directory tree."""
        mp4_files: list[str] = []
        for root, _, files in os.walk(search_dir):
            for f in files:
                if f.endswith(".mp4"):
                    mp4_files.append(os.path.join(root, f))

        if not mp4_files:
            return None

        # Return the most recently modified
        return max(mp4_files, key=os.path.getmtime)
