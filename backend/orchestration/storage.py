"""Trace persistence helpers using existing Firebase service wrappers."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional

from services.firebase import get_agent_logs_doc, save_agent_logs


class TraceStorage:
    @staticmethod
    async def save_trace(
        request_id: str,
        user_input: str,
        trace_dict: Dict[str, Any],
        user_id: Optional[str] = None,
    ) -> str:
        logs = trace_dict.get("agents", [])
        await save_agent_logs(request_id, user_input, logs, user_id=user_id)
        return request_id

    @staticmethod
    async def get_trace(request_id: str) -> Optional[Dict[str, Any]]:
        doc = await get_agent_logs_doc(request_id)
        if not doc:
            return None
        logs = doc.get("logs", [])
        durations = [float(entry.get("duration_ms", 0)) for entry in logs if isinstance(entry, dict)]
        return {
            "request_id": request_id,
            "user_id": doc.get("user_id"),
            "user_input": doc.get("user_input", ""),
            "timestamp": doc.get("timestamp", datetime.now().isoformat()),
            "agents": logs,
            "agent_count": len(logs),
            "error_count": len([a for a in logs if (a.get("status") == "error")]),
            "total_duration_ms": sum(durations),
            "errors": [],
            "decisions": [],
        }
