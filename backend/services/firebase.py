"""Firestore access layer — CRUD for Haazir AI collections (mock or Admin SDK)."""
import json
import os
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv

from services.firestore_schema import (
    ACTIVE_COLLECTIONS,
    FORBIDDEN_USER_IDS,
    audit_store,
    normalize_agent_log,
    normalize_booking,
    normalize_booking_status,
    normalize_dispute,
    normalize_notification,
    normalize_provider,
    normalize_user,
    require_firebase_uid,
)

_BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(_BACKEND_ROOT, ".env"))

FIREBASE_PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID", "")
_default_creds = os.path.join(_BACKEND_ROOT, "firebase-credentials.json")
_cred_env = os.getenv("FIREBASE_CREDENTIALS_PATH", _default_creds)
FIREBASE_CREDENTIALS_PATH = (
    _cred_env
    if os.path.isabs(_cred_env)
    else os.path.normpath(os.path.join(_BACKEND_ROOT, _cred_env.lstrip("./")))
)
MOCK_MODE = not FIREBASE_PROJECT_ID or FIREBASE_PROJECT_ID == "your_firebase_project_id"

COLLECTIONS = tuple(sorted(ACTIVE_COLLECTIONS))

_mock_db: Dict[str, Dict[str, Any]] = {name: {} for name in COLLECTIONS}
_db = None

if not MOCK_MODE:
    try:
        import firebase_admin
        from firebase_admin import credentials, firestore

        if not firebase_admin._apps:
            cred = credentials.Certificate(FIREBASE_CREDENTIALS_PATH)
            firebase_admin.initialize_app(cred)
        _db = firestore.client()
    except Exception as e:
        print(f"Firebase init error: {e} — switching to mock DB")
        MOCK_MODE = True


def is_mock_mode() -> bool:
    return MOCK_MODE


def _now_iso() -> str:
    return datetime.now().isoformat()


def _mock_bucket(name: str) -> Dict[str, Any]:
    return _mock_db[name]


def _doc_set(collection: str, doc_id: str, data: dict, merge: bool = False) -> None:
    if collection not in ACTIVE_COLLECTIONS:
        raise ValueError(f"Collection '{collection}' is not in the active Firestore schema")
    if MOCK_MODE:
        existing = _mock_bucket(collection).get(doc_id, {})
        _mock_bucket(collection)[doc_id] = {**existing, **data} if merge else {**data}
        return
    ref = _db.collection(collection).document(doc_id)
    if merge:
        ref.set(data, merge=True)
    else:
        ref.set(data)


def _doc_get(collection: str, doc_id: str) -> Optional[dict]:
    if MOCK_MODE:
        return _mock_bucket(collection).get(doc_id)
    snap = _db.collection(collection).document(doc_id).get()
    return snap.to_dict() if snap.exists else None


def _doc_update(collection: str, doc_id: str, data: dict) -> bool:
    if MOCK_MODE:
        if doc_id not in _mock_bucket(collection):
            return False
        _mock_bucket(collection)[doc_id].update(data)
        return True
    ref = _db.collection(collection).document(doc_id)
    if not ref.get().exists:
        return False
    ref.update(data)
    return True


def _doc_delete(collection: str, doc_id: str) -> bool:
    if MOCK_MODE:
        return _mock_bucket(collection).pop(doc_id, None) is not None
    ref = _db.collection(collection).document(doc_id)
    if not ref.get().exists:
        return False
    ref.delete()
    return True


def _query_all(collection: str) -> List[dict]:
    if MOCK_MODE:
        return list(_mock_bucket(collection).values())
    return [d.to_dict() for d in _db.collection(collection).stream()]


# ─── Bookings ────────────────────────────────────────────────────────────────


def _new_booking_id() -> str:
    date_str = datetime.now().strftime("%Y%m%d")
    suffix = str(uuid.uuid4())[:6].upper()
    return f"HAZ-{date_str}-{suffix}"


async def list_booking_entries() -> List[tuple]:
    """Return (document_id, data) for every bookings/{booking_id} doc."""
    if MOCK_MODE:
        return list(_mock_bucket("bookings").items())
    return [
        (snap.id, snap.to_dict() or {})
        for snap in _db.collection("bookings").stream()
    ]


