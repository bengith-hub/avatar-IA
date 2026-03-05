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
        self._pip_installed = False
        self._fish_speech_dir: str | None = None

    @property
    def is_loaded(self) -> bool:
        return self._loaded

    def _check_pip_installed(self) -> bool:
        """Check if fish-speech is installed as a pip package."""
        result = subprocess.run(
            [sys.executable, "-c", "import fish_speech; print('ok')"],
            capture_output=True,
            text=True,
            timeout=30,
        )
        return result.returncode == 0

    def _find_fish_speech_dir(self) -> str | None:
        """Try to locate a fish-speech source directory (optional)."""
        candidates = [
            os.path.join(self.model_path, "fish-speech"),
            "/root/avatar-data/models/fish-audio/fish-speech",
            os.path.expanduser("~/fish-speech"),
        ]
        for path in candidates:
            if not os.path.isdir(path):
                continue
            if os.path.isfile(os.path.join(path, "tools", "inference.py")):
                return path
            if os.path.isfile(os.path.join(path, "fish_speech", "inference.py")):
                return path
        return None

    def _find_voice_reference(self) -> str:
        """Find the voice reference audio file for cloning."""
        if not os.path.isdir(self.voice_path):
            raise FileNotFoundError(
                f"Voice directory not found: {self.voice_path}. "
                "Create it and add a .wav file (10-30s of Benjamin's voice)."
            )
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

        # Check pip-installed package first
        self._pip_installed = self._check_pip_installed()
        if self._pip_installed:
            logger.info("fish-speech found as pip package")
        else:
            logger.warning("fish-speech not importable via pip")

        # Also check for a source directory (fallback for older versions)
        self._fish_speech_dir = self._find_fish_speech_dir()
        if self._fish_speech_dir:
            logger.info("Found fish-speech directory at: %s", self._fish_speech_dir)

        if not self._pip_installed and not self._fish_speech_dir:
            logger.warning(
                "fish-speech not found (neither pip package nor source directory). "
                "Install with: pip install fish-speech"
            )

        # Verify voice reference exists
        try:
            voice_ref = self._find_voice_reference()
            logger.info("Found voice reference: %s", voice_ref)
        except FileNotFoundError as e:
            logger.warning("Voice reference not ready: %s", e)

        # Mark as loaded so the worker can start
        self._loaded = True
        logger.info("TTS engine ready (pip=%s, dir=%s)", self._pip_installed, self._fish_speech_dir)

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

        logger.info(
            "Generating speech: lang=%s, text_len=%d, voice_ref=%s, output=%s",
            language,
            len(text),
            os.path.basename(voice_ref),
            output_path,
        )

        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        # Map language codes
        lang_map = {
            "fr": "fr", "en": "en", "de": "de", "es": "es",
            "ja": "ja", "ko": "ko", "ar": "ar", "zh": "zh",
            "ru": "ru", "nl": "nl", "it": "it", "pl": "pl", "pt": "pt",
        }
        fish_lang = lang_map.get(language, language)

        # Strategy 1: pip-installed module (preferred)
        if self._pip_installed:
            cmd = [
                sys.executable, "-m", "fish_speech.inference",
                "--text", text,
                "--reference-audio", voice_ref,
                "--output", output_path,
                "--language", fish_lang,
            ]
            logger.info("Running fish-speech via pip module: %s", " ".join(cmd[:6]) + "...")

            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await proc.communicate()

            if proc.returncode == 0 and os.path.isfile(output_path):
                logger.info("TTS completed (pip module): %s", output_path)
                return output_path

            error_msg = stderr.decode()[-500:] if stderr else "Unknown error"
            logger.warning("pip module inference failed (rc=%d): %s", proc.returncode, error_msg)

            # Try alternative argument names
            cmd_alt = [
                sys.executable, "-m", "fish_speech.inference",
                "--text", text,
                "--reference-audio", voice_ref,
                "--output-path", output_path,
                "--language", fish_lang,
            ]
            proc = await asyncio.create_subprocess_exec(
                *cmd_alt,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await proc.communicate()

            if proc.returncode == 0 and os.path.isfile(output_path):
                logger.info("TTS completed (pip module alt args): %s", output_path)
                return output_path

            error_msg = stderr.decode()[-500:] if stderr else "Unknown error"
            logger.warning("pip module alt args failed (rc=%d): %s", proc.returncode, error_msg)

        # Strategy 2: source directory with tools/inference.py (older versions)
        if self._fish_speech_dir:
            tools_script = os.path.join(self._fish_speech_dir, "tools", "inference.py")
            if os.path.isfile(tools_script):
                cmd = [
                    sys.executable, tools_script,
                    "--text", text,
                    "--reference-audio", voice_ref,
                    "--output-path", output_path,
                ]
                logger.info("Running fish-speech via tools/inference.py...")

                proc = await asyncio.create_subprocess_exec(
                    *cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    cwd=self._fish_speech_dir,
                )
                stdout, stderr = await proc.communicate()

                if proc.returncode == 0 and os.path.isfile(output_path):
                    logger.info("TTS completed (tools/inference.py): %s", output_path)
                    return output_path

                error_msg = stderr.decode()[-500:] if stderr else "Unknown error"
                logger.warning("tools/inference.py failed: %s", error_msg)

        # Nothing worked
        if not self._pip_installed and not self._fish_speech_dir:
            raise RuntimeError(
                "fish-speech n'est pas installé. "
                "Installez-le sur la VM avec : pip install fish-speech"
            )

        raise RuntimeError(
            "fish-speech TTS a échoué avec toutes les méthodes. "
            "Vérifiez les logs du worker pour plus de détails."
        )
