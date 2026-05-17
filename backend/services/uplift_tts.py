import os
import base64
import httpx
from dotenv import load_dotenv

load_dotenv()

UPLIFT_API_KEY = os.getenv("UPLIFT_AI_API_KEY", "")
UPLIFT_BASE_URL = "https://api.upliftai.org/v1"
MOCK_MODE = not UPLIFT_API_KEY

# Voice IDs from Uplift AI docs
VOICE_URDU_FEMALE = "v_meklc281"   # Proper Urdu female voice
VOICE_PROFESSIONAL = "v_8eelc901"  # Info/Edu female
VOICE_CLEAR = "v_kwmp7zxt"         # Gen Z clear


async def _translate_to_urdu(text: str) -> str:
    """Convert Roman Urdu or English to Urdu script using Gemini."""
    from services.gemini import generate
    result = await generate(
        text,
        system_prompt=(
            "You are a translator. Convert the given text to proper Urdu script (Nastaliq). "
            "If the text is Roman Urdu (Urdu words in English letters), translate it to Urdu script. "
            "If it is English, translate it to natural spoken Urdu. "
            "Return ONLY the Urdu script text — no explanation, no extra text."
        ),
    )
    return result.strip()


async def text_to_speech(text: str, voice_id: str = VOICE_URDU_FEMALE, translate: bool = True) -> dict:
    """
    Convert text to Urdu speech using Uplift AI.
    Optionally translates Roman Urdu / English to Urdu script first.
    Returns { success, audio_base64, content_type, duration_ms } or { success, error }.
    """
    if MOCK_MODE:
        return {"success": False, "error": "UPLIFT_AI_API_KEY not configured", "mock": True}

    try:
        urdu_text = await _translate_to_urdu(text) if translate else text

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{UPLIFT_BASE_URL}/synthesis/text-to-speech",
                headers={
                    "Authorization": f"Bearer {UPLIFT_API_KEY}",
                    "Content-Type": "application/json",
                    "Accept": "audio/mpeg, application/json",
                },
                json={
                    "text": urdu_text[:2500],  # Uplift limit
                    "voiceId": voice_id,
                    "outputFormat": "MP3_22050_128",
                },
            )

        if not response.is_success:
            return {"success": False, "error": f"Uplift API {response.status_code}: {response.text}"}

        content_type = response.headers.get("content-type", "")
        duration_ms = response.headers.get("x-uplift-ai-audio-duration")

        if "audio/" in content_type:
            audio_base64 = base64.b64encode(response.content).decode()
            return {
                "success": True,
                "audio_base64": audio_base64,
                "content_type": content_type,
                "duration_ms": duration_ms,
                "voice_id": voice_id,
                "urdu_text": urdu_text,
            }

        data = response.json()
        return {
            "success": True,
            "audio_url": data.get("audioUrl") or data.get("audio_url"),
            "content_type": "audio/mpeg",
            "voice_id": voice_id,
        }

    except Exception as e:
        return {"success": False, "error": str(e)}