async def save_booking(data: dict) -> str:
    booking_id = data.get("booking_id") or _new_booking_id()
    uid = None
    if data.get("user_id"):
        uid = require_firebase_uid(data["user_id"])
    payload = normalize_booking(
        {
            **data,
            "booking_id": booking_id,
            "created_at": data.get("created_at", _now_iso()),
        },
        booking_id=booking_id,
    )
    _doc_set("bookings", booking_id, payload)
    if uid:
        await append_user_booking(uid, booking_id)
    return booking_id


async def get_booking(booking_id: str) -> Optional[dict]:
    doc = _doc_get("bookings", booking_id)
    if doc:
        return doc
    return None


async def list_bookings(
    user_id: Optional[str] = None,
    provider_id: Optional[str] = None,
    status: Optional[str] = None,
) -> List[dict]:
    if MOCK_MODE:
        rows = list(_mock_bucket("bookings").values())
    else:
        rows = _query_all("bookings")

    if user_id:
        rows = [b for b in rows if b.get("user_id") == user_id]
    if provider_id:
        rows = [b for b in rows if b.get("provider_id") == provider_id]
    if status:
        want = normalize_booking_status(status)
        rows = [b for b in rows if normalize_booking_status(b.get("status")) == want]
    return rows


async def get_provider_bookings(provider_id: str) -> list:
    return await list_bookings(provider_id=provider_id)


async def update_booking(booking_id: str, data: dict) -> bool:
    patch = dict(data)
    if "status" in patch:
        patch["status"] = normalize_booking_status(patch["status"])
    if patch.get("user_id"):
        require_firebase_uid(patch["user_id"])
    return _doc_update("bookings", booking_id, {**patch, "updated_at": _now_iso()})


async def check_slot_conflict(provider_id: str, requested_time: str) -> bool:
    active = ("assigned", "confirmed", "on_the_way", "arrived", "in_progress")
    bookings = await list_bookings(provider_id=provider_id)
    for b in bookings:
        if b.get("status") not in active:
            continue
        slot = b.get("slot_time") or b.get("scheduled_time")
        if slot == requested_time:
            return True
    return False


async def update_booking_status(booking_id: str, status: str) -> None:
    await update_booking(booking_id, {"status": normalize_booking_status(status)})


async def list_user_entries() -> List[tuple]:
    """Return (document_id, data) for every users/{uid} doc."""
    if MOCK_MODE:
        return list(_mock_bucket("users").items())
    return [
        (snap.id, snap.to_dict() or {})
        for snap in _db.collection("users").stream()
    ]


async def sync_user_profile(user_id: str, data: dict) -> str:
    """Create or update users/{uid} after Firebase Auth sign-in."""
    from services.user_validation import mirror_profile_root_fields
    from services.users_integrity import normalize_role

    require_firebase_uid(user_id)
    existing = await get_user(user_id) or {}

    if data.get("role") is not None:
        data = {**data, "role": normalize_role(data["role"])}
    now = _now_iso()

    # Do not wipe stored identity fields with empty partial syncs
    merged = {**existing, **{k: v for k, v in data.items() if v is not None and v != ""}}
    merged.update(
        {
            "user_id": user_id,
            "uid": user_id,
            "last_login": now,
            "updated_at": now,
        }
    )
    merged = mirror_profile_root_fields(merged)

    merged = normalize_user(merged, user_id)
    if existing:
        await update_user(user_id, merged)
    else:
        merged.setdefault("created_at", now)
        merged.setdefault("booking_history", [])
        await create_user(user_id, merged)
    return user_id


async def list_users_by_provider(provider_id: str) -> List[str]:
    """Firebase UIDs of workers linked to a provider."""
    rows = _query_all("users")
    ids = []
    for u in rows:
        if u.get("role") != "worker":
            continue
        if u.get("provider_id") == provider_id:
            uid = u.get("user_id") or u.get("uid")
            if uid:
                ids.append(uid)
    return ids


async def delete_booking(booking_id: str) -> bool:
    """Soft-cancel booking (status cancelled)."""
    await update_booking_status(booking_id, "cancelled")
    return True


# ─── Providers ─────────────────────────────────────────────────────────────────


