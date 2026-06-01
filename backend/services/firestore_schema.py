"""
Canonical Firestore schema for Haazir AI (Step 1 — single source of truth).

Active collections:
  providers/{provider_id}
  bookings/{booking_id}
  users/{user_id}          — user_id MUST be Firebase Auth UID
  disputes/{dispute_id}
  agent_logs/{request_id}
  notifications/{notif_id}
  job_requests/{request_id} — real job postings broadcast to workers
  bids/{bid_id}             — worker bids on a job_request
"""
from typing import Any, Dict, List, Optional

ACTIVE_COLLECTIONS = frozenset(
    {
        "providers",
        "bookings",
        "users",
        "disputes",
        "agent_logs",
        "notifications",
        "job_requests",
        "bids",
        "admin_users",
        "audit_logs",
    }
)

# job_request statuses
JOB_REQUEST_STATUS = frozenset({"open", "bidding", "assigned", "expired", "cancelled"})

# bid statuses
BID_STATUS = frozenset({"pending", "accepted", "rejected"})

FORBIDDEN_USER_IDS = frozenset({"user_001", "user_demo", "guest", ""})

# Lifecycle statuses (canonical storage). "enroute" accepted as alias for on_the_way.
BOOKING_STATUS_ALIASES = {
    "enroute": "on_the_way",
    "en_route": "on_the_way",
}

PROVIDER_CANONICAL_FIELDS = (
    "provider_id",
    "name",
    "service",
    "city",
    "area",
    "rating",
    "available",
    "trust_score",
)

BOOKING_CANONICAL_FIELDS = (
    "booking_id",
    "user_id",
    "provider_id",
    "service",
    "status",
    "price",
    "slot_time",
    "created_at",
    "reminder_sent",
)

USER_CANONICAL_FIELDS = (
    "user_id",
    "name",
    "phone",
    "city",
    "booking_history",
    "dispute_history",
)

DISPUTE_CANONICAL_FIELDS = (
    "dispute_id",
    "booking_id",
    "type",
    "status",
    "resolution",
    "created_at",
)

AGENT_LOG_CANONICAL_FIELDS = (
    "request_id",
    "user_input",
    "timestamp",
    "logs",
)

NOTIFICATION_CANONICAL_FIELDS = (
    "notif_id",
    "booking_id",
    "user_id",
    "send_at",
    "message",
    "sent",
)


def require_firebase_uid(user_id: Optional[str], field: str = "user_id") -> str:
    uid = (user_id or "").strip()
    if not uid or uid in FORBIDDEN_USER_IDS:
        raise ValueError(f"Valid Firebase Auth UID required for {field}")
    return uid


def normalize_booking_status(status: Optional[str]) -> str:
    s = (status or "pending").strip().lower()
    return BOOKING_STATUS_ALIASES.get(s, s)


def normalize_provider(data: Dict[str, Any], provider_id: str) -> Dict[str, Any]:
    pid = (provider_id or data.get("provider_id") or data.get("id") or "").strip()
    out: Dict[str, Any] = {
        "provider_id": pid,
        "id": pid,
        "name": data.get("name", ""),
        "service": data.get("service", ""),
        "city": data.get("city", ""),
        "area": data.get("area", ""),
        "rating": float(data.get("rating", 0) or 0),
        "available": bool(data.get("available", True)),
        "trust_score": float(data.get("trust_score", 0) or 0),
    }
    for key, value in data.items():
        if key not in out and value is not None:
            out[key] = value
    return out


def normalize_booking(data: Dict[str, Any], booking_id: Optional[str] = None) -> Dict[str, Any]:
    bid = (booking_id or data.get("booking_id") or "").strip()
    slot = data.get("slot_time") or data.get("scheduled_time") or ""
    uid = data.get("user_id")
    if uid:
        uid = require_firebase_uid(uid)
    out: Dict[str, Any] = {
        "booking_id": bid,
        "user_id": uid or "",
        "provider_id": data.get("provider_id", ""),
        "service": data.get("service", ""),
        "status": normalize_booking_status(data.get("status")),
        "price": int(data.get("price") or data.get("total") or 0),
        "slot_time": slot,
        "created_at": data.get("created_at", ""),
        "reminder_sent": bool(data.get("reminder_sent", False)),
    }
    if data.get("scheduled_time"):
        out["scheduled_time"] = data["scheduled_time"]
    elif slot:
        out["scheduled_time"] = slot
    for key, value in data.items():
        if key not in out and value is not None:
            out[key] = value
    return out


