import os
import uuid
from datetime import datetime
from typing import Optional, Dict, Any
from dotenv import load_dotenv

load_dotenv()

FIREBASE_PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID", "")
FIREBASE_CREDENTIALS_PATH = os.getenv("FIREBASE_CREDENTIALS_PATH", "./firebase-credentials.json")
MOCK_MODE = not FIREBASE_PROJECT_ID or FIREBASE_PROJECT_ID == "your_firebase_project_id"

_mock_db: Dict[str, Dict[str, Any]] = {
    "bookings": {},
    "requests": {},
    "reviews": {},
    "waitlist": {},
}

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


def _new_booking_id() -> str:
    date_str = datetime.now().strftime("%Y%m%d")
    suffix = str(uuid.uuid4())[:6].upper()
    return f"HAZ-{date_str}-{suffix}"


async def save_booking(data: dict) -> str:
    booking_id = data.get("booking_id") or _new_booking_id()
    payload = {**data, "booking_id": booking_id, "created_at": datetime.now().isoformat()}

    if MOCK_MODE:
        _mock_db["bookings"][booking_id] = payload
        return booking_id

    _db.collection("bookings").document(booking_id).set(payload)
    return booking_id


async def get_booking(booking_id: str) -> Optional[dict]:
    if MOCK_MODE:
        return _mock_db["bookings"].get(booking_id)
    doc = _db.collection("bookings").document(booking_id).get()
    return doc.to_dict() if doc.exists else None


async def get_provider_bookings(provider_id: str) -> list:
    if MOCK_MODE:
        return [b for b in _mock_db["bookings"].values() if b.get("provider_id") == provider_id]
    docs = _db.collection("bookings").where("provider_id", "==", provider_id).stream()
    return [d.to_dict() for d in docs]


async def check_slot_conflict(provider_id: str, requested_time: str) -> bool:
    if MOCK_MODE:
        return any(
            b.get("provider_id") == provider_id
            and b.get("scheduled_time") == requested_time
            and b.get("status") == "confirmed"
            for b in _mock_db["bookings"].values()
        )
    docs = (
        _db.collection("bookings")
        .where("provider_id", "==", provider_id)
        .where("scheduled_time", "==", requested_time)
        .where("status", "==", "confirmed")
        .stream()
    )
    return len(list(docs)) > 0


async def update_booking_status(booking_id: str, status: str) -> None:
    if MOCK_MODE:
        if booking_id in _mock_db["bookings"]:
            _mock_db["bookings"][booking_id]["status"] = status
        return
    _db.collection("bookings").document(booking_id).update({"status": status})


async def save_review(data: dict) -> str:
    review_id = str(uuid.uuid4())
    payload = {**data, "review_id": review_id, "created_at": datetime.now().isoformat()}
    if MOCK_MODE:
        _mock_db["reviews"][review_id] = payload
        return review_id
    _db.collection("reviews").document(review_id).set(payload)
    return review_id


async def add_to_waitlist(data: dict) -> str:
    waitlist_id = str(uuid.uuid4())
    payload = {**data, "waitlist_id": waitlist_id, "created_at": datetime.now().isoformat()}
    if MOCK_MODE:
        _mock_db["waitlist"][waitlist_id] = payload
        return waitlist_id
    _db.collection("waitlist").document(waitlist_id).set(payload)
    return waitlist_id
