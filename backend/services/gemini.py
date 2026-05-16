import os
import json
import asyncio
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GOOGLE_GEMINI_API_KEY", "") or os.getenv("GEMINI_API_KEY", "")
MOCK_MODE = not GEMINI_API_KEY or GEMINI_API_KEY == "your_gemini_api_key"

_model = None

if not MOCK_MODE:
    try:
        genai.configure(api_key=GEMINI_API_KEY)
        _model = genai.GenerativeModel("gemini-2.0-flash-exp")
    except Exception as e:
        print(f"Gemini init error: {e} — switching to mock mode")
        MOCK_MODE = True


async def generate_with_parts(parts: list) -> str:
    """Generate content from multimodal parts — used for audio transcription."""
    if MOCK_MODE:
        return '{"text": "AC bilkul kaam nahi kar raha, kal subah repair chahiye", "detected_language": "roman_urdu", "confidence": 0.95}'
    try:
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(None, lambda: _model.generate_content(parts))
        return response.text
    except Exception as e:
        print(f"Gemini multimodal error: {e} — falling back to mock")
        return '{"text": "", "detected_language": "unknown", "confidence": 0.0}'


async def generate(prompt: str, system_prompt: str = "") -> str:
    if MOCK_MODE:
        return _mock_gemini_response(prompt, system_prompt)

    try:
        full_prompt = f"{system_prompt}\n\n{prompt}" if system_prompt else prompt
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(None, lambda: _model.generate_content(full_prompt))
        return response.text
    except Exception as e:
        print(f"Gemini API error: {e} — falling back to mock")
        return _mock_gemini_response(prompt, system_prompt)


def _mock_gemini_response(prompt: str, system_prompt: str = "") -> str:
    sp_lower = system_prompt.lower()

    if "samajh" in sp_lower or "extract" in sp_lower and "service" in sp_lower:
        p_lower = prompt.lower()
        service = "AC repair"
        if "plumb" in p_lower or "nal" in p_lower or "paani" in p_lower:
            service = "plumber"
        elif "electric" in p_lower or "bijli" in p_lower:
            service = "electrician"
        elif "tutor" in p_lower or "math" in p_lower:
            service = "tutor"
        elif "beauty" in p_lower or "salon" in p_lower:
            service = "beautician"
        elif "carpent" in p_lower or "furniture" in p_lower:
            service = "carpenter"
        elif "paint" in p_lower or "rang" in p_lower:
            service = "painter"

        city = "Islamabad"
        if "karachi" in p_lower or "khi" in p_lower:
            city = "Karachi"
        elif "lahore" in p_lower or "lhr" in p_lower:
            city = "Lahore"

        is_emergency = any(kw in p_lower for kw in ["gas leak", "aag", "fire", "bijli ka jhatka", "emergency"])
        return json.dumps({
            "service_type": service,
            "location": "G-13",
            "city": city,
            "time_preference": "tomorrow_morning",
            "urgency": "critical" if is_emergency else "high",
            "budget_sensitivity": "high",
            "job_complexity": "intermediate",
            "emergency": is_emergency,
            "confidence_score": 0.92,
            "clarification_needed": False,
            "clarification_question": None,
            "detected_language": "roman_urdu",
            "special_requirements": None,
        })

    if "jhagra" in sp_lower or "dispute" in sp_lower:
        return json.dumps({
            "resolution": "Refund approved based on provider no-show",
            "refund_amount": 1200,
            "provider_penalty": "warning_issued",
            "case_summary": "Provider failed to arrive at scheduled time. Full refund approved.",
            "escalated_to_human": False,
        })

    if "hisaab" in sp_lower or "pricing" in sp_lower:
        return json.dumps({
            "estimated_hours": 2,
            "surge_factor": 1.0,
            "notes": "Standard rate applies. No surge demand in the area.",
        })

    return json.dumps({"response": "Mock Gemini OK", "prompt_preview": prompt[:80]})
