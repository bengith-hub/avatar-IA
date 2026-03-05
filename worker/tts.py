from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


class TTSEngine:
    """Interface to FishAudio OpenAudio S1-mini for text-to-speech with voice cloning."""

    def __init__(self, model_path: str, voice_path: str) -> None:
        self.model_path = model_path
        self.voice_path = voice_path
        self._loaded = False
        self._engine: Any = None

    @property
    def is_loaded(self) -> bool:
        return self._loaded

    # ------------------------------------------------------------------
    # Checkpoint discovery
    # ------------------------------------------------------------------

    def _find_model_dir(self) -> str:
        """Find the openaudio-s1-mini model directory (contains model.pth + codec.pth)."""
        root = Path(self.model_path)

        # Direct match: model_path itself contains the checkpoint files
        if (root / "model.pth").is_file() and (root / "codec.pth").is_file():
            return str(root)

        # Search subdirectories (e.g. openaudio-s1-mini/)
        for subdir in sorted(root.iterdir()):
            if subdir.is_dir():
                if (subdir / "model.pth").is_file() and (subdir / "codec.pth").is_file():
                    return str(subdir)

        # Recursive fallback
        for pth in sorted(root.rglob("model.pth")):
            codec = pth.parent / "codec.pth"
            if codec.is_file():
                return str(pth.parent)

        raise FileNotFoundError(
            f"No OpenAudio S1 model found under {self.model_path}. "
            "Download with: huggingface-cli download fishaudio/openaudio-s1-mini "
            f"--local-dir {self.model_path}/openaudio-s1-mini"
        )

    # ------------------------------------------------------------------
    # Voice reference
    # ------------------------------------------------------------------

    def _find_voice_reference(self) -> str:
        """Find the voice reference audio file for cloning."""
        os.makedirs(self.voice_path, exist_ok=True)
        for filename in os.listdir(self.voice_path):
            if filename.lower().endswith((".wav", ".mp3", ".flac", ".ogg", ".webm")):
                return os.path.join(self.voice_path, filename)
        raise FileNotFoundError(
            f"No voice reference audio found in {self.voice_path}. "
            "Add a .wav file (10-30s of Benjamin's voice) to this directory."
        )

    async def _ensure_wav_format(self, audio_path: str) -> str:
        """Convert audio to WAV 16kHz mono if not already WAV (fish-speech compatibility)."""
        if audio_path.lower().endswith(".wav"):
            return audio_path

        wav_path = os.path.splitext(audio_path)[0] + "_converted.wav"
        if os.path.isfile(wav_path):
            logger.info("Using cached converted WAV: %s", wav_path)
            return wav_path

        logger.info("Converting %s to WAV 16kHz mono...", os.path.basename(audio_path))
        cmd = [
            "ffmpeg", "-y", "-i", audio_path,
            "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le",
            wav_path,
        ]
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await proc.communicate()

        if proc.returncode != 0 or not os.path.isfile(wav_path):
            error_msg = stderr.decode()[-300:] if stderr else "Unknown error"
            raise RuntimeError(
                f"Conversion audio échouée ({os.path.basename(audio_path)} → WAV): {error_msg}"
            )

        logger.info("Audio converted to WAV: %s", wav_path)
        return wav_path

    # ------------------------------------------------------------------
    # Model loading
    # ------------------------------------------------------------------

    async def load_model(self) -> None:
        """Load OpenAudio S1-mini models and create the TTSInferenceEngine."""
        logger.info("Loading OpenAudio S1-mini from %s ...", self.model_path)

        try:
            import torch
            from fish_speech.inference_engine import TTSInferenceEngine
            from fish_speech.models.dac.inference import load_model as load_dac_model
            from fish_speech.models.text2semantic.inference import (
                launch_thread_safe_queue,
            )
        except ImportError as e:
            raise RuntimeError(
                f"fish-speech is not installed or incomplete: {e}. "
                "Install with: cd /root/fish-speech && pip install ."
            ) from e

        # Find the model directory (contains model.pth + codec.pth + config.json)
        model_dir = self._find_model_dir()
        llama_ckpt = os.path.join(model_dir, "model.pth")
        dac_ckpt = os.path.join(model_dir, "codec.pth")
        logger.info("Model directory: %s", model_dir)
        logger.info("LLAMA checkpoint: %s", llama_ckpt)
        logger.info("DAC checkpoint:   %s", dac_ckpt)

        # Load models in a thread to avoid blocking the event loop
        def _load() -> TTSInferenceEngine:
            device = "cuda" if torch.cuda.is_available() else "cpu"
            dtype = torch.bfloat16 if device == "cuda" else torch.float32

            logger.info("Loading LLAMA model from %s on %s (%s)...", model_dir, device, dtype)
            llama_queue = launch_thread_safe_queue(
                checkpoint_path=model_dir,
                device=device,
                precision=dtype,
            )

            logger.info("Loading DAC decoder (modded_dac_vq) on %s...", device)
            decoder = load_dac_model(
                config_name="modded_dac_vq",
                checkpoint_path=dac_ckpt,
                device=device,
            )

            logger.info("Creating TTSInferenceEngine...")
            engine = TTSInferenceEngine(
                llama_queue=llama_queue,
                decoder_model=decoder,
                precision=dtype,
                compile=False,
            )
            return engine

        loop = asyncio.get_event_loop()
        self._engine = await loop.run_in_executor(None, _load)

        # Verify voice reference exists
        try:
            voice_ref = self._find_voice_reference()
            logger.info("Found voice reference: %s", voice_ref)
        except FileNotFoundError as e:
            logger.warning("Voice reference not ready: %s", e)

        self._loaded = True
        logger.info("TTS engine ready (OpenAudio S1-mini)")

    # ------------------------------------------------------------------
    # Speech generation
    # ------------------------------------------------------------------

    async def generate_speech(
        self,
        text: str,
        language: str = "fr",
        output_path: str = "/tmp/tts_output.wav",
    ) -> str:
        """Generate speech from text with voice cloning."""
        if not self.is_loaded:
            await self.load_model()

        voice_ref = self._find_voice_reference()
        voice_ref = await self._ensure_wav_format(voice_ref)

        logger.info(
            "Generating speech: lang=%s, text_len=%d, voice_ref=%s, output=%s",
            language,
            len(text),
            os.path.basename(voice_ref),
            output_path,
        )

        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        from fish_speech.utils.schema import ServeReferenceAudio, ServeTTSRequest

        # Read voice reference bytes
        with open(voice_ref, "rb") as f:
            voice_bytes = f.read()

        request = ServeTTSRequest(
            text=text,
            references=[
                ServeReferenceAudio(audio=voice_bytes, text=""),
            ],
            format="wav",
            streaming=False,
        )

        engine = self._engine

        # Run inference in a thread (it's blocking / CPU+GPU bound)
        def _infer() -> str:
            import soundfile as sf

            for result in engine.inference(request):
                if result.code == "final":
                    sample_rate, audio_np = result.audio
                    sf.write(output_path, audio_np, sample_rate)
                    logger.info(
                        "TTS completed: %s (sr=%d, samples=%d)",
                        output_path,
                        sample_rate,
                        len(audio_np),
                    )
                    return output_path
                elif result.code == "error":
                    raise RuntimeError(f"fish-speech inference error: {result.error}")

            raise RuntimeError(
                "fish-speech inference returned no final result. "
                "Check model checkpoints and voice reference."
            )

        loop = asyncio.get_event_loop()
        result_path = await loop.run_in_executor(None, _infer)

        if not os.path.isfile(result_path):
            raise RuntimeError(f"TTS output file not found: {result_path}")

        return result_path
