import asyncio
import base64
import json
import re

from services.gemini import MOCK_MODE, generate_with_parts

_TRANSCRIBE_PROMPT = (
    "Transcribe this audio. The speaker may use Urdu, Roman Urdu, English, or mixed. "
    "CRITICAL: Always write the transcription using English/Latin letters only (Roman Urdu). "
    "NEVER use Urdu script, Arabic script, Devanagari, or any non-Latin characters. "
    "Write all Urdu words phonetically in English letters — for example: "
    "'mujhe AC repair chahiye G-13 mein' not 'مجھے AC ریپیئر چاہیے'."
    "Return ONLY a JSON object:\n"
    '{"text": "roman urdu transcription here", "detected_language": "roman_urdu", "confidence": 0.95}\n'
    "No explanation, no markdown, no extra text — only raw JSON."
)

_MOCK_RESPONSES = [
    {"text": "AC bilkul kaam nahi kar raha, kal subah G-13 mein technician chahiye", "detected_language": "roman_urdu", "confidence": 0.96},
    {"text": "Mujhe plumber chahiye, nal se paani aa raha hai", "detected_language": "roman_urdu", "confidence": 0.94},
    {"text": "I need an electrician urgently, power is out", "detected_language": "english", "confidence": 0.98},
]

_mock_index = 0


async def transcribe_audio(audio_base64: str, mime_type: str = "audio/m4a") -> dict:
    global _mock_index
    if MOCK_MODE:
        response = _MOCK_RESPONSES[_mock_index % len(_MOCK_RESPONSES)]
        _mock_index += 1
        return response

    audio_part = {
        "inline_data": {
            "mime_type": mime_type,
            "data": audio_base64,  # base64 string, not bytes
        }
    }
    try:
        raw = await generate_with_parts([audio_part, _TRANSCRIBE_PROMPT])
        raw = (raw or "").strip()
        json_match = re.search(r"\{.*\}", raw, re.DOTALL)
        if json_match:
            return json.loads(json_match.group())
        if raw:
            return {"text": raw, "detected_language": "mixed", "confidence": 0.7}
    except Exception as e:
        print(f"Voice transcription error: {e}")

    return {"text": "", "detected_language": "unknown", "confidence": 0.0}
