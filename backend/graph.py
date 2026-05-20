"""
LangGraph workflow for Haazir (hackathon prototype).

Flow: START → Samajh → (optional) Dhundho → Chunno → END

* If Samajh sets ``clarification_needed`` and it is not an emergency → END (no Dhundho/Chunno).
* Otherwise: Dhundho discovers providers, Chunno ranks them (8-factor score + Urdu reasons).

Gemini runs inside Samajh only (``services.gemini``).
"""
from __future__ import annotations

import operator
import uuid
from datetime import datetime, timezone
from typing import Annotated, Any, Literal, TypedDict

from langgraph.graph import END, START, StateGraph

from agents.chunno import ChunnoAgent
from agents.dhundho import DhundhoAgent
from agents.samajh import SamajhAgent


class HaazirState(TypedDict, total=False):
    """Shared workflow state — extended incrementally (Hifazat, Hisaab, …)."""

    user_input: str
    source: str
    user_location: str
    intent: dict[str, Any]
    logs: Annotated[list[dict[str, Any]], operator.add]
    # Raw list from Dhundho (discovery, distance, slots).
    providers: list[dict[str, Any]]
    dhundho_meta: dict[str, Any]
    # Sorted/ranked list from Chunno (API should expose this as ``providers_ranked``).
    providers_ranked: list[dict[str, Any]]
    chunno_warnings: list[str]
    chunno_meta: dict[str, Any]


_samajh_agent = SamajhAgent()
_dhundho_agent = DhundhoAgent()
_chunno_agent = ChunnoAgent()


def _merge_location_into_intent(intent: dict[str, Any], user_location: str) -> dict[str, Any]:
    """Prefer Samajh fields; fill gaps from ``user_location`` for Dhundho geocode."""
    out = dict(intent)
    ul = (user_location or "").strip()
    if not ul:
        return out
    loc = out.get("location")
    if loc is None or str(loc).strip().lower() in ("", "none", "unknown"):
        out["location"] = ul
    cty = out.get("city")
    if cty is None or str(cty).strip().lower() in ("", "none", "unknown"):
        blob = ul.lower()
        for city in ("karachi", "lahore", "islamabad", "rawalpindi"):
            if city in blob:
                out["city"] = city.title()
                break
    return out


def _route_after_samajh(state: HaazirState) -> Literal["stop", "dhundho"]:
    intent = state.get("intent") or {}
    if intent.get("clarification_needed") and not intent.get("emergency"):
        # Still discover technicians when service is clear (e.g. "AC technician chahiye").
        from services.service_categories import intent_category

        if intent_category(intent):
            return "dhundho"
        st = (intent.get("service_type") or "").strip().lower()
        if st and st not in ("unknown", "general", "service", "other"):
            return "dhundho"
        return "stop"
    return "dhundho"


def _judge_log_from_legacy(agent: str, legacy: dict[str, Any]) -> dict[str, Any]:
    return {
        "agent": agent,
        "status": "success",
        "decision": str(legacy.get("decision_made", f"{agent} completed"))[:800],
        "reasoning": str(legacy.get("output_summary", legacy.get("input_summary", "")))[:1200],
        "confidence": float(legacy.get("confidence", 0.0)),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


async def _samajh_node(state: HaazirState) -> HaazirState:
    user_input = state.get("user_input", "").strip()
    source = state.get("source") or "text"
    intent, reasoning_log, _diag = await _samajh_agent.extract_intent_with_trace(
        user_input,
        input_source=source,
    )
    return {"intent": intent, "logs": [reasoning_log]}


async def _dhundho_node(state: HaazirState) -> HaazirState:
    intent_in = dict(state.get("intent") or {})
    merged = _merge_location_into_intent(intent_in, state.get("user_location", "") or "")
    result = await _dhundho_agent.find_providers(merged)
    legacy_log = result.pop("_log", None)
    judge_logs: list[dict[str, Any]] = []
    if legacy_log:
        judge_logs.append(_judge_log_from_legacy("Dhundho", legacy_log))

    providers = list(result.get("providers") or [])
    meta: dict[str, Any] = {
        "fallback_message": result.get("fallback_message"),
        "fallback_triggered": result.get("fallback_triggered"),
        "waitlist_recommended": result.get("waitlist_recommended"),
        "scheduled_time_checked": result.get("scheduled_time_checked"),
        "total_found": result.get("total_found"),
        "filters_applied": result.get("filters_applied"),
    }
    return {
        "providers": providers,
        "dhundho_meta": meta,
        "logs": judge_logs,
    }


async def _chunno_node(state: HaazirState) -> HaazirState:
    """Rank Dhundho providers with 8-factor scoring + Urdu explanations."""
    providers = list(state.get("providers") or [])
    intent = dict(state.get("intent") or {})

    if not providers:
        return {
            "providers_ranked": [],
            "chunno_warnings": [],
            "chunno_meta": {"skipped": True, "reason": "no_providers_from_dhundho"},
            "logs": [
                {
                    "agent": "Chunno",
                    "status": "success",
                    "decision": "No providers to rank",
                    "reasoning": "Dhundho returned an empty provider list",
                    "confidence": 0.0,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
            ],
        }

    result = await _chunno_agent.rank_providers(providers, intent)
    legacy_log = result.pop("_log", None)
    ranked = list(result.get("ranked_providers") or [])
    warnings = list(result.get("global_warnings") or [])

    judge_logs: list[dict[str, Any]] = []
    if legacy_log:
        judge_logs.append(_judge_log_from_legacy("Chunno", legacy_log))

    return {
        "providers_ranked": ranked,
        "chunno_warnings": warnings,
        "chunno_meta": {
            "global_warnings": warnings,
            "count_ranked": len(ranked),
        },
        "logs": judge_logs,
    }


def _build_graph():
    workflow = StateGraph(HaazirState)
    workflow.add_node("samajh", _samajh_node)
    workflow.add_node("dhundho", _dhundho_node)
    workflow.add_node("chunno", _chunno_node)
    workflow.add_edge(START, "samajh")
    workflow.add_conditional_edges(
        "samajh",
        _route_after_samajh,
        {"stop": END, "dhundho": "dhundho"},
    )
    workflow.add_edge("dhundho", "chunno")
    workflow.add_edge("chunno", END)
    return workflow.compile()


haazir_graph = _build_graph()


async def run_samajh_workflow(
    *,
    user_input: str,
    source: str = "text",
    user_location: str = "",
) -> HaazirState:
    """
    Samajh → Dhundho → Chunno when intent is actionable.

    ``user_location``: e.g. ``G-13, Islamabad`` for maps + city fallback.
    """
    initial: HaazirState = {
        "user_input": user_input,
        "source": source,
        "user_location": (user_location or "").strip(),
        "intent": {},
        "logs": [],
    }
    return await haazir_graph.ainvoke(initial)


def new_request_id() -> str:
    return f"REQ-{uuid.uuid4().hex[:8].upper()}"
