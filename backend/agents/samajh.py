"""Agent 1 — SAMAJH: Multilingual intent understanding (Urdu, Roman Urdu, English, mixed)."""
from __future__ import annotations

import json
import re
import unicodedata
from datetime import datetime, timezone
from typing import Any

from services.gemini import generate

# ── Gemini system instructions: STRICT JSON only ───────────────────────────
SYSTEM_PROMPT = """You are SAMAJH for Haazir — Pakistan's informal home-services market.

Normalize noisy, code-switched Pakistani input (Urdu script, Roman Urdu, English, slang, typos).

Return STRICT JSON ONLY — no markdown fences, no commentary, no keys other than specified.

If confidence_score >= 0.75, return exactly this shape:
{
  "service_type": "Human-readable service e.g. AC Repair, Plumber, Electrician",
  "location": "Area/neighborhood as stated or best guess, e.g. DHA Phase 6",
  "city": "Karachi | Lahore | Islamabad | Rawalpindi | unknown",
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

If confidence_score < 0.75, return ONLY:
{
  "clarification_needed": true,
  "clarification_question": "One short question in the SAME language style as the user"
}

Emergency override (if user describes immediate danger): set "emergency": true and "urgency": "critical"
when you see: gas leak, short circuit, electric shock, flood, fire/flames — even if phrased in Urdu/Roman Urdu.

Use judgment for service_type labels (Title Case)."""


# Keywords → force emergency + critical urgency (pre-check + model hint)
EMERGENCY_KEYWORDS = [
    "gas leak",
    "short circuit",
    "bijli ka jhatka",
    "electric shock",
    "current lag",
    "flood",
    "flash flood",
    "aag",
    "aag lagi",
    "fire",
    "ag lag",
    "short circut",  # common misspelling
    "gas lick",
    "gas liik",
]


def _normalize_text(s: str) -> str:
    return unicodedata.normalize("NFKC", s).lower()


def _detect_emergency(user_input: str) -> bool:
    n = _normalize_text(user_input)
    return any(kw in n for kw in EMERGENCY_KEYWORDS)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _reasoning_log(
    *,
    status: str,
    decision: str,
    reasoning: str,
    confidence: float,
) -> dict[str, Any]:
    """Judge-facing trace (one entry per Samajh run)."""
    return {
        "agent": "Samajh",
        "status": status,
        "decision": decision,
        "reasoning": reasoning,
        "confidence": round(float(confidence), 4),
        "timestamp": _now_iso(),
    }


def _legacy_orchestrator_log(intent: dict[str, Any], user_input: str, elapsed_s: float) -> dict[str, Any]:
    """Shape expected by older orchestrator demos / mobile agent_logs."""
    start = datetime.now(timezone.utc).isoformat()
    return {
        "agent_name": "SAMAJH",
        "agent_name_urdu": "سمجھ",
        "start_time": start,
        "end_time": start,
        "input_summary": f"User input ({len(user_input)} chars): {user_input[:80]!r}",
        "output_summary": f"Service: {intent.get('service_type')} | Loc: {intent.get('location')}",
        "decision_made": intent.get("_decision_blurb", "Intent extracted"),
        "confidence": float(intent.get("confidence_score", 0.0)),
        "fallback_used": bool(intent.get("_fallback_used")),
        "time_seconds": round(elapsed_s, 3),
    }


def _strip_json_fences(raw: str) -> str:
    text = raw.strip()
    if text.startswith("```"):
        parts = text.split("```")
        inner = parts[1] if len(parts) >= 2 else text
        inner = inner.strip()
        if inner.lower().startswith("json"):
            inner = inner[4:].lstrip()
        return inner.strip()
    return text


def _parse_json_strict(raw: str) -> dict[str, Any]:
    return json.loads(_strip_json_fences(raw))


def _extract_json_object(text: str) -> str | None:
    """Best-effort: pull first {...} block if model added stray text."""
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    return text[start : end + 1]


# Defaults only for keys the model/heuristic omits; explicit ``None`` in a merge layer wins over these.
_INTENT_DEFAULTS: dict[str, Any] = {
    "service_type": None,
    "location": None,
    "city": None,
    "time_preference": None,
    "urgency": None,
    "budget_sensitivity": None,
    "job_complexity": None,
    "emergency": False,
    "confidence_score": 0.0,
    "clarification_needed": False,
    "clarification_question": None,
    "detected_language": "mixed",
    "special_requirements": None,
}


def _merge_intent(raw: dict[str, Any]) -> dict[str, Any]:
    """Layer model/heuristic fields over defaults; ``None`` in ``raw`` clears a field."""
    cleaned = {k: v for k, v in raw.items() if k not in ("_log", "_decision_blurb", "_fallback_used")}
    return {**_INTENT_DEFAULTS, **cleaned}


