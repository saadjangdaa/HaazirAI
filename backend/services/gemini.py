import os
import re
import json
import asyncio
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
MOCK_MODE = not GEMINI_API_KEY or GEMINI_API_KEY == "your_gemini_api_key"

_model = None

if not MOCK_MODE:
    try:
        genai.configure(api_key=GEMINI_API_KEY)
        _model = genai.GenerativeModel("gemini-2.0-flash")
    except Exception as e:
        print(f"Gemini init error: {e} — switching to mock mode")
        MOCK_MODE = True


async def generate(prompt: str, system_prompt: str = "", *, json_mode: bool = False) -> str:
    if MOCK_MODE:
        return _mock_gemini_response(prompt, system_prompt)

    try:
        full_prompt = f"{system_prompt}\n\n{prompt}" if system_prompt else prompt
        loop = asyncio.get_event_loop()

        def _call():
            kwargs: dict = {}
            if json_mode:
                kwargs["generation_config"] = genai.GenerationConfig(
                    response_mime_type="application/json",
                )
            return _model.generate_content(full_prompt, **kwargs)

        response = await loop.run_in_executor(None, _call)
        return response.text
    except Exception as e:
        print(f"Gemini API error: {e} — falling back to mock")
        return _mock_gemini_response(prompt, system_prompt)


def _mock_gemini_response(prompt: str, system_prompt: str = "") -> str:
    sp_lower = system_prompt.lower()

    if "samajh" in sp_lower or ("extract" in sp_lower and "service" in sp_lower):
        # Reuse Samajh offline heuristics so mock mode matches production fallback (no stale defaults).
        from agents.samajh import SamajhAgent, _detect_emergency

        m = re.search(r'User request:\s*\n*"""([\s\S]*?)"""', prompt)
        user_text = (m.group(1).strip() if m else prompt.strip())
        agent = SamajhAgent()
        payload = agent._heuristic_intent(user_text, _detect_emergency(user_text))
        return json.dumps(payload, ensure_ascii=False)

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
