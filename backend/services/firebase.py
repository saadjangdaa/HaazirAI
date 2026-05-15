"""Firestore access layer — CRUD for Haazir AI collections (mock or Admin SDK)."""
import json
import os
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv

load_dotenv()

FIREBASE_PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID", "")
FIREBASE_CREDENTIALS_PATH = os.getenv(
    "FIREBASE_CREDENTIALS_PATH", "./firebase-credentials.json"
)
MOCK_MODE = not FIREBASE_PROJECT_ID or FIREBASE_PROJECT_ID == "your_firebase_project_id"

COLLECTIONS = (
    "providers",
    "bookings",
    "users",
    "disputes",
    "agent_logs",
    "notifications",
    "reviews",
)

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


async def save_booking(data: dict) -> str:
    booking_id = data.get("booking_id") or _new_booking_id()
    slot = data.get("slot_time") or data.get("scheduled_time", "")
    payload = {
        **data,
        "booking_id": booking_id,
        "slot_time": slot,
        "scheduled_time": data.get("scheduled_time", slot),
        "reminder_sent": data.get("reminder_sent", False),
        "created_at": data.get("created_at", _now_iso()),
    }
    _doc_set("bookings", booking_id, payload)
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
        rows = [b for b in rows if b.get("status") == status]
    return rows


async def get_provider_bookings(provider_id: str) -> list:
    return await list_bookings(provider_id=provider_id)


async def update_booking(booking_id: str, data: dict) -> bool:
    return _doc_update("bookings", booking_id, {**data, "updated_at": _now_iso()})


async def check_slot_conflict(provider_id: str, requested_time: str) -> bool:
    active = ("confirmed", "en_route", "in_progress")
    bookings = await list_bookings(provider_id=provider_id)
    for b in bookings:
        if b.get("status") not in active:
            continue
        slot = b.get("slot_time") or b.get("scheduled_time")
        if slot == requested_time:
            return True
    return False


async def update_booking_status(booking_id: str, status: str) -> None:
    await update_booking(booking_id, {"status": status})


async def delete_booking(booking_id: str) -> bool:
    """Soft-cancel booking (status cancelled)."""
    await update_booking_status(booking_id, "cancelled")
    return True


# ─── Providers ─────────────────────────────────────────────────────────────────


async def upsert_provider(provider_id: str, data: dict) -> str:
    existing = _doc_get("providers", provider_id)
    payload = {**data, "id": provider_id, "updated_at": _now_iso()}
    if not existing and "created_at" not in data:
        payload["created_at"] = _now_iso()
    _doc_set("providers", provider_id, payload, merge=True)
    return provider_id


async def get_provider(provider_id: str) -> Optional[dict]:
    return _doc_get("providers", provider_id)


async def list_providers(
    city: Optional[str] = None, service: Optional[str] = None
) -> List[dict]:
    rows = _query_all("providers")
    if city:
        rows = [p for p in rows if p.get("city", "").lower() == city.lower()]
    if service:
        rows = [
            p
            for p in rows
            if service.lower() in (p.get("service") or "").lower()
            or any(service.lower() in s.lower() for s in p.get("specialization", []))
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
        pid = p.get("id") or str(uuid.uuid4())
        await upsert_provider(pid, p)
        count += 1
    return count


# ─── Users ───────────────────────────────────────────────────────────────────


async def create_user(user_id: str, data: dict) -> str:
    payload = {
        **data,
        "user_id": user_id,
        "booking_history": data.get("booking_history", []),
        "created_at": _now_iso(),
    }
    _doc_set("users", user_id, payload)
    return user_id


async def get_user(user_id: str) -> Optional[dict]:
    return _doc_get("users", user_id)


async def update_user(user_id: str, data: dict) -> bool:
    return _doc_update("users", user_id, {**data, "updated_at": _now_iso()})


async def append_user_booking(user_id: str, booking_id: str) -> None:
    user = await get_user(user_id)
    if not user:
        await create_user(
            user_id,
            {"name": "Guest", "phone": "", "city": "", "booking_history": [booking_id]},
        )
        return
    history = list(user.get("booking_history") or [])
    if booking_id not in history:
        history.append(booking_id)
    await update_user(user_id, {"booking_history": history})


async def delete_user(user_id: str) -> bool:
    return _doc_delete("users", user_id)


# ─── Disputes ────────────────────────────────────────────────────────────────


async def create_dispute(data: dict) -> str:
    dispute_id = data.get("dispute_id") or str(uuid.uuid4())
    payload = {
        **data,
        "dispute_id": dispute_id,
        "status": data.get("status", "open"),
        "created_at": data.get("created_at", _now_iso()),
    }
    _doc_set("disputes", dispute_id, payload)
    return dispute_id


async def get_dispute(dispute_id: str) -> Optional[dict]:
    return _doc_get("disputes", dispute_id)


async def list_disputes_for_booking(booking_id: str) -> List[dict]:
    rows = _query_all("disputes")
    return [d for d in rows if d.get("booking_id") == booking_id]


async def update_dispute(dispute_id: str, data: dict) -> bool:
    return _doc_update("disputes", dispute_id, {**data, "updated_at": _now_iso()})


async def delete_dispute(dispute_id: str) -> bool:
    return _doc_delete("disputes", dispute_id)


# ─── Agent logs ──────────────────────────────────────────────────────────────


async def save_agent_logs(
    request_id: str, user_input: str, logs: List[dict], user_id: Optional[str] = None
) -> str:
    payload = {
        "request_id": request_id,
        "user_input": user_input,
        "user_id": user_id,
        "timestamp": _now_iso(),
        "logs": logs,
    }
    _doc_set("agent_logs", request_id, payload)
    return request_id


async def get_agent_logs_doc(request_id: str) -> Optional[dict]:
    return _doc_get("agent_logs", request_id)


# ─── Notifications ───────────────────────────────────────────────────────────


async def create_notification(data: dict) -> str:
    notif_id = data.get("notif_id") or str(uuid.uuid4())
    payload = {
        **data,
        "notif_id": notif_id,
        "sent": data.get("sent", False),
        "created_at": data.get("created_at", _now_iso()),
    }
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
        "notifications", notif_id, {"sent": True, "sent_at": _now_iso()}
    )


async def delete_notification(notif_id: str) -> bool:
    return _doc_delete("notifications", notif_id)


# ─── Reviews (feedback) ──────────────────────────────────────────────────────


async def save_review(data: dict) -> str:
    review_id = str(uuid.uuid4())
    payload = {**data, "review_id": review_id, "created_at": _now_iso()}
    _doc_set("reviews", review_id, payload)
    return review_id


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