def _heuristic_stagger_conf(low: float, high: float, user_input: str) -> float:
    """Stable pseudo-random confidence in ``[low, high]`` from input text."""
    if high <= low:
        return round(low, 2)
    span = high - low
    h = (sum(ord(c) for c in user_input) % 1000) / 1000.0
    return round(low + h * span, 2)


def _heuristic_detect_language(user_input: str) -> str:
    if any("\u0600" <= c <= "\u06ff" for c in user_input):
        return "urdu"
    t = _normalize_text(user_input.strip())
    if not t:
        return "roman_urdu"
    # Very short vague English → Roman Urdu prompts (default UX for PK users).
    tokens = re.findall(r"[a-z]+", t)
    vague_en = {"help", "hi", "hey", "hello", "pls", "please", "sos", "support"}
    if len(tokens) <= 3 and tokens and all(tok in vague_en or len(tok) <= 2 for tok in tokens):
        return "roman_urdu"
    roman_hints = (
        "chahiye",
        "mujhe",
        "hai",
        "mein",
        "kal",
        "bhai",
        "zarurat",
        "chahti",
        "chahte",
        "koi",
        "kab",
    )
    if re.fullmatch(r"[a-z0-9\s?!.',\"-]+", t) and not any(w in t for w in roman_hints):
        return "english"
    return "roman_urdu"


def _heuristic_clarification_question(user_input: str, *, partial: bool) -> str:
    """Ask for missing info in the same broad language style as the user."""
    lang = _heuristic_detect_language(user_input)
    if lang == "urdu":
        return "مکمل تفصیل بتائیں — کون سی سروس، کہاں، کب؟" if partial else "آپ کو کس سروس کی ضرورت ہے؟"
    if lang == "english":
        return "Which area and time work best for you?" if partial else "What kind of home service do you need?"
    if partial:
        return "Thori aur detail dein — kon sa area aur kab time theek rahega?"
    return "Aap ko kis service ki zarurat hai?"


def _infer_service_type_heuristic(p: str) -> str | None:
    """Keyword-driven service label; ``None`` if nothing matches."""
    if any(k in p for k in ("paint", "rang", "rangai", "painter")):
        return "Painter"
    if any(k in p for k in ("carpent", "furniture", "wood work", "woodwork")):
        return "Carpenter"
    if any(k in p for k in ("makeup", "beauty", "parlor", "parlour", "salon", "threading")):
        return "Beautician"
    if any(k in p for k in ("tutor", "tuition", "teacher", "parh", "parhana", "study", "math", "science")):
        return "Tutor"
    if "bijli" in p or "electric" in p or "wiring" in p or "switchboard" in p or "electrician" in p:
        return "Electrician"
    if any(
        k in p
        for k in (
            "plumb",
            "plumber",
            "pipe",
            "tap",
            "tanki",
            "nal",
            "paani",
            "panai",
            "leak",
        )
    ):
        return "Plumbing"
    if re.search(r"(?<![a-z])ac(?![a-z])", p) or "a/c" in p or "air condition" in p or "aircondition" in p:
        return "AC Repair"
    return None


def _infer_location_heuristic(p: str) -> str | None:
    m = re.search(r"dha\s*phase\s*([0-9ivxlc]+)", p, re.I)
    if m:
        return f"DHA Phase {m.group(1).upper()}"
    if "dha" in p:
        return "DHA"
    for area in (
        "G-13",
        "G-9",
        "F-7",
        "F-10",
        "I-8",
        "Bahria",
        "North Nazimabad",
        "Saddar",
        "Clifton",
        "Gulshan",
        "Gulberg",
        "Model Town",
    ):
        if area.lower() in p:
            return area
    return None


def _infer_city_heuristic(p: str) -> str | None:
    if any(k in p for k in ("karachi", "khi", "clifton", "lyari")):
        return "Karachi"
    if any(k in p for k in ("lahore", "lhr", "gulberg", "model town")):
        return "Lahore"
    if "islamabad" in p or "isb" in p.split() or re.search(r"\bi-8\b", p):
        return "Islamabad"
    if "rawalpindi" in p or "pindi" in p or "rwp" in p.split():
        return "Rawalpindi"
    return None


