"""Step 2 — users/{uid} integrity checks (auth + profile)."""
from collections import defaultdict
from typing import Any, Dict, List, Optional, Tuple

from services.firestore_schema import FORBIDDEN_USER_IDS, require_firebase_uid

VALID_ROLES = frozenset({"customer", "worker"})

# Firebase Auth UIDs are typically 28 chars; allow reasonable range.
UID_MIN_LEN = 20
UID_MAX_LEN = 128


def is_plausible_firebase_uid(uid: str) -> bool:
    """Reject demo ids and email-slug legacy keys; accept real Firebase Auth UIDs."""
    if not uid or uid in FORBIDDEN_USER_IDS:
        return False
    if uid.startswith("user_") or "@" in uid or "." in uid:
        return False
    if len(uid) < UID_MIN_LEN or len(uid) > UID_MAX_LEN:
        return False
    # Firebase Auth UIDs are alphanumeric (mixed case).
    return uid.isalnum()


def normalize_role(role: Optional[str]) -> Optional[str]:
    if role is None or (isinstance(role, str) and not role.strip()):
        return None
    r = str(role).strip().lower()
    if r not in VALID_ROLES:
        raise ValueError(f"role must be one of: {', '.join(sorted(VALID_ROLES))}")
    return r


def validate_user_document(doc_id: str, data: Dict[str, Any]) -> List[str]:
    """Validate a single users/{doc_id} document."""
    issues: List[str] = []
    prefix = f"users/{doc_id}"

    if doc_id in FORBIDDEN_USER_IDS or not is_plausible_firebase_uid(doc_id):
        issues.append(f"{prefix}: invalid document id (must be Firebase Auth UID)")

    try:
        require_firebase_uid(doc_id)
    except ValueError as exc:
        issues.append(f"{prefix}: {exc}")

    uid_field = (data.get("user_id") or data.get("uid") or "").strip()
    if not uid_field:
        issues.append(f"{prefix}: missing user_id/uid field")
    elif uid_field != doc_id:
        issues.append(f"{prefix}: user_id/uid '{uid_field}' does not match document id")
    elif uid_field in FORBIDDEN_USER_IDS:
        issues.append(f"{prefix}: forbidden user_id value")

    role = data.get("role")
    if role is not None:
        try:
            normalize_role(role)
        except ValueError as exc:
            issues.append(f"{prefix}: {exc}")
    else:
        issues.append(f"{prefix}: missing role (customer|worker)")

    email = (data.get("email") or "").strip()
    if not email:
        issues.append(f"{prefix}: missing email")

    return issues


def worker_onboarding_warnings(doc_id: str, data: Dict[str, Any]) -> List[str]:
    """Non-fatal: worker signed up but has not finished worker-signup screen."""
    if (data.get("role") or "").lower() != "worker":
        return []
    skills = data.get("skills") or []
    wd = data.get("worker_data") or {}
    has_skills = isinstance(skills, list) and len(skills) > 0
    has_wd = isinstance(wd, dict) and bool(wd.get("specializations"))
    if has_skills or has_wd:
        return []
    return [f"users/{doc_id}: worker onboarding incomplete (no skills yet)"]


def audit_users_collection(
    user_entries: List[Tuple[str, Dict[str, Any]]],
) -> Dict[str, Any]:
    """
    Audit all users/{doc_id} documents.
    user_entries: list of (document_id, document_data)
    """
    issues: List[str] = []
    warnings: List[str] = []
    by_email: Dict[str, List[str]] = defaultdict(list)
    roles = {"customer": 0, "worker": 0, "other": 0}
    forbidden_docs: List[str] = []
    id_mismatches: List[str] = []

    for doc_id, data in user_entries:
        data = data or {}
        if doc_id in FORBIDDEN_USER_IDS:
            forbidden_docs.append(doc_id)
        issues.extend(validate_user_document(doc_id, data))
        warnings.extend(worker_onboarding_warnings(doc_id, data))

        uid_field = (data.get("user_id") or data.get("uid") or "").strip()
        if uid_field and uid_field != doc_id:
            id_mismatches.append(doc_id)

        role = (data.get("role") or "").lower()
        if role in VALID_ROLES:
            roles[role] += 1
        else:
            roles["other"] += 1

        email = (data.get("email") or "").strip().lower()
        if email:
            by_email[email].append(doc_id)

    duplicate_emails = {e: ids for e, ids in by_email.items() if len(ids) > 1}

    return {
        "user_count": len(user_entries),
        "roles": roles,
        "forbidden_doc_ids": forbidden_docs,
        "id_mismatches": id_mismatches,
        "duplicate_emails": duplicate_emails,
        "issues": issues,
        "warnings": warnings,
        "issue_count": len(issues),
        "warning_count": len(warnings),
        "ok": len(issues) == 0 and not forbidden_docs and not id_mismatches,
    }
