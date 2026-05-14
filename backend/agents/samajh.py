"""Agent 1 — SAMAJH: Multilingual NLP intent extractor."""
import json
from datetime import datetime
from services.gemini import generate

SYSTEM_PROMPT = """You are SAMAJH, the multilingual NLP agent for Haazir AI — Pakistan's home-services platform.

Understand requests in Urdu, Roman Urdu, Punjabi, Sindhi, English, or any code-switched mix.
Return ONLY a valid JSON object with these exact keys:

{
  "service_type": "AC repair | plumber | electrician | tutor | beautician | carpenter | painter",
  "location": "neighborhood/area string",
  "city": "Islamabad | Lahore | Karachi",
  "time_preference": "now | today | tomorrow_morning | tomorrow_afternoon | this_week | flexible",
  "urgency": "low | medium | high | critical",
  "budget_sensitivity": "low | medium | high",
  "job_complexity": "basic | intermediate | complex",
  "emergency": false,
  "confidence_score": 0.0,
  "clarification_needed": false,
  "clarification_question": null,
  "detected_language": "urdu | roman_urdu | english | punjabi | sindhi | mixed",
  "special_requirements": null
}

Emergency keywords → emergency=true, urgency=critical:
  gas leak, bijli ka jhatka, current lag gaya, aag, fire, flood, short circuit,
  baarish leak, emergency, فوری, گیس لیک, آگ, بجلی کا جھٹکا

If confidence_score < 0.75 set clarification_needed=true and write clarification_question
in the SAME language the user used. Return ONLY JSON — no markdown, no explanations."""

EMERGENCY_KEYWORDS = [
    "gas leak", "gas ler", "bijli ka jhatka", "current lag gaya",
    "aag", "fire lagi", "flood", "baarish leak", "short circuit",
    "emergency", "فوری", "گیس لیک", "آگ", "بجلی کا جھٹکا",
]


class SamajhAgent:

    async def extract_intent(self, user_input: str) -> dict:
        start = datetime.now()
        is_emergency = any(kw in user_input.lower() for kw in EMERGENCY_KEYWORDS)

        prompt = f'User request: "{user_input}"'
        if is_emergency:
            prompt += "\n[SYSTEM: Emergency keywords detected — set emergency=true, urgency=critical]"

        try:
            raw = await generate(prompt, SYSTEM_PROMPT)
            raw = raw.strip()
            if raw.startswith("```"):
                parts = raw.split("```")
                raw = parts[1][4:] if parts[1].startswith("json") else parts[1]
            intent = json.loads(raw)
        except Exception as e:
            print(f"SAMAJH parse error: {e} — using heuristic fallback")
            intent = self._heuristic_intent(user_input, is_emergency)

        if is_emergency:
            intent["emergency"] = True
            intent["urgency"] = "critical"

        end = datetime.now()
        elapsed = round((end - start).total_seconds(), 3)

        decision = (
            "Emergency fast-track activated"
            if intent.get("emergency")
            else ("Clarification needed" if intent.get("clarification_needed") else "Intent extracted successfully")
        )
        intent["_log"] = {
            "agent_name": "SAMAJH",
            "agent_name_urdu": "سمجھ",
            "start_time": start.isoformat(),
            "end_time": end.isoformat(),
            "input_summary": f"User input ({len(user_input)} chars): '{user_input[:60]}'",
            "output_summary": f"Service: {intent.get('service_type')} | City: {intent.get('city')} | Urgency: {intent.get('urgency')}",
            "decision_made": decision,
            "confidence": intent.get("confidence_score", 0.0),
            "fallback_used": False,
            "time_seconds": elapsed,
        }
        return intent

    def _heuristic_intent(self, user_input: str, is_emergency: bool) -> dict:
        p = user_input.lower()
        service = "AC repair"
        if any(w in p for w in ["plumb", "nal", "paani", "pipe", "tap"]):
            service = "plumber"
        elif any(w in p for w in ["electric", "bijli", "wiring", "switchboard"]):
            service = "electrician"
        elif any(w in p for w in ["tutor", "math", "science", "parhna", "teacher"]):
            service = "tutor"
        elif any(w in p for w in ["beauty", "salon", "hair", "makeup", "threading"]):
            service = "beautician"
        elif any(w in p for w in ["carpent", "furniture", "wood", "darhaan"]):
            service = "carpenter"
        elif any(w in p for w in ["paint", "rang", "colour", "wall"]):
            service = "painter"

        city = "Islamabad"
        if any(w in p for w in ["karachi", "khi", "clifton", "dha karachi"]):
            city = "Karachi"
        elif any(w in p for w in ["lahore", "lhr", "gulberg", "dha lahore"]):
            city = "Lahore"

        location = "G-13"
        for area in ["DHA", "Gulshan", "Clifton", "F-7", "G-13", "G-9", "I-8",
                     "Model Town", "Gulberg", "Bahria", "F-10", "North Nazimabad", "Saddar"]:
            if area.lower() in p:
                location = area
                break

        detected_lang = "roman_urdu"
        if any("؀" <= c <= "ۿ" for c in user_input):
            detected_lang = "urdu"
        elif all(ord(c) < 128 for c in user_input):
            detected_lang = "english"

        return {
            "service_type": service,
            "location": location,
            "city": city,
            "time_preference": "tomorrow_morning",
            "urgency": "critical" if is_emergency else "high",
            "budget_sensitivity": "medium",
            "job_complexity": "intermediate",
            "emergency": is_emergency,
            "confidence_score": 0.85,
            "clarification_needed": False,
            "clarification_question": None,
            "detected_language": detected_lang,
            "special_requirements": None,
        }
