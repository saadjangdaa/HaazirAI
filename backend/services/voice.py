"""
Voice layer — placeholder for Uplift AI integration (speech-to-text / TTS).

Future flow (documented for judges / developers):
    User audio
        → transcribe_audio()   # Uplift AI STT
        → same string pipeline as typed text → Samajh → LangGraph
        → optional generate_voice_response()  # Urdu confirmations, summaries, etc.

For the hackathon prototype, callers use text `user_input` directly.
When voice ships, FastAPI can accept multipart audio, call transcribe_audio(),
then invoke ``run_samajh_workflow(user_input=text, source="voice_transcript")``.
"""
from __future__ import annotations

from typing import Any


async def transcribe_audio(
    audio_bytes: bytes,
    *,
    language_hint: str | None = None,
    content_type: str = "audio/wav",
) -> dict[str, Any]:
    """
    Convert user audio to text via Uplift AI (not wired yet).

    Returns a dict so we can extend with confidence, diarization, etc. later.
    """
    _ = (audio_bytes, language_hint, content_type)
    return {
        "text": "",
        "mock": True,
        "message": "Voice STT not enabled — send user_input as text for now.",
    }


async def generate_voice_response(
    text: str,
    *,
    voice_profile: str = "urdu_neutral",
) -> dict[str, Any]:
    """
    Text-to-speech for confirmations, booking summaries, dispute updates (future).

    Will likely call Uplift AI or a TTS provider with Roman Urdu / Urdu copy.
    """
    _ = voice_profile
    return {
        "audio_url": None,
        "mock": True,
        "message": "Voice TTS not enabled.",
        "input_preview": text[:120],
    }
