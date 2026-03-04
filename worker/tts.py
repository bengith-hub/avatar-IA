from __future__ import annotations

import asyncio
import logging
import os
import subprocess
import sys

logger = logging.getLogger(__name__)


class TTSEngine:
    """Interface to FishAudio fish-speech for text-to-speech with voice cloning."""

    def __init__(self, model_path: str, voice_path: str) -> None:
        self.model_path = model_path
        self.voice_path = voice_path
        self._loaded = False
        self._fish_speech_dir: str | None = None

    @property
    def is_loaded(self) -> bool:
        return self._loaded

    def _find_fish_speech(self) -> str:
        """Locate the fish-speech installation directory."""
        candidates = [
            os.path.join(self.model_path, "fish-speech"),
            "/root/avatar-data/models/fish-audio/fish-speech",
            os.path.expanduser("~/fish-speech"),
        ]
        for path in candidates:
            if os.path.isdir(path) and os.path.isfile(
                os.path.join(path, "tools", "inference.py")
            ):
                return path
            # Also check for the newer API structure
            if os.path.isdir(path) and os.path.isfile(
                os.path.join(path, "fish_speech", "inference.py")
            ):
                return path
        raise FileNotFoundError(
            f"fish-speech installation not found in: {candidates}"
        )

    def _find_voice_reference(self) -> str:
        """Find the voice reference audio file for cloning."""
        for filename in os.listdir(self.voice_path):
            if filename.lower().endswith((".wav", ".mp3", ".flac", ".ogg")):
                return os.path.join(self.voice_path, filename)
        raise FileNotFoundError(
            f"No voice reference audio found in {self.voice_path}. "
            "Add a .wav file (10-30s of Benjamin's voice) to this directory."
        )

    async def load_model(self) -> None:
        """Verify fish-speech is installed and models are available."""
        logger.info("Verifying FishAudio fish-speech installation...")

        try:
            self._fish_speech_dir = self._find_fish_speech()
            logger.info("Found fish-speech at: %s", self._fish_speech_dir)

            # Verify voice reference exists
            voice_ref = self._find_voice_reference()
            logger.info("Found voice reference: %s", voice_ref)

            # Verify the CLI tool works
            result = subprocess.run(
                [sys.executable, "-c", "import fish_speech; print('ok')"],
                capture_output=True,
                text=True,
                timeout=30,
                cwd=self._fish_speech_dir,
            )
            if result.returncode == 0:
                logger.info("fish-speech Python package verified")
            else:
                logger.warning(
                    "fish-speech import check failed (will try CLI): %s",
                    result.stderr[:200],
                )

            self._loaded = True
            logger.info("FishAudio fish-speech ready")

        except FileNotFoundError as e:
            logger.warning("FishAudio setup incomplete: %s", e)
            # Mark as loaded anyway so the worker can start
            # Generation will fail with a clear error
            self._loaded = True

    async def generate_speech(
        self,
        text: str,
        language: str = "fr",
        output_path: str = "/tmp/tts_output.wav",
    ) -> str:
        """Generate speech from text with voice cloning.

        Uses fish-speech CLI for maximum compatibility across versions.
        The CLI handles model loading, voice cloning, and audio generation.
        """
        if not self.is_loaded:
            await self.load_model()

        if self._fish_speech_dir is None:
            self._fish_speech_dir = self._find_fish_speech()

        voice_ref = self._find_voice_reference()

        logger.info(
            "Generating speech: lang=%s, text_len=%d, voice_ref=%s, output=%s",
            language,
            len(text),
            os.path.basename(voice_ref),
            output_path,
        )

        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        # Map language codes to fish-speech language names
        lang_map = {
            "fr": "fr",
            "en": "en",
            "de": "de",
            "es": "es",
            "ja": "ja",
            "ko": "ko",
            "ar": "ar",
            "zh": "zh",
            "ru": "ru",
            "nl": "nl",
            "it": "it",
            "pl": "pl",
            "pt": "pt",
        }
        fish_lang = lang_map.get(language, language)

        # Use fish-speech inference CLI
        # This approach works with both older and newer versions
        cmd = [
            sys.executable, "-m", "fish_speech.inference",
            "--text", text,
            "--reference-audio", voice_ref,
            "--output", output_path,
        ]

        # Add language if supported by the version
        cmd.extend(["--language", fish_lang])

        logger.info("Running fish-speech TTS: %s", " ".join(cmd[:6]) + "...")

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=self._fish_speech_dir,
        )
        stdout, stderr = await proc.communicate()

        if proc.returncode != 0:
            error_msg = stderr.decode()[-500:] if stderr else "Unknown error"
            # Try alternative CLI format (older versions)
            logger.warning("Primary CLI failed, trying alternative format...")
            cmd_alt = [
                sys.executable, "tools/inference.py",
                "--text", text,
                "--reference-audio", voice_ref,
                "--output-path", output_path,
            ]

            proc = await asyncio.create_subprocess_exec(
                *cmd_alt,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=self._fish_speech_dir,
            )
            stdout, stderr = await proc.communicate()

            if proc.returncode != 0:
                error_msg = stderr.decode()[-500:] if stderr else "Unknown error"
                raise RuntimeError(f"fish-speech TTS failed: {error_msg}")

        if not os.path.isfile(output_path):
            raise RuntimeError(
                f"TTS output file not created at {output_path}. "
                "Check fish-speech installation and model weights."
            )

        logger.info("TTS completed: %s", output_path)
        return output_path