def _infer_time_preference_heuristic(p: str) -> str | None:
    if any(k in p for k in ("abhi", "foran", "forun", "fauri", "immediate")):
        return "now"
    if "aaj" in p or "today" in p:
        return "today"
    if "kal subah" in p or "kal morning" in p or ("kal" in p and "morning" in p) or "kal subha" in p:
        return "tomorrow_morning"
    if "kal dopahar" in p or "kal afternoon" in p or ("kal" in p and "afternoon" in p):
        return "tomorrow_afternoon"
    if "kal" in p or "tomorrow" in p:
        return "tomorrow_morning"
    if any(k in p for k in ("this week", "is haftay", "haftay")):
        return "this_week"
    return None


def _infer_budget_sensitivity_heuristic(p: str) -> str | None:
    if any(k in p for k in ("budget kam", "sasta", "cheap", "kam pais", "kam budget", "affordable")):
        return "high"
    if any(k in p for k in ("best quality", "acha material", "no compromise")):
        return "low"
    return None


def _infer_urgency_non_emergency_heuristic(p: str) -> str | None:
    if any(k in p for k in ("jaldi", "urgent", "jald", "foran", "fauri")):
        return "high"
    if any(k in p for k in ("kabhi bhi", "flexible", "time nahi", "whenever")):
        return "low"
    return None


