import base64
import json
import re

from services.gemini import MOCK_MODE, generate_with_parts

_TRANSCRIBE_PROMPT = (
    "Transcribe this audio exactly as spoken. "
    "The speaker may use Urdu, Roman Urdu (Urdu words in English letters), English, or Sindhi. "
    "Return ONLY a JSON object with these three fields:\n"
    '  "text": the exact transcription as a string\n'
    '  "detected_language": one of "urdu", "roman_urdu", "english", "sindhi", "mixed"\n'
    '  "confidence": a float between 0 and 1\n'
    "No explanation, no markdown — only raw JSON."
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

    try:
        import google.generativeai as genai
        audio_bytes = base64.b64decode(audio_base64)
        audio_part = genai.types.Part.from_data(data=audio_bytes, mime_type=mime_type)

        raw = await generate_with_parts([audio_part, _TRANSCRIBE_PROMPT])
        raw = raw.strip()

        json_match = re.search(r"\{.*\}", raw, re.DOTALL)
        if json_match:
            return json.loads(json_match.group())

        return {"text": raw, "detected_language": "mixed", "confidence": 0.7}

    except Exception as e:
        print(f"Voice transcription error: {e}")
        return {"text": "", "detected_language": "unknown", "confidence": 0.0, "error": str(e)}