async def list_provider_entries() -> List[tuple]:
    """Return (document_id, data) for every providers/{provider_id} doc."""
    if MOCK_MODE:
        return list(_mock_bucket("providers").items())
    return [
        (snap.id, snap.to_dict() or {})
        for snap in _db.collection("providers").stream()
    ]


async def upsert_provider(provider_id: str, data: dict) -> str:
    from services.providers_integrity import format_provider_record

    pid = (provider_id or data.get("id") or data.get("provider_id") or "").strip()
    if not pid:
        raise ValueError("provider_id is required")
    existing = _doc_get("providers", pid)
    merged = format_provider_record({**(existing or {}), **data}, pid)
    payload = normalize_provider(merged, pid)
    payload["updated_at"] = _now_iso()
    if not existing and "created_at" not in data:
        payload["created_at"] = _now_iso()
    _doc_set("providers", pid, payload, merge=True)
    return pid


async def get_provider(provider_id: str) -> Optional[dict]:
    from services.providers_integrity import format_provider_record

    pid = (provider_id or "").strip()
    if not pid:
        return None
    doc = _doc_get("providers", pid)
    if not doc:
        return None
    return format_provider_record(doc, pid)


async def list_providers(
    city: Optional[str] = None, service: Optional[str] = None
) -> List[dict]:
    from services.providers_integrity import format_provider_record

    rows = []
    for doc_id, data in await list_provider_entries():
        rows.append(format_provider_record(data or {}, doc_id))

    if city:
        rows = [p for p in rows if p.get("city", "").lower() == city.lower()]
    if service:
        rows = [
            p
            for p in rows
            if service.lower() in (p.get("service") or "").lower()
            or any(
                service.lower() in s.lower()
                for s in (p.get("specialization") or [])
            )
        ]
    return rows


async def update_provider(provider_id: str, data: dict) -> bool:
    return _doc_update("providers", provider_id, {**data, "updated_at": _now_iso()})


async def delete_provider(provider_id: str) -> bool:
    return await update_provider(provider_id, {"available": False, "deleted": True})


async def seed_providers_from_json(json_path: str) -> int:
    with open(json_path, encoding="utf-8") as f:
        providers = json.load(f)
    count = 0
    for p in providers:
        pid = (p.get("id") or "").strip()
        if not pid:
            continue
        await upsert_provider(pid, p)
        count += 1
    return count


async def verify_providers_integrity() -> Dict[str, Any]:
    """Step 4 audit: provider_id consistency, canonical fields, booking refs."""
    from services.providers_integrity import audit_providers_collection

    entries = await list_provider_entries()
    booking_entries = await list_booking_entries()
    booking_pids = {
        (b.get("provider_id") or "").strip()
        for _, b in booking_entries
        if b.get("provider_id")
    }

    audit = audit_providers_collection(entries, booking_pids)
    json_path = os.path.join(_BACKEND_ROOT, "data", "providers.json")
    json_count = 0
    if os.path.isfile(json_path):
        with open(json_path, encoding="utf-8") as f:
            json_count = len(json.load(f))

    return {
        "mock_mode": MOCK_MODE,
        "seed_json_count": json_count,
        "firestore_count": len(entries),
        **audit,
        "ok": audit["ok"] and len(entries) >= min(5, json_count),
    }


# ─── Users ───────────────────────────────────────────────────────────────────


async def create_user(user_id: str, data: dict) -> str:
    uid = require_firebase_uid(user_id)
    payload = normalize_user(
        {**data, "created_at": data.get("created_at", _now_iso())},
        uid,
    )
    _doc_set("users", uid, payload)
    return uid


async def get_user(user_id: str) -> Optional[dict]:
    require_firebase_uid(user_id)
    return _doc_get("users", user_id)


async def cleanup_invalid_user_documents() -> Dict[str, Any]:
    """Delete users/{doc_id} where doc_id is not a valid Firebase Auth UID."""
    from services.users_integrity import is_plausible_firebase_uid

    deleted: List[str] = []
    skipped: List[str] = []
    for doc_id, _data in await list_user_entries():
        if is_plausible_firebase_uid(doc_id):
            skipped.append(doc_id)
            continue
        if _doc_delete("users", doc_id):
            deleted.append(doc_id)
    return {"deleted": deleted, "kept": len(skipped)}


