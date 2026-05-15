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

        # --- service (explicit branches only; None = unclear) ---
        service = None
        if any(w in p for w in ["plumb", "nal", "paani", "pipe", "tap", "drain"]):
            service = "plumber"
        elif any(w in p for w in ["electric", "bijli", "wiring", "switchboard", "ups"]):
            service = "electrician"
        elif any(w in p for w in ["tutor", "math", "science", "parhna", "teacher"]):
            service = "tutor"
        elif any(w in p for w in ["beauty", "salon", "hair", "makeup", "threading"]):
            service = "beautician"
        elif any(w in p for w in ["carpent", "furniture", "wood", "darhaan"]):
            service = "carpenter"
        elif any(w in p for w in ["paint", "rang", "colour", "wall"]):
            service = "painter"
        elif "gas leak" in p or "gas ler" in p or ("gas" in p and "leak" in p):
            service = "electrician"
        elif any(
            w in p
            for w in [
                "ac repair",
                "ac technician",
                "split",
                "inverter",
                "cooling",
                " gas refill",
                "gas refill",
                " ac ",
                " ac,",
                "ac.",
                "/ac",
            ]
        ) or (p.strip().startswith("ac ") or " ac " in f" {p} "):
            service = "AC repair"

        # --- city (default Islamabad only if no signal) ---
        city = None
        karachi_sig = [
            "karachi",
            "khi",
            "clifton",
            "dha karachi",
            "gulshan",
            "nazimabad",
            "pechs",
            "saddar karachi",
        ]
        lahore_sig = ["lahore", "lhr", "gulberg", "dha lahore", "model town", "johar town"]
        islamabad_sig = [
            "islamabad",
            "isb",
            "f-7",
            "f-10",
            "g-9",
            "g-13",
            "i-8",
            "blue area",
            "bahria islamabad",
        ]
        if any(w in p for w in karachi_sig):
            city = "Karachi"
        elif any(w in p for w in lahore_sig):
            city = "Lahore"
        elif any(w in p for w in islamabad_sig):
            city = "Islamabad"
        else:
            city = "Islamabad"

        # --- location: longest area substring first; empty if none ---
        area_candidates = [
            "North Nazimabad",
            "Blue Area",
            "Tariq Road",
            "Model Town",
            "Johar Town",
            "Gulshan-e-Iqbal",
            "Gulshan",
            "Clifton",
            "Defence",
            "Bahria",
            "Gulberg",
            "Saddar",
            "Pechs",
            "Nazimabad",
            "F-10",
            "F-7",
            "F-6",
            "G-9",
            "G-11",
            "G-13",
            "I-10",
            "I-8",
            "DHA",
            "Rawalpindi",
            "Pindi",
            "Askari",
        ]
        area_candidates.sort(key=len, reverse=True)
        location = ""
        for area in area_candidates:
            if area.lower() in p:
                location = area
                break
        if city == "Karachi" and not location:
            location = ""
        if city == "Islamabad" and not location:
            location = ""

        # --- service keyword strength (for clarification) ---
        service_kw = [
            "ac repair",
            "ac technician",
            "split",
            "inverter",
            "cooling",
            "gas refill",
            "plumb",
            "nal",
            "paani",
            "pipe",
            "tap",
            "drain",
            "electric",
            "bijli",
            "wiring",
            "switchboard",
            "ups",
            "tutor",
            "math",
            "science",
            "teacher",
            "parhna",
            "beauty",
            "salon",
            "hair",
            "makeup",
            "carpent",
            "furniture",
            "wood",
            "paint",
            "rang",
            "wall",
            "colour",
            "gas leak",
            "gas ler",
        ]
        kw_hits = sum(1 for kw in service_kw if kw in p)
        if " ac " in f" {p} " or p.strip().startswith("ac "):
            if "ac repair" not in p and "ac technician" not in p:
                kw_hits += 1

        if service is not None:
            kw_hits = max(kw_hits, 2)

        needs_clarification = (service is None) or (kw_hits < 2)

        detected_lang = "roman_urdu"
        if any("؀" <= c <= "ۿ" for c in user_input):
            detected_lang = "urdu"
        elif all(ord(c) < 128 for c in user_input):
            detected_lang = "english"

        if needs_clarification:
            service_type_out = "unknown"
            confidence_score = 0.55
            clarification_needed = True
            clarification_question = (
                "Aap kaunsi service chahiye? "
                "Maslan: AC repair, plumber, electrician, painter, tutor, beautician"
            )
        elif not location.strip():
            service_type_out = service
            confidence_score = 0.65
            clarification_needed = False
            clarification_question = None
        else:
            service_type_out = service
            confidence_score = 0.90
            clarification_needed = False
            clarification_question = None

        return {
            "service_type": service_type_out,
            "location": location,
            "city": city,
            "time_preference": "tomorrow_morning",
            "urgency": "critical" if is_emergency else "high",
            "budget_sensitivity": "medium",
            "job_complexity": "intermediate",
            "emergency": is_emergency,
            "confidence_score": confidence_score,
            "clarification_needed": clarification_needed,
            "clarification_question": clarification_question,
            "detected_language": detected_lang,
            "special_requirements": None,
        }
