"""Step 3 — bookings/{booking_id} lifecycle and integrity checks."""
from typing import Any, Dict, List, Optional, Set, Tuple

from services.booking_lifecycle import BOOKING_STATUSES
from services.firestore_schema import FORBIDDEN_USER_IDS, normalize_booking_status, require_firebase_uid
from services.users_integrity import is_plausible_firebase_uid

TERMINAL_STATUSES = frozenset({"completed", "cancelled", "disputed", "refunded"})


def validate_booking_document(doc_id: str, data: Dict[str, Any]) -> List[str]:
    """Return hard errors for a bookings/{doc_id} document."""
    issues: List[str] = []
    prefix = f"bookings/{doc_id}"

    bid = (data.get("booking_id") or doc_id or "").strip()
    if bid != doc_id:
        issues.append(f"{prefix}: booking_id field '{bid}' does not match document id")

    uid = (data.get("user_id") or "").strip()
    if not uid:
        issues.append(f"{prefix}: missing user_id")
    else:
        try:
            require_firebase_uid(uid)
        except ValueError as exc:
            issues.append(f"{prefix}: {exc}")
        if not is_plausible_firebase_uid(uid):
            issues.append(f"{prefix}: user_id is not a valid Firebase Auth UID")

    if not data.get("provider_id"):
        issues.append(f"{prefix}: missing provider_id")

    if not data.get("service"):
        issues.append(f"{prefix}: missing service")

    status = normalize_booking_status(data.get("status"))
    if status not in BOOKING_STATUSES:
        issues.append(f"{prefix}: invalid status '{status}'")

    if not data.get("created_at"):
        issues.append(f"{prefix}: missing created_at")

    slot = data.get("slot_time") or data.get("scheduled_time")
    if not slot:
        issues.append(f"{prefix}: missing slot_time / scheduled_time")

    return issues


def audit_bookings_collection(
    booking_entries: List[Tuple[str, Dict[str, Any]]],
    user_entries: List[Tuple[str, Dict[str, Any]]],
) -> Dict[str, Any]:
    """Cross-check bookings vs users/{uid}.booking_history."""
    issues: List[str] = []
    warnings: List[str] = []
    status_counts: Dict[str, int] = {}
    invalid_user_bookings: List[str] = []

    booking_ids: Set[str] = set()
    by_user: Dict[str, List[str]] = {}

    for doc_id, data in booking_entries:
        data = data or {}
        booking_ids.add(doc_id)
        issues.extend(validate_booking_document(doc_id, data))

        status = normalize_booking_status(data.get("status"))
        status_counts[status] = status_counts.get(status, 0) + 1

        uid = (data.get("user_id") or "").strip()
        if uid and not is_plausible_firebase_uid(uid):
            invalid_user_bookings.append(doc_id)
        if uid:
            by_user.setdefault(uid, []).append(doc_id)

    user_docs = {doc_id: data for doc_id, data in user_entries}
    history_refs: Set[str] = set()
    orphan_history: List[str] = []
    missing_from_history: List[str] = []

    for uid, doc in user_docs.items():
        for bid in doc.get("booking_history") or []:
            history_refs.add(bid)
            if bid not in booking_ids:
                orphan_history.append(f"{bid} (in users/{uid})")

    for bid in booking_ids:
        if bid not in history_refs:
            missing_from_history.append(bid)

    for uid, bids in by_user.items():
        if uid not in user_docs:
            warnings.append(f"bookings reference unknown user {uid} ({len(bids)} booking(s))")
            continue
        hist = set(user_docs[uid].get("booking_history") or [])
        for bid in bids:
            if bid not in hist:
                warnings.append(f"users/{uid} missing booking_history entry for {bid}")

    return {
        "booking_count": len(booking_entries),
        "status_counts": status_counts,
        "invalid_user_id_bookings": invalid_user_bookings,
        "orphan_history_refs": orphan_history,
        "missing_from_user_history": missing_from_history,
        "issues": issues,
        "warnings": warnings,
        "issue_count": len(issues),
        "warning_count": len(warnings),
        "ok": len(issues) == 0 and not invalid_user_bookings,
    }