async def repair_user_profile_roots() -> Dict[str, Any]:
    """Mirror phone/cnic/username from worker_data to root for all users."""
    from services.user_validation import mirror_profile_root_fields

    fixed: List[str] = []
    for uid, doc in await list_user_entries():
        before_phone = (doc.get("phone") or "").strip()
        repaired = mirror_profile_root_fields({**doc})
        after_phone = (repaired.get("phone") or "").strip()
        if after_phone and not before_phone:
            await update_user(uid, repaired)
            fixed.append(uid)
        elif repaired.get("profile_complete") and not doc.get("profile_complete"):
            await update_user(uid, repaired)
            if uid not in fixed:
                fixed.append(uid)
    return {"users_repaired": len(fixed), "user_ids": fixed}


async def verify_users_integrity() -> Dict[str, Any]:
    """Step 2 audit: users/{uid} only, valid UIDs, roles, no separate workers collection."""
    from services.users_integrity import audit_users_collection

    entries = await list_user_entries()
    audit = audit_users_collection(entries)

    extra_worker_collection = []
    if not MOCK_MODE:
        try:
            for coll_ref in _db.collections():
                if coll_ref.id in ("workers", "worker", "worker_profiles"):
                    extra_worker_collection.append(coll_ref.id)
        except Exception as exc:
            extra_worker_collection.append(f"(list failed: {exc})")

    return {
        "mock_mode": MOCK_MODE,
        **audit,
        "forbidden_user_ids_blocked": list(FORBIDDEN_USER_IDS - {""}),
        "extra_worker_collections": extra_worker_collection,
        "ok": audit["ok"] and not extra_worker_collection,
    }


async def update_user(user_id: str, data: dict) -> bool:
    require_firebase_uid(user_id)
    patch = normalize_user({**data}, user_id)
    return _doc_update("users", user_id, {**patch, "updated_at": _now_iso()})


async def append_user_booking(user_id: str, booking_id: str) -> None:
    uid = require_firebase_uid(user_id)
    if not booking_id:
        return
    booking = await get_booking(booking_id)
    if not booking:
        return
    user = await get_user(uid)
    if not user:
        return
    history = list(user.get("booking_history") or [])
    if booking_id not in history:
        history.append(booking_id)
    await update_user(uid, {"booking_history": history})


async def repair_all_booking_history() -> Dict[str, Any]:
    """Rebuild users/{uid}.booking_history from bookings collection."""
    from services.users_integrity import is_plausible_firebase_uid

    by_user: Dict[str, List[str]] = {}
    for doc_id, data in await list_booking_entries():
        uid = (data.get("user_id") or "").strip()
        if not uid or not is_plausible_firebase_uid(uid):
            continue
        by_user.setdefault(uid, []).append(doc_id)

    updated: List[str] = []
    for uid, bids in by_user.items():
        user = await get_user(uid)
        if not user:
            continue
        merged = sorted(set(list(user.get("booking_history") or []) + bids))
        await update_user(uid, {"booking_history": merged})
        updated.append(uid)

    return {"users_updated": len(updated), "user_ids": updated}


async def cleanup_bookings_with_invalid_user_id() -> Dict[str, Any]:
    """Remove bookings tied to fake / legacy user ids."""
    from services.users_integrity import is_plausible_firebase_uid

    deleted: List[str] = []
    for doc_id, data in await list_booking_entries():
        uid = (data.get("user_id") or "").strip()
        if uid in FORBIDDEN_USER_IDS or not is_plausible_firebase_uid(uid):
            if _doc_delete("bookings", doc_id):
                deleted.append(doc_id)
    return {"deleted": deleted}


async def verify_bookings_integrity() -> Dict[str, Any]:
    """Step 3 audit: booking fields, UIDs, status, user history linkage."""
    from services.booking_lifecycle import BOOKING_STATUSES
    from services.bookings_integrity import audit_bookings_collection

    booking_entries = await list_booking_entries()
    user_entries = await list_user_entries()
    audit = audit_bookings_collection(booking_entries, user_entries)

    return {
        "mock_mode": MOCK_MODE,
        "allowed_statuses": list(BOOKING_STATUSES),
        "status_aliases": {"enroute": "on_the_way", "en_route": "on_the_way"},
        **audit,
    }