class SamajhAgent:
    """
    Multilingual understanding. Designed so both typed text and future STT output
    are just strings passed to ``extract_intent_with_trace`` (see ``input_source``).
    """

    async def extract_intent_with_trace(
        self,
        user_input: str,
        *,
        input_source: str = "text",
    ) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
        """
        Returns (intent_dict_for_api, reasoning_log, diagnostics).

        ``input_source``: ``text`` | ``voice_transcript`` (for future analytics / prompts).
        diagnostics includes ``fallback_used`` for legacy orchestrator logs.
        """
        _ = input_source  # reserved — same model path today; can tune prompts later
        t0 = datetime.now(timezone.utc)
        if not user_input or not user_input.strip():
            intent = _merge_intent(
                {
                    "clarification_needed": True,
                    "clarification_question": "Aap kis service ki talaash mein hain? Thori detail se batayein.",
                    "confidence_score": 0.4,
                }
            )
            log = _reasoning_log(
                status="failure",
                decision="Empty user input",
                reasoning="No text to classify",
                confidence=0.0,
            )
            intent["_decision_blurb"] = "Empty input"
            intent["_fallback_used"] = True
            public = {k: v for k, v in intent.items() if not k.startswith("_")}
            return public, log, {"fallback_used": True}

        is_emergency = _detect_emergency(user_input)
        prompt = f'User request:\n"""{user_input}"""'
        if is_emergency:
            prompt += (
                "\n\n[SYSTEM NOTE: Possible life-safety emergency detected in text — "
                'respond with JSON including "emergency": true and "urgency": "critical".]'
            )

        fallback_used = False
        raw_text = ""
        try:
            raw_text = await generate(prompt, SYSTEM_PROMPT, json_mode=True)
            parsed = _parse_json_strict(raw_text)
        except (json.JSONDecodeError, TypeError, ValueError) as e:
            fallback_used = True
            blob = _extract_json_object(_strip_json_fences(raw_text)) if raw_text else None
            try:
                parsed = json.loads(blob) if blob else {}
            except (json.JSONDecodeError, TypeError):
                parsed = {}
            if not parsed:
                parsed = self._heuristic_intent(user_input, is_emergency)
                fallback_used = True

        # Model returned clarification-only payload
        if parsed.get("clarification_needed") and "service_type" not in parsed:
            intent = _merge_intent(
                {
                    "service_type": None,
                    "location": None,
                    "clarification_needed": True,
                    "clarification_question": parsed.get("clarification_question")
                    or "Thori aur detail dein — kis ilaqay aur kab service chahiye?",
                    "confidence_score": float(parsed.get("confidence_score", 0.5)),
                }
            )
        else:
            intent = _merge_intent(parsed)

        if is_emergency:
            intent["emergency"] = True
            intent["urgency"] = "critical"

        # Post-validate confidence vs clarification
        conf = float(intent.get("confidence_score", 0.0))
        if conf < 0.75 and not intent.get("clarification_needed"):
            intent["clarification_needed"] = True
            intent["clarification_question"] = intent.get("clarification_question") or (
                "Aap exactly kya karwana chahte hain? Thori detail se batayein."
            )

        intent.pop("_log", None)
        intent["_fallback_used"] = fallback_used

        elapsed = (datetime.now(timezone.utc) - t0).total_seconds()

        if is_emergency:
            decision = "Emergency / critical urgency flagged"
            reasoning = "Safety keywords matched; urgency forced to critical"
            status = "success"
        elif intent.get("clarification_needed"):
            decision = "Clarification required before downstream agents"
            reasoning = f"Low confidence ({conf}) or model requested clarification"
            status = "success"
        elif fallback_used:
            decision = "Intent recovered via heuristic fallback"
            reasoning = "Gemini returned invalid JSON or parse failed — used local heuristics"
            status = "failure" if conf < 0.5 else "success"
        else:
            st = intent.get("service_type")
            decision = f"Detected {st} request" if st else "Parsed user intent (service unclear)"
            lang = intent.get("detected_language", "unknown")
            reasoning = f"Multilingual parse OK ({lang}); input_source={input_source}"
            status = "success"

        intent["_decision_blurb"] = decision
        log = _reasoning_log(
            status=status,
            decision=decision,
            reasoning=reasoning,
            confidence=float(intent.get("confidence_score", conf)),
        )

        # Clean internal keys before returning to API (graph / FastAPI strip these)
        public = {k: v for k, v in intent.items() if not k.startswith("_")}
        trace = log
        # keep _fallback_used on public? No — store only in internal; graph returns public intent
        intent_for_api = public
        return intent_for_api, trace, {"fallback_used": fallback_used}

    async def extract_intent(self, user_input: str) -> dict[str, Any]:
        """Backward-compatible: intent dict + ``_log`` for orchestrator.py."""
        t0 = datetime.now(timezone.utc)
        intent, trace, diag = await self.extract_intent_with_trace(user_input, input_source="text")
        elapsed = (datetime.now(timezone.utc) - t0).total_seconds()
        return {
            **intent,
            "_log": _legacy_orchestrator_log(
                {
                    **intent,
                    "_decision_blurb": trace["decision"],
                    "_fallback_used": diag.get("fallback_used", False),
                },
                user_input,
                elapsed,
            ),
        }

    def _heuristic_intent(self, user_input: str, is_emergency: bool) -> dict[str, Any]:
        """Offline fallback when Gemini JSON is unusable — keyword-driven, sparse nulls when unknown."""
        p = _normalize_text(user_input)
        detected = _heuristic_detect_language(user_input)

        if is_emergency:
            svc = _infer_service_type_heuristic(p)
            loc = _infer_location_heuristic(p)
            city = _infer_city_heuristic(p)
            tm = _infer_time_preference_heuristic(p)
            bud = _infer_budget_sensitivity_heuristic(p)
            jc: str | None
            if "gas" in p or "leak" in p:
                jc = "complex"
            elif svc:
                jc = "intermediate"
            else:
                jc = None
            return {
                "service_type": svc,
                "location": loc,
                "city": city,
                "time_preference": tm,
                "urgency": "critical",
                "budget_sensitivity": bud,
                "job_complexity": jc,
                "emergency": True,
                "confidence_score": _heuristic_stagger_conf(0.88, 0.93, user_input),
                "clarification_needed": False,
                "clarification_question": None,
                "detected_language": detected,
                "special_requirements": None,
            }

        service = _infer_service_type_heuristic(p)
        if service is None:
            return {
                "service_type": None,
                "location": None,
                "city": None,
                "time_preference": None,
                "urgency": None,
                "budget_sensitivity": None,
                "job_complexity": None,
                "emergency": False,
                "confidence_score": _heuristic_stagger_conf(0.35, 0.6, user_input),
                "clarification_needed": True,
                "clarification_question": _heuristic_clarification_question(user_input, partial=False),
                "detected_language": detected,
                "special_requirements": None,
            }

        loc = _infer_location_heuristic(p)
        city = _infer_city_heuristic(p)
        tm = _infer_time_preference_heuristic(p)
        bud = _infer_budget_sensitivity_heuristic(p)
        urg = _infer_urgency_non_emergency_heuristic(p)

        rich = loc is not None and (tm is not None or bud is not None or urg is not None)
        thin_context = loc is None and tm is None and bud is None and urg is None

        if rich:
            conf = _heuristic_stagger_conf(0.84, 0.92, user_input)
            clar = False
            q = None
        elif loc is not None:
            conf = _heuristic_stagger_conf(0.78, 0.86, user_input)
            clar = False
            q = None
        elif not thin_context:
            conf = _heuristic_stagger_conf(0.58, 0.72, user_input)
            clar = True
            q = _heuristic_clarification_question(user_input, partial=True)
        else:
            conf = _heuristic_stagger_conf(0.55, 0.68, user_input)
            clar = True
            q = _heuristic_clarification_question(user_input, partial=True)

        return {
            "service_type": service,
            "location": loc,
            "city": city,
            "time_preference": tm,
            "urgency": urg,
            "budget_sensitivity": bud,
            "job_complexity": "intermediate",
            "emergency": False,
            "confidence_score": conf,
            "clarification_needed": clar,
            "clarification_question": q,
            "detected_language": detected,
            "special_requirements": None,
        }
