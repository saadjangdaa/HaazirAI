"""Step 6 — disputes/{dispute_id} integrity and JHAGRA linkage checks."""
from typing import Any, Dict, List, Optional, Set, Tuple

DISPUTE_STATUSES = frozenset({"open", "under_review", "resolved", "escalated"})

VALID_DISPUTE_TYPES = frozenset(
    {
        "no_show",
        "quality_complaint",
        "price_disagreement",
        "overrun",
        "cancellation",
        "refund_request",
    }
)

DISPUTE_TYPE_ALIASES = {
    "noshow": "no_show",
    "no-show": "no_show",
    "quality": "quality_complaint",
    "price": "price_disagreement",
    "incomplete": "quality_complaint",
    "job_not_completed": "quality_complaint",
}


def normalize_dispute_type(raw: Optional[str]) -> str:
    key = (raw or "").strip().lower().replace(" ", "_")
    return DISPUTE_TYPE_ALIASES.get(key, key)


def validate_dispute_document(doc_id: str, data: Dict[str, Any]) -> List[str]:
    """Return hard errors for a disputes/{doc_id} document."""
    issues: List[str] = []
    prefix = f"disputes/{doc_id}"

    did = (data.get("dispute_id") or doc_id or "").strip()
    if did != doc_id:
        issues.append(f"{prefix}: dispute_id field '{did}' does not match document id")

    booking_id = (data.get("booking_id") or "").strip()
    if not booking_id:
        issues.append(f"{prefix}: missing booking_id")

    dtype = normalize_dispute_type(data.get("type") or data.get("dispute_type"))
    if not dtype:
        issues.append(f"{prefix}: missing type")
    elif dtype not in VALID_DISPUTE_TYPES:
        issues.append(f"{prefix}: invalid type '{dtype}'")

    status = (data.get("status") or "open").strip().lower()
    if status not in DISPUTE_STATUSES:
        issues.append(f"{prefix}: invalid status '{status}'")

    if not (data.get("created_at") or "").strip():
        issues.append(f"{prefix}: missing created_at")

    if not (data.get("resolution") or "").strip() and status in ("resolved", "escalated"):
        issues.append(f"{prefix}: resolved/escalated dispute missing resolution text")

    return issues


def audit_disputes_collection(
    dispute_entries: List[Tuple[str, Dict[str, Any]]],
    booking_ids: Set[str],
    bookings_by_id: Dict[str, Dict[str, Any]],
) -> Dict[str, Any]:
    """Cross-check disputes vs bookings/{booking_id}."""
    issues: List[str] = []
    warnings: List[str] = []
    status_counts: Dict[str, int] = {}
    orphan_booking_refs: List[str] = []
    missing_user_id: List[str] = []

    for doc_id, data in dispute_entries:
        data = data or {}
        issues.extend(validate_dispute_document(doc_id, data))

        status = (data.get("status") or "open").lower()
        status_counts[status] = status_counts.get(status, 0) + 1

        bid = (data.get("booking_id") or "").strip()
        if bid and bid not in booking_ids:
            orphan_booking_refs.append(doc_id)
        elif bid and bid in bookings_by_id:
            booking = bookings_by_id[bid]
            uid = (data.get("user_id") or "").strip()
            booking_uid = (booking.get("user_id") or "").strip()
            if uid and booking_uid and uid != booking_uid:
                warnings.append(
                    f"disputes/{doc_id}: user_id '{uid}' does not match booking owner '{booking_uid}'"
                )
            if not uid and booking_uid:
                warnings.append(f"disputes/{doc_id}: missing user_id (booking owner {booking_uid})")

        if not (data.get("user_id") or "").strip():
            missing_user_id.append(doc_id)

    return {
        "dispute_count": len(dispute_entries),
        "status_counts": status_counts,
        "orphan_booking_refs": orphan_booking_refs,
        "missing_user_id": missing_user_id,
        "issues": issues,
        "warnings": warnings,
        "issue_count": len(issues),
        "warning_count": len(warnings),
        "ok": len(issues) == 0 and not orphan_booking_refs,
    }