async def delete_user(user_id: str) -> bool:
    return _doc_delete("users", user_id)


# ─── Disputes ────────────────────────────────────────────────────────────────


async def list_dispute_entries() -> List[tuple]:
    """Return (document_id, data) for every disputes/{dispute_id} doc."""
    if MOCK_MODE:
        return list(_mock_bucket("disputes").items())
    return [
        (snap.id, snap.to_dict() or {})
        for snap in _db.collection("disputes").stream()
    ]


async def create_dispute(data: dict) -> str:
    dispute_id = data.get("dispute_id") or str(uuid.uuid4())
    payload = normalize_dispute(
        {**data, "created_at": data.get("created_at", _now_iso())},
        dispute_id=dispute_id,
    )
    _doc_set("disputes", dispute_id, payload)
    return dispute_id


async def get_dispute(dispute_id: str) -> Optional[dict]:
    return _doc_get("disputes", dispute_id)


async def list_disputes_for_booking(booking_id: str) -> List[dict]:
    bid = (booking_id or "").strip()
    if not bid:
        return []
    rows = await list_dispute_entries()
    out = []
    for doc_id, data in rows:
        data = data or {}
        if (data.get("booking_id") or "").strip() == bid:
            out.append(normalize_dispute({**data, "dispute_id": doc_id}, dispute_id=doc_id))
    return out


async def list_disputes_for_user(user_id: str) -> List[dict]:
    """Disputes filed by user or linked to their bookings."""
    from services.firestore_schema import require_firebase_uid

    uid = require_firebase_uid(user_id)
    booking_entries = await list_booking_entries()
    user_booking_ids = {
        doc_id
        for doc_id, data in booking_entries
        if (data.get("user_id") or "").strip() == uid
    }
    out: List[dict] = []
    for doc_id, data in await list_dispute_entries():
        data = data or {}
        bid = (data.get("booking_id") or "").strip()
        doc_uid = (data.get("user_id") or "").strip()
        if doc_uid == uid or bid in user_booking_ids:
            out.append(normalize_dispute({**data, "dispute_id": doc_id}, dispute_id=doc_id))
    out.sort(key=lambda d: d.get("created_at", ""), reverse=True)
    return out


async def update_dispute(dispute_id: str, data: dict) -> bool:
    patch = normalize_dispute({**data}, dispute_id=dispute_id)
    return _doc_update("disputes", dispute_id, {**patch, "updated_at": _now_iso()})


async def delete_dispute(dispute_id: str) -> bool:
    return _doc_delete("disputes", dispute_id)


async def verify_disputes_integrity() -> Dict[str, Any]:
    """Step 6 audit: disputes linked to bookings, canonical fields, status."""
    from services.disputes_integrity import audit_disputes_collection

    dispute_entries = await list_dispute_entries()
    booking_entries = await list_booking_entries()
    booking_ids = {doc_id for doc_id, _ in booking_entries}
    bookings_by_id = {doc_id: data for doc_id, data in booking_entries}
    audit = audit_disputes_collection(dispute_entries, booking_ids, bookings_by_id)

    return {
        "mock_mode": MOCK_MODE,
        **audit,
    }


# ─── Agent logs ──────────────────────────────────────────────────────────────


async def list_agent_log_entries() -> List[tuple]:
    """Return (document_id, data) for every agent_logs/{request_id} doc."""
    if MOCK_MODE:
        return list(_mock_bucket("agent_logs").items())
    return [
        (snap.id, snap.to_dict() or {})
        for snap in _db.collection("agent_logs").stream()
    ]


async def save_agent_logs(
    request_id: str, user_input: str, logs: List[dict], user_id: Optional[str] = None
) -> str:
    rid = (request_id or "").strip()
    if not rid:
        raise ValueError("request_id is required to save agent_logs")
    extra: Dict[str, Any] = {"timestamp": _now_iso()}
    if user_id:
        extra["user_id"] = require_firebase_uid(user_id)
    payload = normalize_agent_log(extra, rid, user_input, logs)
    _doc_set("agent_logs", rid, payload)
    return rid