def normalize_user(data: Dict[str, Any], user_id: str) -> Dict[str, Any]:
    uid = require_firebase_uid(user_id)
    name = data.get("name") or data.get("username") or ""
    history = data.get("booking_history")
    if history is None:
        history = []
    elif not isinstance(history, list):
        history = list(history)
    dispute_history = data.get("dispute_history")
    if dispute_history is None:
        dispute_history = []
    elif not isinstance(dispute_history, list):
        dispute_history = list(dispute_history)
    out: Dict[str, Any] = {
        "user_id": uid,
        "uid": uid,
        "name": name,
        "phone": data.get("phone", ""),
        "city": data.get("city", ""),
        "booking_history": history,
        "dispute_history": dispute_history,
    }
    for key, value in data.items():
        if key not in out and value is not None and value != "":
            out[key] = value
    return out


def normalize_dispute(data: Dict[str, Any], dispute_id: Optional[str] = None) -> Dict[str, Any]:
    from services.disputes_integrity import normalize_dispute_type

    did = (dispute_id or data.get("dispute_id") or "").strip()
    uid_raw = (data.get("user_id") or data.get("uid") or "").strip()
    uid = require_firebase_uid(uid_raw) if uid_raw else ""
    dtype = normalize_dispute_type(data.get("type") or data.get("dispute_type"))
    status = (data.get("status") or "open").lower()
    desc = (data.get("customer_message") or data.get("description") or "").strip()
    out: Dict[str, Any] = {
        "dispute_id": did,
        "booking_id": (data.get("booking_id") or "").strip(),
        "user_id": uid or "",
        "worker_id": (data.get("worker_id") or "").strip(),
        "type": dtype,
        "dispute_type": dtype,
        "status": status,
        "resolution": data.get("resolution", ""),
        "description": desc,
        "customer_message": desc,
        "created_at": data.get("created_at", ""),
    }
    if data.get("worker_response") is not None:
        out["worker_response"] = data["worker_response"]
    if data.get("refund_amount") is not None:
        out["refund_amount"] = int(data.get("refund_amount") or 0)
    if data.get("provider_penalty"):
        out["provider_penalty"] = data["provider_penalty"]
    if data.get("escalated_to_human") is not None:
        out["escalated_to_human"] = bool(data["escalated_to_human"])
    if data.get("evidence_url"):
        out["evidence_url"] = data["evidence_url"]
    if data.get("resolved_at"):
        out["resolved_at"] = data["resolved_at"]
    if data.get("case_summary"):
        out["case_summary"] = data["case_summary"]
    for key, value in data.items():
        if key not in out and value is not None:
            out[key] = value
    return out


def normalize_agent_log(
    data: Dict[str, Any], request_id: str, user_input: str, logs: List[dict]
) -> Dict[str, Any]:
    from services.agent_logs_integrity import sanitize_logs

    rid = (request_id or data.get("request_id") or "").strip()
    out: Dict[str, Any] = {
        "request_id": rid,
        "user_input": (user_input or data.get("user_input") or "").strip(),
        "timestamp": (data.get("timestamp") or "").strip(),
        "logs": sanitize_logs(logs if logs else data.get("logs")),
    }
    uid = data.get("user_id")
    if uid:
        out["user_id"] = require_firebase_uid(uid)
    for key, value in data.items():
        if key not in out and value is not None:
            out[key] = value
    return out


def normalize_notification(data: Dict[str, Any], notif_id: Optional[str] = None) -> Dict[str, Any]:
    nid = (notif_id or data.get("notif_id") or "").strip()
    uid = data.get("user_id")
    if uid:
        uid = require_firebase_uid(uid)
    out: Dict[str, Any] = {
        "notif_id": nid,
        "booking_id": (data.get("booking_id") or "").strip(),
        "user_id": uid or "",
        "send_at": data.get("send_at", ""),
        "message": data.get("message", ""),
        "title": data.get("title", ""),
        "event_type": data.get("event_type", ""),
        "role": data.get("role", ""),
        "sent": bool(data.get("sent", False)),
    }
    if data.get("sent_at"):
        out["sent_at"] = data["sent_at"]
    if data.get("created_at"):
        out["created_at"] = data["created_at"]
    for key, value in data.items():
        if key not in out and value is not None:
            out[key] = value
    return out


