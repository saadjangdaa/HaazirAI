"""Step 7 — agent_logs/{request_id} integrity checks."""
from typing import Any, Dict, List, Optional, Tuple

LOG_ENTRY_FIELDS = (
    "agent_name",
    "start_time",
    "end_time",
    "input_summary",
    "output_summary",
    "decision_made",
    "confidence",
    "fallback_used",
    "time_seconds",
)


def sanitize_log_entry(raw: Any) -> Optional[Dict[str, Any]]:
    """Normalize a single agent trace entry from orchestrator _log blobs."""
    if not isinstance(raw, dict):
        return None
    name = (raw.get("agent_name") or "").strip()
    if not name:
        return None
    try:
        confidence = float(raw.get("confidence", 0) or 0)
    except (TypeError, ValueError):
        confidence = 0.0
    try:
        time_seconds = float(raw.get("time_seconds", 0) or 0)
    except (TypeError, ValueError):
        time_seconds = 0.0
    return {
        "agent_name": name,
        "agent_name_urdu": raw.get("agent_name_urdu", ""),
        "start_time": raw.get("start_time", ""),
        "end_time": raw.get("end_time", ""),
        "input_summary": raw.get("input_summary", ""),
        "output_summary": raw.get("output_summary", ""),
        "decision_made": raw.get("decision_made", ""),
        "confidence": confidence,
        "fallback_used": bool(raw.get("fallback_used", False)),
        "time_seconds": time_seconds,
    }


def sanitize_logs(logs: Any) -> List[Dict[str, Any]]:
    if not isinstance(logs, list):
        return []
    out: List[Dict[str, Any]] = []
    for item in logs:
        entry = sanitize_log_entry(item)
        if entry:
            out.append(entry)
    return out


def validate_agent_log_document(doc_id: str, data: Dict[str, Any]) -> List[str]:
    """Return hard errors for agent_logs/{request_id}."""
    issues: List[str] = []
    prefix = f"agent_logs/{doc_id}"

    rid = (data.get("request_id") or doc_id or "").strip()
    if rid != doc_id:
        issues.append(f"{prefix}: request_id field '{rid}' does not match document id")

    if not (data.get("user_input") or "").strip():
        issues.append(f"{prefix}: missing user_input")

    if not (data.get("timestamp") or "").strip():
        issues.append(f"{prefix}: missing timestamp")

    logs = data.get("logs")
    if not isinstance(logs, list):
        issues.append(f"{prefix}: logs must be an array")
    elif len(logs) == 0:
        issues.append(f"{prefix}: logs array is empty")
    else:
        for i, entry in enumerate(logs):
            if not isinstance(entry, dict):
                issues.append(f"{prefix}: logs[{i}] is not an object")
                continue
            if not (entry.get("agent_name") or "").strip():
                issues.append(f"{prefix}: logs[{i}] missing agent_name")

    uid = (data.get("user_id") or "").strip()
    if uid and ("@" in uid or uid.startswith("user_")):
        issues.append(f"{prefix}: invalid user_id '{uid}'")

    return issues


def audit_agent_logs_collection(
    log_entries: List[Tuple[str, Dict[str, Any]]],
) -> Dict[str, Any]:
    issues: List[str] = []
    warnings: List[str] = []
    agent_counts: Dict[str, int] = {}
    empty_user_input: List[str] = []
    missing_timestamp: List[str] = []

    for doc_id, data in log_entries:
        data = data or {}
        issues.extend(validate_agent_log_document(doc_id, data))

        if not (data.get("user_input") or "").strip():
            empty_user_input.append(doc_id)
        if not (data.get("timestamp") or "").strip():
            missing_timestamp.append(doc_id)

        for entry in data.get("logs") or []:
            if isinstance(entry, dict):
                name = (entry.get("agent_name") or "UNKNOWN").upper()
                agent_counts[name] = agent_counts.get(name, 0) + 1

    return {
        "agent_log_count": len(log_entries),
        "agent_step_counts": agent_counts,
        "empty_user_input": empty_user_input,
        "missing_timestamp": missing_timestamp,
        "issues": issues,
        "warnings": warnings,
        "issue_count": len(issues),
        "warning_count": len(warnings),
        "ok": len(issues) == 0,
    }