async def append_agent_log(
    request_id: str, log_entry: dict, user_input: Optional[str] = None
) -> bool:
    """Append one agent step to an existing agent_logs/{request_id} document."""
    rid = (request_id or "").strip()
    if not rid:
        return False
    from services.agent_logs_integrity import sanitize_log_entry

    entry = sanitize_log_entry(log_entry)
    if not entry:
        return False
    existing = await get_agent_logs_doc(rid) or {}
    logs = list(existing.get("logs") or [])
    logs.append(entry)
    payload = normalize_agent_log(
        {
            "timestamp": existing.get("timestamp") or _now_iso(),
            "user_id": existing.get("user_id"),
        },
        rid,
        user_input or existing.get("user_input") or "",
        logs,
    )
    _doc_set("agent_logs", rid, payload)
    return True


async def get_agent_logs_doc(request_id: str) -> Optional[dict]:
    rid = (request_id or "").strip()
    if not rid:
        return None
    doc = _doc_get("agent_logs", rid)
    if not doc:
        return None
    return normalize_agent_log(
        doc,
        rid,
        doc.get("user_input", ""),
        doc.get("logs") or [],
    )


async def verify_agent_logs_integrity() -> Dict[str, Any]:
    """Step 7 audit: agent_logs fields, user_input, timestamps, log entries."""
    from services.agent_logs_integrity import audit_agent_logs_collection

    entries = await list_agent_log_entries()
    audit = audit_agent_logs_collection(entries)
    return {
        "mock_mode": MOCK_MODE,
        **audit,
    }


# ─── Notifications ───────────────────────────────────────────────────────────


async def create_notification(data: dict) -> str:
    notif_id = data.get("notif_id") or str(uuid.uuid4())
    payload = normalize_notification(
        {**data, "created_at": data.get("created_at", _now_iso())},
        notif_id=notif_id,
    )
    _doc_set("notifications", notif_id, payload)
    return notif_id


async def get_notification(notif_id: str) -> Optional[dict]:
    return _doc_get("notifications", notif_id)


async def list_pending_notifications(before_iso: Optional[str] = None) -> List[dict]:
    before = before_iso or _now_iso()
    rows = _query_all("notifications")
    pending = []
    for n in rows:
        if n.get("sent"):
            continue
        send_at = n.get("send_at") or ""
        if send_at and send_at <= before:
            pending.append(n)
    return pending


async def mark_notification_sent(notif_id: str) -> bool:
    return _doc_update(
        "notifications",
        notif_id,
        {"sent": True, "sent_at": _now_iso()},
    )


async def list_notification_entries() -> List[tuple]:
    """Return (document_id, data) for every notifications/{notif_id} doc."""
    if MOCK_MODE:
        return list(_mock_bucket("notifications").items())
    return [
        (snap.id, snap.to_dict() or {})
        for snap in _db.collection("notifications").stream()
    ]


async def find_recent_notification(
    user_id: str,
    booking_id: str,
    event_type: str,
    within_seconds: int = 90,
) -> bool:
    """True if the same event was already recorded recently (dedupe)."""
    from datetime import datetime, timedelta, timezone

    uid = require_firebase_uid(user_id)
    bid = (booking_id or "").strip()
    etype = (event_type or "").strip()
    if not etype:
        return False

    cutoff = datetime.now(timezone.utc) - timedelta(seconds=within_seconds)
    cutoff_iso = cutoff.isoformat()

    for _nid, data in await list_notification_entries():
        data = data or {}
        if (data.get("user_id") or "").strip() != uid:
            continue
        if bid and (data.get("booking_id") or "").strip() != bid:
            continue
        if (data.get("event_type") or "").strip() != etype:
            continue
        created = data.get("sent_at") or data.get("created_at") or data.get("send_at") or ""
        if created and created >= cutoff_iso:
            return True
    return False


async def verify_notifications_integrity() -> Dict[str, Any]:
    """Step 8 audit: notifications/{notif_id} fields and booking refs."""
    from services.notifications_integrity import audit_notifications_collection

    entries = await list_notification_entries()
    booking_entries = await list_booking_entries()
    booking_ids = {doc_id for doc_id, _ in booking_entries}
    audit = audit_notifications_collection(entries, booking_ids)
    users_with_token = 0
    for _uid, doc in await list_user_entries():
        if (doc.get("push_token") or "").strip():
            users_with_token += 1
    return {
        "mock_mode": MOCK_MODE,
        "users_with_push_token": users_with_token,
        **audit,
    }