def validate_document(collection: str, doc_id: str, data: Dict[str, Any]) -> List[str]:
    """Return list of schema warnings (empty = OK for canonical checks)."""
    issues: List[str] = []
    if collection not in ACTIVE_COLLECTIONS:
        issues.append(f"Unknown collection: {collection}")
        return issues

    if collection == "users":
        from services.users_integrity import validate_user_document

        issues.extend(validate_user_document(doc_id, data))

    if collection == "providers":
        from services.providers_integrity import validate_provider_document

        issues.extend(validate_provider_document(doc_id, data))

    if collection == "bookings":
        from services.bookings_integrity import validate_booking_document

        issues.extend(validate_booking_document(doc_id, data))

    if collection == "disputes":
        from services.disputes_integrity import validate_dispute_document

        issues.extend(validate_dispute_document(doc_id, data))

    if collection == "agent_logs":
        from services.agent_logs_integrity import validate_agent_log_document

        issues.extend(validate_agent_log_document(doc_id, data))

    if collection == "notifications":
        from services.notifications_integrity import validate_notification_document

        issues.extend(validate_notification_document(doc_id, data))

    return issues


def normalize_job_request(data: Dict[str, Any], request_id: Optional[str] = None) -> Dict[str, Any]:
    rid = (request_id or data.get("request_id") or "").strip()
    status = (data.get("status") or "open").lower()
    if status not in JOB_REQUEST_STATUS:
        status = "open"
    out: Dict[str, Any] = {
        "request_id": rid,
        "customer_id": (data.get("customer_id") or "").strip(),
        "customer_name": (data.get("customer_name") or "").strip(),
        "service": (data.get("service") or "").strip(),
        "location": (data.get("location") or "").strip(),
        "city": (data.get("city") or "").strip(),
        "urgency": (data.get("urgency") or "medium").strip(),
        "description": (data.get("description") or "").strip(),
        "estimated_price": int(data.get("estimated_price") or 0),
        "status": status,
        "created_at": data.get("created_at", ""),
        "expires_at": data.get("expires_at", ""),
        "notified_provider_ids": list(data.get("notified_provider_ids") or []),
        "bid_count": int(data.get("bid_count") or 0),
    }
    for key, value in data.items():
        if key not in out and value is not None:
            out[key] = value
    return out


def normalize_bid(data: Dict[str, Any], bid_id: Optional[str] = None) -> Dict[str, Any]:
    bid_id = (bid_id or data.get("bid_id") or "").strip()
    status = (data.get("status") or "pending").lower()
    if status not in BID_STATUS:
        status = "pending"
    out: Dict[str, Any] = {
        "bid_id": bid_id,
        "job_request_id": (data.get("job_request_id") or "").strip(),
        "worker_id": (data.get("worker_id") or "").strip(),
        "provider_id": (data.get("provider_id") or "").strip(),
        "provider_name": (data.get("provider_name") or "").strip(),
        "price": int(data.get("price") or 0),
        "eta_minutes": int(data.get("eta_minutes") or 30),
        "message": (data.get("message") or "").strip(),
        "rating": float(data.get("rating") or 0),
        "status": status,
        "created_at": data.get("created_at", ""),
    }
    for key, value in data.items():
        if key not in out and value is not None:
            out[key] = value
    return out


def audit_store(
    documents_by_collection: Dict[str, Dict[str, Dict[str, Any]]],
) -> Dict[str, Any]:
    """Summarize in-memory or exported store for verification scripts."""
    extra_collections = [
        c for c in documents_by_collection if c not in ACTIVE_COLLECTIONS
    ]
    issues: List[str] = []
    counts = {c: 0 for c in ACTIVE_COLLECTIONS}
    for coll, bucket in documents_by_collection.items():
        if coll in ACTIVE_COLLECTIONS:
            counts[coll] = len(bucket)
        for doc_id, doc in bucket.items():
            issues.extend(validate_document(coll, doc_id, doc or {}))
    return {
        "collections": counts,
        "extra_collections": extra_collections,
        "issues": issues,
        "issue_count": len(issues),
    }
