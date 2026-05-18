"""Step 8 — notifications/{notif_id} integrity checks."""
from typing import Any, Dict, List, Tuple

from services.firestore_schema import require_firebase_uid
from services.users_integrity import is_plausible_firebase_uid


def validate_notification_document(doc_id: str, data: Dict[str, Any]) -> List[str]:
    issues: List[str] = []
    prefix = f"notifications/{doc_id}"

    nid = (data.get("notif_id") or doc_id or "").strip()
    if nid != doc_id:
        issues.append(f"{prefix}: notif_id field '{nid}' does not match document id")

    uid = (data.get("user_id") or "").strip()
    if not uid:
        issues.append(f"{prefix}: missing user_id")
    else:
        try:
            require_firebase_uid(uid)
        except ValueError as exc:
            issues.append(f"{prefix}: {exc}")
        if not is_plausible_firebase_uid(uid):
            issues.append(f"{prefix}: invalid user_id")

    if not (data.get("message") or "").strip():
        issues.append(f"{prefix}: missing message")

    if data.get("sent") is None:
        issues.append(f"{prefix}: missing sent flag")

    return issues


def audit_notifications_collection(
    notification_entries: List[Tuple[str, Dict[str, Any]]],
    booking_ids: set,
) -> Dict[str, Any]:
    issues: List[str] = []
    warnings: List[str] = []
    sent_count = 0
    pending_count = 0
    orphan_booking_refs: List[str] = []
    missing_push_target: List[str] = []

    for doc_id, data in notification_entries:
        data = data or {}
        issues.extend(validate_notification_document(doc_id, data))

        if data.get("sent"):
            sent_count += 1
        else:
            pending_count += 1

        bid = (data.get("booking_id") or "").strip()
        if bid and bid not in booking_ids:
            orphan_booking_refs.append(doc_id)

        if data.get("sent") and not data.get("sent_at"):
            warnings.append(f"notifications/{doc_id}: sent=true but missing sent_at")

    return {
        "notification_count": len(notification_entries),
        "sent_count": sent_count,
        "pending_count": pending_count,
        "orphan_booking_refs": orphan_booking_refs,
        "missing_push_target": missing_push_target,
        "issues": issues,
        "warnings": warnings,
        "issue_count": len(issues),
        "warning_count": len(warnings),
        "ok": len(issues) == 0,
    }