async def delete_notification(notif_id: str) -> bool:
    return _doc_delete("notifications", notif_id)


# ─── Reviews (stored on booking doc — no separate collection) ─────────────────


async def save_review(data: dict) -> str:
    """Persist feedback on bookings/{booking_id} (canonical schema has no reviews collection)."""
    booking_id = data.get("booking_id")
    if not booking_id:
        raise ValueError("booking_id required for review")
    user_id = data.get("user_id")
    if user_id:
        require_firebase_uid(user_id)
    await update_booking(
        booking_id,
        {
            "review_rating": data.get("rating"),
            "review_tags": data.get("tags", []),
            "review_text": data.get("review", data.get("text", "")),
            "review_user_id": user_id,
            "reviewed_at": _now_iso(),
        },
    )
    return booking_id


# ─── Booking reminders helper ──────────────────────────────────────────────────


async def schedule_booking_reminders(
    booking_id: str,
    user_id: str,
    reminder_times: List[str],
    message_template: str,
) -> List[str]:
    ids = []
    for send_at in reminder_times:
        nid = await create_notification(
            {
                "booking_id": booking_id,
                "user_id": user_id,
                "send_at": send_at,
                "message": message_template.format(booking_id=booking_id),
                "sent": False,
            }
        )
        ids.append(nid)
    return ids


# Legacy alias
async def add_to_waitlist(data: dict) -> str:
    return await create_notification(
        {**data, "message": data.get("message", "Waitlist"), "sent": False}
    )


async def migrate_reviews_to_bookings() -> Dict[str, Any]:
    """Move legacy reviews/{id} docs onto bookings/{booking_id} and delete review docs."""
    migrated = 0
    skipped = 0
    errors: List[str] = []

    if MOCK_MODE:
        legacy = _mock_db.pop("reviews", {})
        for _rid, rev in legacy.items():
            bid = rev.get("booking_id")
            if not bid:
                skipped += 1
                continue
            try:
                await save_review(
                    {
                        "booking_id": bid,
                        "user_id": rev.get("user_id"),
                        "rating": rev.get("rating"),
                        "tags": rev.get("tags", []),
                        "review": rev.get("review", rev.get("text", "")),
                    }
                )
                migrated += 1
            except Exception as exc:
                errors.append(str(exc))
        return {"migrated": migrated, "skipped": skipped, "errors": errors}

    coll = _db.collection("reviews")
    for snap in coll.stream():
        rev = snap.to_dict() or {}
        bid = rev.get("booking_id")
        if not bid:
            skipped += 1
            continue
        try:
            await save_review(
                {
                    "booking_id": bid,
                    "user_id": rev.get("user_id"),
                    "rating": rev.get("rating"),
                    "tags": rev.get("tags", []),
                    "review": rev.get("review", rev.get("text", "")),
                }
            )
            snap.reference.delete()
            migrated += 1
        except Exception as exc:
            errors.append(f"{snap.id}: {exc}")
    return {"migrated": migrated, "skipped": skipped, "errors": errors}


async def verify_firestore_structure() -> Dict[str, Any]:
    """Step 1 audit: active collections only, UID rules, document counts."""
    extra_root: List[str] = []
    store: Dict[str, Dict[str, Dict[str, Any]]] = {c: {} for c in COLLECTIONS}

    if MOCK_MODE:
        for name, bucket in _mock_db.items():
            if name in ACTIVE_COLLECTIONS:
                store[name] = dict(bucket)
            else:
                extra_root.append(name)
    else:
        for coll in COLLECTIONS:
            for snap in _db.collection(coll).stream():
                store[coll][snap.id] = snap.to_dict() or {}
        try:
            for coll_ref in _db.collections():
                if coll_ref.id not in ACTIVE_COLLECTIONS:
                    extra_root.append(coll_ref.id)
        except Exception as exc:
            extra_root.append(f"(list failed: {exc})")

    audit = audit_store(store)
    return {
        "mock_mode": MOCK_MODE,
        "project_id": FIREBASE_PROJECT_ID or None,
        "active_collections": list(COLLECTIONS),
        **audit,
        "extra_root_collections": extra_root,
        "ok": audit["issue_count"] == 0 and not extra_root,
    }
