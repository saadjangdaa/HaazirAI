"""
Haazir multi-agent pipeline: SAMAJH → DHUNDHO (sequential).

Flow:
    User text
        → SamajhAgent.extract_intent(user_input)  →  intent dict (+ _log)
        → If clarification_needed is True: return status clarification_needed
          (clarification_question + samajh_log), stop.
        → Else: DhundhoAgent.find_providers(intent)  →  discovery result (+ _log)
        → Return combined success payload with intent, providers, dhundho fields,
          and pipeline_log (samajh + dhundho agent logs, total wall time from _log).

Both agents keep their native _log dicts unchanged on the objects returned;
pipeline copies references into the response without mutating agent internals.
"""

from __future__ import annotations

from agents.dhundho import DhundhoAgent
from agents.samajh import SamajhAgent


class HaazirPipeline:
    """Runs SAMAJH then DHUNDHO in order for a single user text turn."""

    def __init__(self) -> None:
        self._samajh = SamajhAgent()
        self._dhundho = DhundhoAgent()

    async def run(self, user_input: str) -> dict:
        try:
            intent = await self._samajh.extract_intent(user_input)
        except Exception as e:
            return {"status": "error", "stage": "samajh", "message": str(e)}

        if intent.get("clarification_needed") is True:
            return {
                "status": "clarification_needed",
                "clarification_question": intent.get("clarification_question"),
                "samajh_log": intent.get("_log"),
            }

        try:
            dhundho_result = await self._dhundho.find_providers(intent)
        except Exception as e:
            return {"status": "error", "stage": "dhundho", "message": str(e)}

        samajh_log = intent.get("_log") or {}
        dhundho_log = dhundho_result.get("_log") or {}
        samajh_time = float(samajh_log.get("time_seconds", 0.0))
        dhundho_time = float(dhundho_log.get("time_seconds", 0.0))

        return {
            "status": "success",
            "intent": intent,
            "providers": dhundho_result.get("providers", []),
            "total_found": dhundho_result.get("total_found", 0),
            "fallback_triggered": dhundho_result.get("fallback_triggered"),
            "fallback_message": dhundho_result.get("fallback_message"),
            "waitlist_recommended": dhundho_result.get("waitlist_recommended"),
            "next_available_slot_hint": dhundho_result.get("next_available_slot_hint"),
            "scheduled_time_checked": dhundho_result.get("scheduled_time_checked"),
            "user_coords": dhundho_result.get("user_coords"),
            "filters_applied": dhundho_result.get("filters_applied"),
            "pipeline_log": {
                "samajh": samajh_log,
                "dhundho": dhundho_log,
                "total_time_seconds": round(samajh_time + dhundho_time, 3),
            },
        }
