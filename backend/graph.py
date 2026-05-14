"""
Minimal LangGraph workflow for Haazir (hackathon prototype).

Current flow: START → Samajh → END

Later, Dhundho / Chunno / etc. attach as additional nodes on this graph.
Voice (Uplift AI): transcribed text becomes `user_input` with `source="voice_transcript"`.
"""
from __future__ import annotations

import operator
import uuid
from typing import Annotated, Any, TypedDict

from langgraph.graph import END, START, StateGraph

from agents.samajh import SamajhAgent


class HaazirState(TypedDict, total=False):
    """Shared workflow state — extended incrementally as new agents are added."""

    # Raw user text (typed) or transcript from speech-to-text (future Uplift AI).
    user_input: str
    # "text" | "voice_transcript" — helps future nodes tune prompts or analytics.
    source: str
    # Structured output from Samajh (intent / clarification).
    intent: dict[str, Any]
    # Judge-facing reasoning traces; appended per node via reducer.
    logs: Annotated[list[dict[str, Any]], operator.add]


_samajh_agent = SamajhAgent()


async def _samajh_node(state: HaazirState) -> HaazirState:
    """
    Run the Samajh agent: multilingual understanding → intent + one reasoning log entry.

    Same code path for keyboard text and future voice transcripts (both are strings).
    """
    user_input = state.get("user_input", "").strip()
    source = state.get("source") or "text"

    intent, reasoning_log, _diag = await _samajh_agent.extract_intent_with_trace(
        user_input,
        input_source=source,
    )

    return {
        "intent": intent,
        "logs": [reasoning_log],
    }


def _build_graph():
    workflow = StateGraph(HaazirState)
    workflow.add_node("samajh", _samajh_node)
    workflow.add_edge(START, "samajh")
    workflow.add_edge("samajh", END)
    return workflow.compile()


# Compiled once per process (FastAPI worker).
haazir_graph = _build_graph()


async def run_samajh_workflow(*, user_input: str, source: str = "text") -> HaazirState:
    """
    Execute the minimal graph and return final state (intent + accumulated logs).

    `source` is reserved for future voice: pass ``voice_transcript`` when audio
    was converted to text upstream (e.g. Uplift AI).
    """
    initial: HaazirState = {
        "user_input": user_input,
        "source": source,
        "intent": {},
        "logs": [],
    }
    final: HaazirState = await haazir_graph.ainvoke(initial)
    return final


def new_request_id() -> str:
    """Short request id for logs API + mobile."""
    return f"REQ-{uuid.uuid4().hex[:8].upper()}"
