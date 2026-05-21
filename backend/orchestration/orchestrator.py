"""Orchestration facade with tracing-compatible response contract."""

from __future__ import annotations

from typing import Any, Dict

from agents.orchestrator import run_full_orchestration


class Orchestrator:
    async def process_request(self, user_input: str, user_location: str, user_id: str) -> Dict[str, Any]:
        return await run_full_orchestration(
            user_input=user_input,
            user_location=user_location,
            user_id=user_id,
        )
