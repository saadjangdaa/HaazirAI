"""
Firebase Admin (Firestore) service for Haazir Dost.

Collections: users, providers, bookings, agent_logs, disputes.
Legacy helpers: async wrappers used by Pakka, Dhundho, Jhagra, Report, main (reviews, waitlist).

Credentials: set FIREBASE_CREDENTIALS_PATH or pass ``firebase-key.json`` / ``firebase-credentials.json``.
Never commit key files (see .gitignore).

Environment is loaded from ``config`` (``backend/config.py``) when available; do not duplicate
``load_dotenv()`` here so a single source of truth drives Firebase + Gemini + Maps.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv

logger = logging.getLogger(__name__)

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

# Collection name constants
COL_USERS = "users"
COL_PROVIDERS = "providers"
COL_BOOKINGS = "bookings"
COL_AGENT_LOGS = "agent_logs"
COL_DISPUTES = "disputes"
COL_REVIEWS = "reviews"
COL_WAITLIST = "waitlist"

FIREBASE_PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID", "")
_default_creds = os.path.join(_BACKEND_ROOT, "firebase-credentials.json")
_cred_env = os.getenv("FIREBASE_CREDENTIALS_PATH", _default_creds)
FIREBASE_CREDENTIALS_PATH = (
    _cred_env
    if os.path.isabs(_cred_env)
    else os.path.normpath(os.path.join(_BACKEND_ROOT, _cred_env.lstrip("./")))
)
MOCK_MODE = not FIREBASE_PROJECT_ID or FIREBASE_PROJECT_ID == "your_firebase_project_id"


def is_mock_mode() -> bool:
    """True when Firestore uses in-memory mock, not real credentials."""
    svc = _default_service
    if svc is not None:
        return svc.is_mock
    return MOCK_MODE


COLLECTIONS = tuple(sorted(ACTIVE_COLLECTIONS))

# Firestore collection names (FirebaseService mock store + legacy helpers)
COL_USERS = "users"
COL_PROVIDERS = "providers"
COL_BOOKINGS = "bookings"
COL_AGENT_LOGS = "agent_logs"
COL_DISPUTES = "disputes"
COL_REVIEWS = "reviews"
COL_WAITLIST = "waitlist"

_BLOCKING_BOOKING_STATUSES = frozenset(
    {
        "assigned",
        "confirmed",
        "on_the_way",
        "arrived",
        "in_progress",
        "en_route",
        "enroute",
    }
)


def _utc_naive(dt: datetime) -> datetime:
    """Normalize to naive UTC for comparisons."""
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _parse_slot_value(data: Dict[str, Any]) -> Optional[datetime]:
    """Resolve slot time from booking dict (Firestore Timestamp, datetime, or ISO/str)."""
    raw = data.get("slot_time")
    if raw is None:
        raw = data.get("scheduled_time")
    if raw is None:
        return None
    if isinstance(raw, datetime):
        return _utc_naive(raw)
    # Firestore Timestamp
    if hasattr(raw, "timestamp") and callable(getattr(raw, "timestamp")):
        try:
            return _utc_naive(datetime.fromtimestamp(raw.timestamp(), tz=timezone.utc))
        except Exception:
            pass
    if isinstance(raw, str):
        s = raw.strip()
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        try:
            if len(s) >= 16 and "T" not in s[:16]:
                return datetime.strptime(s[:16], "%Y-%m-%d %H:%M")
        except ValueError:
            pass
        try:
            dt = datetime.fromisoformat(s[:19] if len(s) >= 19 else s)
            return _utc_naive(dt)
        except ValueError:
            return None
    return None


def _serialize_firestore_value(val: Any) -> Any:
    """Convert Firestore types to JSON-friendly values for agent consumers."""
    if val is None:
        return None
    if isinstance(val, datetime):
        return val.isoformat()
    if hasattr(val, "timestamp") and callable(getattr(val, "timestamp")):
        try:
            return datetime.fromtimestamp(val.timestamp(), tz=timezone.utc).isoformat()
        except Exception:
            return str(val)
    if isinstance(val, dict):
        return {k: _serialize_firestore_value(v) for k, v in val.items()}
    if isinstance(val, list):
        return [_serialize_firestore_value(v) for v in val]
    return val


def _serialize_document(doc_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(data)
    out["id"] = doc_id
    for key, val in list(out.items()):
        out[key] = _serialize_firestore_value(val)
    return out


class FirebaseService:
    """
    Firestore access for Haazir Dost.

    All methods catch errors, log, and return bool / Optional / List without raising
    to callers (integration-friendly).
    """

    def __init__(self, credentials_path: Optional[str] = None) -> None:
        """
        Initialize Firebase Admin SDK and Firestore client.

        Args:
            credentials_path: Path to service account JSON. If ``None``, uses
            ``FIREBASE_CREDENTIALS_PATH`` env or ``config.resolved_credentials_path()``.
        """
        self._mock: bool = True
        self._db: Any = None
        self._credentials_path = credentials_path or ""

        env_path = os.getenv("FIREBASE_CREDENTIALS_PATH", "").strip()
        try:
            from config import config as app_config

            cfg_path = str(app_config.resolved_credentials_path())
        except ImportError:
            cfg_path = ""

        if credentials_path:
            path = credentials_path
        elif env_path:
            path = env_path
        elif cfg_path:
            path = cfg_path
        else:
            path = "firebase-key.json"

        if not os.path.isabs(path):
            path = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", path))

        self._resolved_credentials_path = path

        # In-memory mock stores (collection -> doc_id -> dict)
        self._mock_store: Dict[str, Dict[str, Any]] = {
            COL_USERS: {},
            COL_PROVIDERS: {},
            COL_BOOKINGS: {},
            COL_AGENT_LOGS: {},
            COL_DISPUTES: {},
            COL_REVIEWS: {},
            COL_WAITLIST: {},
            "job_requests": {},
            "bids": {},
        }
        # Slot locks for claim_slot_atomic in mock mode: "provider_id/slug" -> booking_id
        self._mock_slot_claims: Dict[str, str] = {}

        if not os.path.isfile(path):
            logger.warning(
                "❌ Firebase: credentials file not found at %s — using in-memory mock Firestore",
                path,
            )
            return

        try:
            import firebase_admin
            from firebase_admin import credentials, firestore

            if not firebase_admin._apps:
                cred = credentials.Certificate(path)
                firebase_admin.initialize_app(cred)
            self._db = firestore.client()
            self._mock = False
            logger.info("✅ Firebase: Admin SDK initialized (Firestore) — %s", path)
        except Exception as e:
            logger.error("❌ Firebase init failed: %s — mock mode enabled", e)
            self._mock = True
            self._db = None

    @property
    def is_mock(self) -> bool:
        return self._mock

    @property
    def db(self) -> Any:
        """
        Underlying Firestore client (``None`` in mock mode).

        Prefer class methods (``query_providers``, etc.) so behavior matches mock + prod.
        """
        return self._db

    def _collection(self, name: str) -> Any:
        if self._mock:
            return None
        return self._db.collection(name)

    # ── Users ───────────────────────────────────────────────────────────────

    def create_user(self, user_id: str, user_data: Dict[str, Any]) -> bool:
        """Create new user document under ``users/{user_id}``."""
        try:
            payload = {**user_data, "created_at": self._server_timestamp()}
            if self._mock:
                self._mock_store[COL_USERS][user_id] = {**payload, "_id": user_id}
                logger.info("✅ create_user: %s (mock)", user_id)
                return True
            self._collection(COL_USERS).document(user_id).set(payload)
            logger.info("✅ create_user: %s", user_id)
            return True
        except Exception as e:
            logger.error("❌ create_user failed: %s", e)
            return False

    def get_user(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Get user by ID."""
        try:
            if self._mock:
                d = self._mock_store[COL_USERS].get(user_id)
                return dict(d) if d else None
            snap = self._collection(COL_USERS).document(user_id).get()
            if not snap.exists:
                return None
            return _serialize_document(snap.id, snap.to_dict() or {})
        except Exception as e:
            logger.error("❌ get_user failed: %s", e)
            return None

    def update_user(self, user_id: str, updates: Dict[str, Any]) -> bool:
        """Merge-update user fields."""
        try:
            clean = dict(updates)
            if self._mock:
                if user_id not in self._mock_store[COL_USERS]:
                    return False
                self._mock_store[COL_USERS][user_id].update(clean)
                logger.info("✅ update_user: %s", user_id)
                return True
            self._collection(COL_USERS).document(user_id).update(clean)
            logger.info("✅ update_user: %s", user_id)
            return True
        except Exception as e:
            logger.error("❌ update_user failed: %s", e)
            return False

    def add_to_user_booking_history(self, user_id: str, booking_id: str) -> bool:
        """Append ``booking_id`` to user's ``booking_history`` and bump counters."""
        try:
            if self._mock:
                u = self._mock_store[COL_USERS].setdefault(user_id, {"booking_history": [], "total_bookings": 0})
                hist = list(u.get("booking_history") or [])
                if booking_id not in hist:
                    hist.append(booking_id)
                u["booking_history"] = hist
                u["total_bookings"] = int(u.get("total_bookings") or 0) + 1
                logger.info("✅ add_to_user_booking_history: %s + %s (mock)", user_id, booking_id)
                return True
            ref = self._collection(COL_USERS).document(user_id)
            from google.cloud.firestore import ArrayUnion, Increment

            ref.set(
                {
                    "booking_history": ArrayUnion([booking_id]),
                    "total_bookings": Increment(1),
                },
                merge=True,
            )
            logger.info("✅ add_to_user_booking_history: %s + %s", user_id, booking_id)
            return True
        except Exception as e:
            logger.error("❌ add_to_user_booking_history failed: %s", e)
            try:
                u = self.get_user(user_id) or {}
                hist = list(u.get("booking_history") or [])
                if booking_id not in hist:
                    hist.append(booking_id)
                return self.update_user(
                    user_id,
                    {
                        "booking_history": hist,
                        "total_bookings": int(u.get("total_bookings") or 0) + 1,
                    },
                )
            except Exception as e2:
                logger.error("❌ add_to_user_booking_history fallback failed: %s", e2)
                return False

    def delete_user(self, user_id: str) -> bool:
        """Remove user document."""
        try:
            if self._mock:
                self._mock_store[COL_USERS].pop(user_id, None)
                return True
            self._collection(COL_USERS).document(user_id).delete()
            logger.info("✅ delete_user: %s", user_id)
            return True
        except Exception as e:
            logger.error("❌ delete_user failed: %s", e)
            return False

    # ── Providers ───────────────────────────────────────────────────────────

    def get_all_providers(self) -> List[Dict[str, Any]]:
        """Stream all providers (capped for safety)."""
        try:
            if self._mock:
                return [
                    _serialize_document(pid, dict(d))
                    for pid, d in self._mock_store[COL_PROVIDERS].items()
                ]
            out: List[Dict[str, Any]] = []
            for snap in self._collection(COL_PROVIDERS).limit(500).stream():
                out.append(_serialize_document(snap.id, snap.to_dict() or {}))
            logger.info("✅ get_all_providers: count=%s", len(out))
            return out
        except Exception as e:
            logger.error("❌ get_all_providers failed: %s", e)
            return []

    def query_providers(self, service: str, city: str, available: bool = True) -> List[Dict[str, Any]]:
        """
        Find providers matching service + city (+ availability). Max 10 results.

        Service match is case-insensitive substring on ``service`` and common fields.
        """
        try:
            svc = (service or "").lower().strip()
            cty = (city or "").lower().strip()

            def matches(doc: Dict[str, Any]) -> bool:
                if available is not None and bool(doc.get("available")) != bool(available):
                    return False
                p_city = (doc.get("city") or "").lower()
                if cty and cty not in p_city and p_city not in cty:
                    return False
                p_service = (doc.get("service") or "").lower()
                specs = " ".join(str(x).lower() for x in (doc.get("specialization") or []))
                blob = f"{p_service} {specs}"
                if not svc:
                    return True
                return svc in blob or blob in svc or any(w in blob for w in svc.split() if len(w) > 2)

            if self._mock:
                rows = [dict(v) for v in self._mock_store[COL_PROVIDERS].values()]
                filtered = [r for r in rows if matches(r)]
                filtered = filtered[:10]
                logger.info("✅ query_providers (mock): service=%r city=%r n=%s", service, city, len(filtered))
                return [_serialize_document(r.get("_id", r.get("id", "")), r) for r in filtered]

            # Prefer compound filter when indexes exist; fallback filter in Python
            q = self._collection(COL_PROVIDERS).where("city", "==", city).where("available", "==", available)
            try:
                snaps = list(q.limit(30).stream())
            except Exception:
                snaps = list(self._collection(COL_PROVIDERS).where("available", "==", available).limit(50).stream())

            out: List[Dict[str, Any]] = []
            for snap in snaps:
                d = snap.to_dict() or {}
                d["_id"] = snap.id
                if matches(d):
                    out.append(_serialize_document(snap.id, d))
                if len(out) >= 10:
                    break
            logger.info("✅ query_providers: service=%r city=%r n=%s", service, city, len(out))
            return out[:10]
        except Exception as e:
            logger.error("❌ query_providers failed: %s", e)
            return []

    def get_provider(self, provider_id: str) -> Optional[Dict[str, Any]]:
        """Get single provider by document ID."""
        try:
            if self._mock:
                d = self._mock_store[COL_PROVIDERS].get(provider_id)
                return _serialize_document(provider_id, dict(d)) if d else None
            snap = self._collection(COL_PROVIDERS).document(provider_id).get()
            if not snap.exists:
                return None
            return _serialize_document(snap.id, snap.to_dict() or {})
        except Exception as e:
            logger.error("❌ get_provider failed: %s", e)
            return None

    def create_provider(self, provider_id: str, provider_data: Dict[str, Any]) -> bool:
        """Create or replace provider document (CRUD helper)."""
        try:
            payload = {**provider_data, "created_at": self._server_timestamp()}
            if self._mock:
                self._mock_store[COL_PROVIDERS][provider_id] = {**payload, "_id": provider_id}
                logger.info("✅ create_provider: %s (mock)", provider_id)
                return True
            self._collection(COL_PROVIDERS).document(provider_id).set(payload)
            logger.info("✅ create_provider: %s", provider_id)
            return True
        except Exception as e:
            logger.error("❌ create_provider failed: %s", e)
            return False

    def update_provider_availability(self, provider_id: str, available: bool) -> bool:
        """Set provider ``available`` flag."""
        try:
            if self._mock:
                if provider_id not in self._mock_store[COL_PROVIDERS]:
                    return False
                self._mock_store[COL_PROVIDERS][provider_id]["available"] = available
                logger.info("✅ update_provider_availability: %s -> %s", provider_id, available)
                return True
            self._collection(COL_PROVIDERS).document(provider_id).update({"available": available})
            logger.info("✅ update_provider_availability: %s -> %s", provider_id, available)
            return True
        except Exception as e:
            logger.error("❌ update_provider_availability failed: %s", e)
            return False

    def update_provider_bookings(self, provider_id: str, increment: int = 1) -> bool:
        """Atomically adjust ``current_bookings`` (Increment when possible)."""
        try:
            if self._mock:
                p = self._mock_store[COL_PROVIDERS].setdefault(provider_id, {"current_bookings": 0})
                p["current_bookings"] = max(0, int(p.get("current_bookings") or 0) + increment)
                logger.info("✅ update_provider_bookings: %s %+d (mock)", provider_id, increment)
                return True
            ref = self._collection(COL_PROVIDERS).document(provider_id)
            try:
                from google.cloud.firestore import Increment

                ref.update({"current_bookings": Increment(increment)})
            except Exception:
                snap = ref.get()
                cur = (snap.to_dict() or {}).get("current_bookings", 0)
                ref.update({"current_bookings": max(0, int(cur) + increment)})
            logger.info("✅ update_provider_bookings: %s %+d", provider_id, increment)
            return True
        except Exception as e:
            logger.error("❌ update_provider_bookings failed: %s", e)
            return False

    def update_provider_rating(self, provider_id: str, new_rating: float) -> bool:
        """Update aggregate rating after feedback (running average if counts exist)."""
        try:
            snap_dict: Dict[str, Any] = {}
            if self._mock:
                snap_dict = dict(self._mock_store[COL_PROVIDERS].get(provider_id) or {})
            else:
                snap = self._collection(COL_PROVIDERS).document(provider_id).get()
                snap_dict = snap.to_dict() or {}
            old = float(snap_dict.get("rating") or 0.0)
            n = int(snap_dict.get("review_count") or len(snap_dict.get("reviews") or []) or 0)
            if n <= 0:
                avg = float(new_rating)
                n_out = 1
            else:
                avg = (old * n + float(new_rating)) / (n + 1)
                n_out = n + 1
            updates = {"rating": round(avg, 2), "review_count": n_out}
            if self._mock:
                if provider_id not in self._mock_store[COL_PROVIDERS]:
                    return False
                self._mock_store[COL_PROVIDERS][provider_id].update(updates)
                return True
            self._collection(COL_PROVIDERS).document(provider_id).update(updates)
            logger.info("✅ update_provider_rating: %s -> %.2f", provider_id, avg)
            return True
        except Exception as e:
            logger.error("❌ update_provider_rating failed: %s", e)
            return False

    # ── Bookings ────────────────────────────────────────────────────────────

    def create_booking(self, booking_data: Dict[str, Any]) -> bool:
        """
        Create booking document ``bookings/{booking_id}``.

        Accepts ``slot_time`` (datetime) and/or ``scheduled_time`` (``%%Y-%%m-%%d %%H:%%M``) from Pakka.
        """
        try:
            bid = booking_data.get("booking_id") or f"HAZ-{datetime.now().strftime('%Y%m%d')}-{str(uuid.uuid4())[:6].upper()}"
            slot_dt: Optional[datetime] = booking_data.get("slot_time")  # type: ignore[assignment]
            if slot_dt is None and booking_data.get("scheduled_time"):
                try:
                    slot_dt = datetime.strptime(str(booking_data["scheduled_time"])[:16], "%Y-%m-%d %H:%M")
                except ValueError:
                    slot_dt = None

            payload: Dict[str, Any] = {
                "booking_id": bid,
                "user_id": booking_data.get("user_id", ""),
                "provider_id": booking_data.get("provider_id", ""),
                "service": booking_data.get("service", ""),
                "location": booking_data.get("location", ""),
                "slot_time": slot_dt or booking_data.get("scheduled_time"),
                "scheduled_time": booking_data.get("scheduled_time") or (
                    slot_dt.strftime("%Y-%m-%d %H:%M") if slot_dt else ""
                ),
                "price": booking_data.get("price", 0),
                "status": booking_data.get("status", "confirmed"),
                "created_at": self._server_timestamp(),
                "completed_at": booking_data.get("completed_at"),
                "rating": booking_data.get("rating"),
                "review": booking_data.get("review"),
                "photos": booking_data.get("photos") or [],
                "dispute": booking_data.get("dispute", False),
                "dispute_id": booking_data.get("dispute_id"),
                "reminder_sent": booking_data.get("reminder_sent") or [False, False],
                "emergency": booking_data.get("emergency", False),
            }
            if self._mock:
                self._mock_store[COL_BOOKINGS][bid] = dict(payload)
                logger.info("✅ create_booking: %s (mock)", bid)
                return True
            self._collection(COL_BOOKINGS).document(bid).set(payload)
            logger.info("✅ create_booking: %s", bid)
            return True
        except Exception as e:
            logger.error("❌ create_booking failed: %s", e)
            return False

    def get_booking(self, booking_id: str) -> Optional[Dict[str, Any]]:
        """Return booking dict with string-friendly timestamps."""
        try:
            if self._mock:
                d = self._mock_store[COL_BOOKINGS].get(booking_id)
                return _serialize_document(booking_id, dict(d)) if d else None
            snap = self._collection(COL_BOOKINGS).document(booking_id).get()
            if not snap.exists:
                return None
            return _serialize_document(snap.id, snap.to_dict() or {})
        except Exception as e:
            logger.error("❌ get_booking failed: %s", e)
            return None

    def update_booking_status(self, booking_id: str, status: str) -> bool:
        """Update booking status (confirmed / en_route / completed / cancelled, etc.)."""
        try:
            updates: Dict[str, Any] = {"status": status}
            if status == "completed":
                updates["completed_at"] = self._server_timestamp()
            if self._mock:
                if booking_id not in self._mock_store[COL_BOOKINGS]:
                    return False
                self._mock_store[COL_BOOKINGS][booking_id].update(updates)
                logger.info("✅ update_booking_status: %s -> %s (mock)", booking_id, status)
                return True
            self._collection(COL_BOOKINGS).document(booking_id).update(updates)
            logger.info("✅ update_booking_status: %s -> %s", booking_id, status)
            return True
        except Exception as e:
            logger.error("❌ update_booking_status failed: %s", e)
            return False

    def add_booking_rating(self, booking_id: str, rating: int, review: str) -> bool:
        """Attach customer ``rating`` and ``review`` to booking."""
        try:
            updates = {"rating": rating, "review": review or ""}
            if self._mock:
                if booking_id not in self._mock_store[COL_BOOKINGS]:
                    return False
                self._mock_store[COL_BOOKINGS][booking_id].update(updates)
                logger.info("✅ add_booking_rating: %s (mock)", booking_id)
                return True
            self._collection(COL_BOOKINGS).document(booking_id).update(updates)
            logger.info("✅ add_booking_rating: %s", booking_id)
            return True
        except Exception as e:
            logger.error("❌ add_booking_rating failed: %s", e)
            return False

    def check_double_booking(self, provider_id: str, slot_time: datetime, buffer_minutes: int = 60) -> bool:
        """
        Return True if the slot is FREE (no conflicting booking), False if BOOKED or on error.

        Conflicts: same ``provider_id`` with status in blocking set and slot within ``buffer_minutes``.
        """
        try:
            req = _utc_naive(slot_time)
            threshold_sec = max(1, int(buffer_minutes) * 60)

            def is_conflict(other: datetime) -> bool:
                o = _utc_naive(other)
                return abs((o - req).total_seconds()) < threshold_sec

            if self._mock:
                for b in self._mock_store[COL_BOOKINGS].values():
                    if b.get("provider_id") != provider_id:
                        continue
                    st = (b.get("status") or "").lower()
                    if st not in _BLOCKING_BOOKING_STATUSES:
                        continue
                    ot = _parse_slot_value(b)
                    if ot and is_conflict(ot):
                        logger.info(
                            "check_double_booking: busy provider=%s near %s",
                            provider_id,
                            req.isoformat(),
                        )
                        return False
                return True

            docs = self._collection(COL_BOOKINGS).where("provider_id", "==", provider_id).limit(50).stream()
            for snap in docs:
                data = snap.to_dict() or {}
                st = (data.get("status") or "").lower()
                if st not in _BLOCKING_BOOKING_STATUSES:
                    continue
                ot = _parse_slot_value(data)
                if ot and is_conflict(ot):
                    return False
            return True
        except Exception as e:
            logger.error("❌ check_double_booking failed: %s — treating as BOOKED", e)
            return False

    def get_user_bookings(self, user_id: str) -> List[Dict[str, Any]]:
        """All bookings for a user (ordered client-side by slot)."""
        try:
            if self._mock:
                rows = [dict(b) for b in self._mock_store[COL_BOOKINGS].values() if b.get("user_id") == user_id]
            else:
                rows = [
                    _serialize_document(snap.id, snap.to_dict() or {})
                    for snap in self._collection(COL_BOOKINGS).where("user_id", "==", user_id).stream()
                ]
                logger.info("✅ get_user_bookings: user=%s n=%s", user_id, len(rows))
                return rows
            out = [_serialize_document(b.get("booking_id", ""), b) for b in rows]
            logger.info("✅ get_user_bookings: user=%s n=%s (mock)", user_id, len(out))
            return out
        except Exception as e:
            logger.error("❌ get_user_bookings failed: %s", e)
            return []

    def get_provider_bookings(self, provider_id: str) -> List[Dict[str, Any]]:
        """Bookings for provider (confirmed-focused consumers may filter client-side)."""
        try:
            if self._mock:
                rows = [dict(b) for b in self._mock_store[COL_BOOKINGS].values() if b.get("provider_id") == provider_id]
                return [_serialize_document(b.get("booking_id", ""), b) for b in rows]
            rows = [
                _serialize_document(snap.id, snap.to_dict() or {})
                for snap in self._collection(COL_BOOKINGS).where("provider_id", "==", provider_id).stream()
            ]
            logger.info("✅ get_provider_bookings: provider=%s n=%s", provider_id, len(rows))
            return rows
        except Exception as e:
            logger.error("❌ get_provider_bookings failed: %s", e)
            return []

    def delete_booking(self, booking_id: str) -> bool:
        try:
            if self._mock:
                self._mock_store[COL_BOOKINGS].pop(booking_id, None)
                return True
            self._collection(COL_BOOKINGS).document(booking_id).delete()
            logger.info("✅ delete_booking: %s", booking_id)
            return True
        except Exception as e:
            logger.error("❌ delete_booking failed: %s", e)
            return False

    # ── Agent logs ───────────────────────────────────────────────────────────

    def save_agent_logs(self, request_id: str, logs_data: Dict[str, Any]) -> bool:
        """Persist trace payload under ``agent_logs/{request_id}`` (merge-safe)."""
        try:
            payload = {
                "request_id": request_id,
                "timestamp": self._server_timestamp(),
                **logs_data,
            }
            if self._mock:
                existing = dict(self._mock_store[COL_AGENT_LOGS].get(request_id) or {})
                merged = {**existing, **payload}
                self._mock_store[COL_AGENT_LOGS][request_id] = merged
                logger.info("✅ save_agent_logs: %s (mock)", request_id)
                return True
            self._collection(COL_AGENT_LOGS).document(request_id).set(payload, merge=True)
            logger.info("✅ save_agent_logs: %s", request_id)
            return True
        except Exception as e:
            logger.error("❌ save_agent_logs failed: %s", e)
            return False

    def get_agent_logs(self, request_id: str) -> Optional[Dict[str, Any]]:
        """Fetch stored agent log bundle."""
        try:
            if self._mock:
                d = self._mock_store[COL_AGENT_LOGS].get(request_id)
                return _serialize_document(request_id, dict(d)) if d else None
            snap = self._collection(COL_AGENT_LOGS).document(request_id).get()
            if not snap.exists:
                return None
            return _serialize_document(snap.id, snap.to_dict() or {})
        except Exception as e:
            logger.error("❌ get_agent_logs failed: %s", e)
            return None

    def delete_agent_logs(self, request_id: str) -> bool:
        try:
            if self._mock:
                self._mock_store[COL_AGENT_LOGS].pop(request_id, None)
                return True
            self._collection(COL_AGENT_LOGS).document(request_id).delete()
            return True
        except Exception as e:
            logger.error("❌ delete_agent_logs failed: %s", e)
            return False

    # ── Disputes ─────────────────────────────────────────────────────────────

    def create_dispute(self, dispute_data: Dict[str, Any]) -> bool:
        """Create dispute document; generates ``dispute_id`` if missing."""
        try:
            did = dispute_data.get("dispute_id") or f"DSP-{str(uuid.uuid4())[:8].upper()}"
            payload = {
                **dispute_data,
                "dispute_id": did,
                "status": dispute_data.get("status", "open"),
                "created_at": self._server_timestamp(),
            }
            if self._mock:
                self._mock_store[COL_DISPUTES][did] = dict(payload)
                logger.info("✅ create_dispute: %s (mock)", did)
                return True
            self._collection(COL_DISPUTES).document(did).set(payload)
            logger.info("✅ create_dispute: %s", did)
            return True
        except Exception as e:
            logger.error("❌ create_dispute failed: %s", e)
            return False

    def resolve_dispute(self, dispute_id: str, resolution: Dict[str, Any]) -> bool:
        """Merge resolution fields and mark resolved timestamp."""
        try:
            updates = {
                **resolution,
                "resolved_at": self._server_timestamp(),
                "status": resolution.get("status", "resolved"),
            }
            if self._mock:
                if dispute_id not in self._mock_store[COL_DISPUTES]:
                    return False
                self._mock_store[COL_DISPUTES][dispute_id].update(updates)
                logger.info("✅ resolve_dispute: %s (mock)", dispute_id)
                return True
            self._collection(COL_DISPUTES).document(dispute_id).update(updates)
            logger.info("✅ resolve_dispute: %s", dispute_id)
            return True
        except Exception as e:
            logger.error("❌ resolve_dispute failed: %s", e)
            return False

    def get_dispute(self, dispute_id: str) -> Optional[Dict[str, Any]]:
        try:
            if self._mock:
                d = self._mock_store[COL_DISPUTES].get(dispute_id)
                return dict(d) if d else None
            snap = self._collection(COL_DISPUTES).document(dispute_id).get()
            if not snap.exists:
                return None
            return _serialize_document(snap.id, snap.to_dict() or {})
        except Exception as e:
            logger.error("❌ get_dispute failed: %s", e)
            return None

    # ── Reviews (legacy feedback endpoint) ───────────────────────────────────

    def save_review_document(self, data: Dict[str, Any]) -> str:
        """Store structured review; returns review_id (legacy /api/feedback)."""
        review_id = str(uuid.uuid4())
        try:
            payload = {**data, "review_id": review_id, "created_at": self._server_timestamp()}
            if self._mock:
                self._mock_store[COL_REVIEWS][review_id] = payload
                logger.info("✅ save_review_document: %s (mock)", review_id)
                return review_id
            self._collection(COL_REVIEWS).document(review_id).set(payload)
            logger.info("✅ save_review_document: %s", review_id)
            return review_id
        except Exception as e:
            logger.error("❌ save_review_document failed: %s", e)
            return review_id

    def save_waitlist_entry(self, data: Dict[str, Any]) -> str:
        """Optional waitlist collection."""
        wid = str(uuid.uuid4())
        try:
            payload = {**data, "waitlist_id": wid, "created_at": self._server_timestamp()}
            if self._mock:
                self._mock_store[COL_WAITLIST][wid] = payload
                return wid
            self._collection(COL_WAITLIST).document(wid).set(payload)
            return wid
        except Exception as e:
            logger.error("❌ save_waitlist_entry failed: %s", e)
            return wid

    # ── Internals ───────────────────────────────────────────────────────────

    def _server_timestamp(self) -> Any:
        if self._mock:
            return datetime.now(timezone.utc).isoformat()
        from firebase_admin import firestore

        return firestore.SERVER_TIMESTAMP


# ── Module-level Firestore helpers (async API + schema-normalized writes) ─────

_mock_db: Dict[str, Dict[str, Any]] = {name: {} for name in ACTIVE_COLLECTIONS}
_mock_db["reviews"] = {}
_mock_db["waitlist"] = {}
_mock_db.setdefault("job_requests", {})
_mock_db.setdefault("bids", {})


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_booking_id() -> str:
    return f"HAZ-{datetime.now().strftime('%Y%m%d')}-{str(uuid.uuid4())[:6].upper()}"


def _mock_bucket(collection: str) -> Dict[str, Any]:
    """In-memory bucket; prefers FirebaseService._mock_store when singleton is mock."""
    try:
        svc = get_firebase_service()
        if svc.is_mock:
            if collection not in svc._mock_store:
                svc._mock_store[collection] = {}
            return svc._mock_store[collection]
    except Exception:
        pass
    if collection not in _mock_db:
        _mock_db[collection] = {}
    return _mock_db[collection]


def _doc_set(collection: str, doc_id: str, data: dict, merge: bool = False) -> None:
    if collection not in ACTIVE_COLLECTIONS and collection not in ("reviews", "waitlist"):
        raise ValueError(f"Collection '{collection}' is not in the active Firestore schema")
    svc = get_firebase_service()
    if svc.is_mock or MOCK_MODE:
        bucket = _mock_bucket(collection)
        if merge:
            bucket[doc_id] = {**bucket.get(doc_id, {}), **data}
        else:
            bucket[doc_id] = {**data}
        return
    db = svc.db
    if db is None:
        bucket = _mock_bucket(collection)
        bucket[doc_id] = {**bucket.get(doc_id, {}), **data} if merge else {**data}
        return
    ref = db.collection(collection).document(doc_id)
    if merge:
        ref.set(data, merge=True)
    else:
        ref.set(data)


def _doc_get(collection: str, doc_id: str) -> Optional[dict]:
    svc = get_firebase_service()
    if svc.is_mock or MOCK_MODE:
        return _mock_bucket(collection).get(doc_id)
    db = svc.db
    if db is None:
        return _mock_bucket(collection).get(doc_id)
    snap = db.collection(collection).document(doc_id).get()
    if not snap.exists:
        return None
    out = dict(snap.to_dict() or {})
    out["id"] = snap.id
    return out


def _doc_update(collection: str, doc_id: str, data: dict) -> bool:
    existing = _doc_get(collection, doc_id) or {}
    _doc_set(collection, doc_id, {**existing, **data}, merge=True)
    return True


def _doc_delete(collection: str, doc_id: str) -> bool:
    svc = get_firebase_service()
    if svc.is_mock or MOCK_MODE:
        _mock_bucket(collection).pop(doc_id, None)
        return True
    db = svc.db
    if db is None:
        return False
    db.collection(collection).document(doc_id).delete()
    return True


def _query_all(collection: str) -> List[dict]:
    svc = get_firebase_service()
    if svc.is_mock or MOCK_MODE:
        return list(_mock_bucket(collection).values())
    db = svc.db
    if db is None:
        return []
    return [
        {**(snap.to_dict() or {}), "id": snap.id}
        for snap in db.collection(collection).stream()
    ]


def _get_db() -> Any:
    """Firestore client from the process singleton (``None`` in mock mode)."""
    return get_firebase_service().db


# ═══════════════════════════════════════════════════════════════════════════
# Module singleton + async wrappers (Pakka / Dhundho / main / agents)
# ═══════════════════════════════════════════════════════════════════════════

_default_service: Optional[FirebaseService] = None


def get_firebase_service() -> FirebaseService:
    """Lazily construct default ``FirebaseService`` (uses ``config`` / env paths)."""
    global _default_service
    if _default_service is None:
        _default_service = FirebaseService(None)
    return _default_service


def set_firebase_service(svc: FirebaseService) -> None:
    """Bind the process-wide singleton (call from ``main`` after constructing ``FirebaseService``)."""
    global _default_service
    _default_service = svc


def reset_firebase_service_for_tests() -> None:
    """Test helper: clear singleton."""
    global _default_service
    _default_service = None


def is_mock_mode() -> bool:
    """Whether the active Firebase service is using the in-memory mock store."""
    return get_firebase_service().is_mock


# --- Legacy async API (unchanged signatures for callers) --------------------

async def save_booking(data: dict) -> str:
    """Persist booking; returns ``booking_id``."""
    svc = get_firebase_service()
    bid = data.get("booking_id") or f"HAZ-{datetime.now().strftime('%Y%m%d')}-{str(uuid.uuid4())[:6].upper()}"
    payload = {**data, "booking_id": bid}
    ok = await asyncio.to_thread(svc.create_booking, payload)
    return bid if ok else bid


async def get_booking(booking_id: str) -> Optional[dict]:
    svc = get_firebase_service()
    return await asyncio.to_thread(svc.get_booking, booking_id)


async def list_booking_entries() -> List[tuple]:
    """Return (document_id, data) for every bookings/{booking_id} doc."""
    if get_firebase_service().is_mock:
        return list(_mock_bucket("bookings").items())
    db = _get_db()
    if db is None:
        return []
    return [
        (snap.id, snap.to_dict() or {})
        for snap in db.collection("bookings").stream()
    ]


async def get_provider_bookings(provider_id: str) -> list:
    svc = get_firebase_service()
    return await asyncio.to_thread(svc.get_provider_bookings, provider_id)


def _scheduled_time_slug(scheduled_time: str) -> str:
    return scheduled_time.replace(" ", "_").replace(":", "-")


async def claim_slot_atomic(provider_id: str, scheduled_time: str, booking_data: dict) -> bool:
    """
    Atomically checks slot availability and writes booking if free.
    Returns True if the slot was successfully claimed, False if already taken.
    Uses a Firestore transaction on doc path:
      slots/{provider_id}/times/{scheduled_time_slug}
    where scheduled_time_slug = scheduled_time.replace(' ', '_').replace(':', '-')
    """
    slug = _scheduled_time_slug(scheduled_time)
    svc = get_firebase_service()
    bid = booking_data.get("booking_id") or f"HAZ-{datetime.now().strftime('%Y%m%d')}-{str(uuid.uuid4())[:6].upper()}"
    payload = {**booking_data, "booking_id": bid}

    if svc.is_mock:
        conflict = await check_slot_conflict(provider_id, scheduled_time)
        if conflict:
            return False
        lock_key = f"{provider_id}/{slug}"
        if lock_key in svc._mock_slot_claims:
            return False
        svc._mock_slot_claims[lock_key] = bid
        ok = await save_booking(payload)
        return bool(ok)

    try:
        from firebase_admin import firestore

        db = svc.db
        slot_ref = db.collection("slots").document(provider_id).collection("times").document(slug)
        booking_ref = db.collection(COL_BOOKINGS).document(bid)

        @firestore.transactional
        def _txn(transaction: Any) -> bool:
            snap = slot_ref.get(transaction=transaction)
            if snap.exists:
                return False
            transaction.set(
                slot_ref,
                {
                    "provider_id": provider_id,
                    "scheduled_time": scheduled_time,
                    "booking_id": bid,
                    "claimed_at": firestore.SERVER_TIMESTAMP,
                },
            )
            slot_dt: Optional[datetime] = None
            try:
                slot_dt = datetime.strptime(scheduled_time[:16], "%Y-%m-%d %H:%M")
            except ValueError:
                pass
            doc_payload: Dict[str, Any] = {
                "booking_id": bid,
                "user_id": payload.get("user_id", ""),
                "provider_id": provider_id,
                "service": payload.get("service", ""),
                "location": payload.get("location", ""),
                "slot_time": slot_dt or scheduled_time,
                "scheduled_time": scheduled_time,
                "price": payload.get("price", 0),
                "status": payload.get("status", "confirmed"),
                "created_at": firestore.SERVER_TIMESTAMP,
                "emergency": payload.get("emergency", False),
                "notification": payload.get("notification"),
                "travel_buffer_minutes": payload.get("travel_buffer_minutes"),
            }
            transaction.set(booking_ref, doc_payload)
            return True

        claimed = await asyncio.to_thread(_txn, db.transaction())
        if claimed:
            logger.info(
                "claim_slot_atomic: claimed provider=%s slot=%s booking=%s",
                provider_id,
                scheduled_time,
                bid,
            )
        return bool(claimed)
    except Exception as e:
        logger.error("claim_slot_atomic failed: %s — treating as not claimed", e)
        return False


async def check_slot_conflict(provider_id: str, scheduled_time: str) -> bool:
    """
    Legacy Dhundho/Pakka: **True** if provider already has a blocking booking at this slot.

    Uses ``check_double_booking`` (True = free) inverted, with a 60-minute buffer.
    """
    try:
        dt = datetime.strptime(scheduled_time[:16], "%Y-%m-%d %H:%M")
    except ValueError:
        logger.error("❌ check_slot_conflict: bad time format %r", scheduled_time)
        return False
    svc = get_firebase_service()
    free = await asyncio.to_thread(svc.check_double_booking, provider_id, dt, 60)
    conflict = not free
    if conflict:
        logger.info("✅ check_slot_conflict: conflict provider=%s @ %s", provider_id, scheduled_time)
    return conflict


async def update_booking_status(booking_id: str, status: str) -> None:
    svc = get_firebase_service()
    await asyncio.to_thread(svc.update_booking_status, booking_id, status)


async def save_review(data: dict) -> str:
    svc = get_firebase_service()
    return await asyncio.to_thread(svc.save_review_document, data)
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
    svc = get_firebase_service()

    if provider_id:
        rows = await asyncio.to_thread(svc.get_provider_bookings, provider_id)
        if user_id:
            rows = [b for b in rows if b.get("user_id") == user_id]
    elif user_id:
        # Query all bookings and filter by user_id (no provider filter)
        def _query_user_bookings():
            if svc.is_mock or MOCK_MODE:
                return [
                    b for b in _mock_bucket("bookings").values()
                    if b.get("user_id") == user_id
                ]
            db = svc.db
            if db is None:
                return [
                    b for b in _mock_bucket("bookings").values()
                    if b.get("user_id") == user_id
                ]
            return [
                {**(snap.to_dict() or {}), "booking_id": snap.id, "id": snap.id}
                for snap in db.collection("bookings")
                .where("user_id", "==", user_id)
                .limit(50)
                .stream()
            ]
        rows = await asyncio.to_thread(_query_user_bookings)
    else:
        rows = []

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
    if get_firebase_service().is_mock:
        return list(_mock_bucket("users").items())
    db = _get_db()
    if db is None:
        return []
    return [
        (snap.id, snap.to_dict() or {})
        for snap in db.collection("users").stream()
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
        merged.setdefault("dispute_history", [])
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
    if get_firebase_service().is_mock:
        return list(_mock_bucket("providers").items())
    db = _get_db()
    if db is None:
        return []
    return [
        (snap.id, snap.to_dict() or {})
        for snap in db.collection("providers").stream()
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
        "mock_mode": is_mock_mode(),
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
    if not is_mock_mode():
        try:
            for coll_ref in _get_db().collections():
                if coll_ref.id in ("workers", "worker", "worker_profiles"):
                    extra_worker_collection.append(coll_ref.id)
        except Exception as exc:
            extra_worker_collection.append(f"(list failed: {exc})")

    return {
        "mock_mode": is_mock_mode(),
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


async def append_user_dispute(user_id: str, dispute_id: str) -> None:
    """Append ``dispute_id`` to users/{uid}.dispute_history (repeat filings allowed)."""
    uid = require_firebase_uid(user_id)
    did = (dispute_id or "").strip()
    if not did:
        return
    user = await get_user(uid)
    if not user:
        return
    history = list(user.get("dispute_history") or [])
    if did not in history:
        history.append(did)
    await update_user(uid, {"dispute_history": history})


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


async def repair_dispute_user_ids() -> Dict[str, Any]:
    """Backfill disputes/{id}.user_id from the linked booking owner."""
    from services.users_integrity import is_plausible_firebase_uid

    bookings_by_id = {doc_id: data for doc_id, data in await list_booking_entries()}
    patched: List[str] = []
    for doc_id, data in await list_dispute_entries():
        data = data or {}
        if (data.get("user_id") or "").strip():
            continue
        bid = (data.get("booking_id") or "").strip()
        booking = bookings_by_id.get(bid) or {}
        uid = (booking.get("user_id") or "").strip()
        if uid and is_plausible_firebase_uid(uid):
            _doc_update("disputes", doc_id, {"user_id": uid, "updated_at": _now_iso()})
            patched.append(doc_id)
    return {"disputes_user_id_patched": len(patched), "dispute_ids": patched}


async def repair_all_dispute_history() -> Dict[str, Any]:
    """Rebuild users/{uid}.dispute_history from disputes collection."""
    from services.users_integrity import is_plausible_firebase_uid

    user_id_result = await repair_dispute_user_ids()
    bookings_by_id = {doc_id: data for doc_id, data in await list_booking_entries()}
    by_user: Dict[str, List[str]] = {}
    for doc_id, data in await list_dispute_entries():
        data = data or {}
        uid = (data.get("user_id") or "").strip()
        if not uid:
            bid = (data.get("booking_id") or "").strip()
            booking = bookings_by_id.get(bid) or {}
            uid = (booking.get("user_id") or "").strip()
        if not uid or not is_plausible_firebase_uid(uid):
            continue
        by_user.setdefault(uid, []).append(doc_id)

    updated: List[str] = []
    for uid, dispute_ids in by_user.items():
        user = await get_user(uid)
        if not user:
            continue
        merged = list(user.get("dispute_history") or [])
        for did in dispute_ids:
            if did not in merged:
                merged.append(did)
        await update_user(uid, {"dispute_history": merged})
        updated.append(uid)

    return {
        **user_id_result,
        "users_updated": len(updated),
        "user_ids": updated,
    }


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
        "mock_mode": is_mock_mode(),
        "allowed_statuses": list(BOOKING_STATUSES),
        "status_aliases": {"enroute": "on_the_way", "en_route": "on_the_way"},
        **audit,
    }


async def delete_user(user_id: str) -> bool:
    return _doc_delete("users", user_id)


# ─── Disputes ────────────────────────────────────────────────────────────────


async def list_dispute_entries() -> List[tuple]:
    """Return (document_id, data) for every disputes/{dispute_id} doc."""
    if get_firebase_service().is_mock:
        return list(_mock_bucket("disputes").items())
    db = _get_db()
    if db is None:
        return []
    return [
        (snap.id, snap.to_dict() or {})
        for snap in db.collection("disputes").stream()
    ]


async def create_dispute(data: dict) -> str:
    dispute_id = data.get("dispute_id") or str(uuid.uuid4())
    payload = normalize_dispute(
        {**data, "created_at": data.get("created_at", _now_iso())},
        dispute_id=dispute_id,
    )
    if not (payload.get("user_id") or "").strip():
        bid = (payload.get("booking_id") or (data.get("booking_id") or "")).strip()
        if bid:
            booking = await get_booking(bid)
            booking_uid = ((booking or {}).get("user_id") or "").strip()
            if booking_uid:
                payload["user_id"] = require_firebase_uid(booking_uid)
    if not (payload.get("user_id") or "").strip():
        raise ValueError("Cannot create dispute without user_id (Firebase Auth UID)")
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
    """Merge *data* into an existing dispute without clearing omitted fields."""
    clean = {k: v for k, v in (data or {}).items() if v is not None and v != ""}
    if not clean:
        return False
    existing = await get_dispute(dispute_id) or {}
    merged = normalize_dispute({**existing, **clean}, dispute_id=dispute_id)
    patch = {k: v for k, v in merged.items() if v != "" or k in clean}
    patch["updated_at"] = _now_iso()
    return _doc_update("disputes", dispute_id, patch)


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
        "mock_mode": is_mock_mode(),
        **audit,
    }


# ─── Agent logs ──────────────────────────────────────────────────────────────


async def list_agent_log_entries() -> List[tuple]:
    """Return (document_id, data) for every agent_logs/{request_id} doc."""
    if get_firebase_service().is_mock:
        return list(_mock_bucket("agent_logs").items())
    db = _get_db()
    if db is None:
        return []
    return [
        (snap.id, snap.to_dict() or {})
        for snap in db.collection("agent_logs").stream()
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
        "mock_mode": is_mock_mode(),
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
    if get_firebase_service().is_mock:
        return list(_mock_bucket("notifications").items())
    db = _get_db()
    if db is None:
        return []
    return [
        (snap.id, snap.to_dict() or {})
        for snap in db.collection("notifications").stream()
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
        "mock_mode": is_mock_mode(),
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
                "title": "Booking reminder",
                "message": message_template.format(booking_id=booking_id),
                "event_type": "reminder",
                "role": "customer",
                "sent": False,
            }
        )
        ids.append(nid)
    return ids


# Legacy alias
async def add_to_waitlist(data: dict) -> str:
    svc = get_firebase_service()
    return await asyncio.to_thread(svc.save_waitlist_entry, data)
    return await create_notification(
        {**data, "message": data.get("message", "Waitlist"), "sent": False}
    )


async def migrate_reviews_to_bookings() -> Dict[str, Any]:
    """Move legacy reviews/{id} docs onto bookings/{booking_id} and delete review docs."""
    migrated = 0
    skipped = 0
    errors: List[str] = []

    if is_mock_mode():
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

    coll = _get_db().collection("reviews")
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

    if is_mock_mode():
        for name, bucket in _mock_db.items():
            if name in ACTIVE_COLLECTIONS:
                store[name] = dict(bucket)
            else:
                extra_root.append(name)
    else:
        for coll in COLLECTIONS:
            for snap in _get_db().collection(coll).stream():
                store[coll][snap.id] = snap.to_dict() or {}
        try:
            for coll_ref in _get_db().collections():
                if coll_ref.id not in ACTIVE_COLLECTIONS:
                    extra_root.append(coll_ref.id)
        except Exception as exc:
            extra_root.append(f"(list failed: {exc})")

    audit = audit_store(store)
    return {
        "mock_mode": is_mock_mode(),
        "project_id": FIREBASE_PROJECT_ID or None,
        "active_collections": list(COLLECTIONS),
        **audit,
        "extra_root_collections": extra_root,
        "ok": audit["issue_count"] == 0 and not extra_root,
    }


# ── Job Requests ──────────────────────────────────────────────────────────────

async def save_job_request(request_id: str, data: dict) -> bool:
    from services.firestore_schema import normalize_job_request
    doc = normalize_job_request(data, request_id)
    await asyncio.to_thread(_doc_set, "job_requests", request_id, doc)
    return True


async def get_job_request(request_id: str) -> Optional[dict]:
    return await asyncio.to_thread(_doc_get, "job_requests", request_id)


async def update_job_request(request_id: str, data: dict) -> bool:
    return await asyncio.to_thread(_doc_update, "job_requests", request_id, data)


def _svc_match(job_service: str, filter_service: str) -> bool:
    """Flexible service match: AC technician ↔ AC Repair both share 'ac' → match."""
    if not filter_service:
        return True
    j = (job_service or "").lower().strip()
    f = filter_service.lower().strip()
    if not j:
        return False
    # Direct substring check in both directions
    if f in j or j in f:
        return True
    # Word-overlap: {"ac","technician"} ∩ {"ac","repair"} = {"ac"} → match
    return bool(set(j.split()) & set(f.split()))


async def list_open_job_requests(service: str = "", city: str = "") -> List[dict]:
    """Return open job_requests optionally filtered by service/city (flexible match)."""
    svc = get_firebase_service()

    def _query():
        if svc.is_mock or MOCK_MODE:
            bucket = _mock_bucket("job_requests")
            docs = list(bucket.values())
        else:
            db = svc.db
            if db is None:
                bucket = _mock_bucket("job_requests")
                docs = list(bucket.values())
            else:
                q = db.collection("job_requests").where("status", "in", ["open", "bidding"])
                docs = [dict(s.to_dict() or {}) | {"request_id": s.id} for s in q.stream()]
        out = []
        for d in docs:
            if d.get("status") not in ("open", "bidding"):
                continue
            if city and (d.get("city") or "").lower() != city.lower():
                continue
            if not _svc_match(d.get("service", ""), service):
                continue
            out.append(d)
        out.sort(key=lambda x: x.get("created_at", ""), reverse=True)
        return out

    return await asyncio.to_thread(_query)


# ── Bids ──────────────────────────────────────────────────────────────────────

async def save_bid(bid_id: str, data: dict) -> bool:
    from services.firestore_schema import normalize_bid
    doc = normalize_bid(data, bid_id)
    await asyncio.to_thread(_doc_set, "bids", bid_id, doc)
    return True


async def get_bid(bid_id: str) -> Optional[dict]:
    return await asyncio.to_thread(_doc_get, "bids", bid_id)


async def update_bid(bid_id: str, data: dict) -> bool:
    return await asyncio.to_thread(_doc_update, "bids", bid_id, data)


async def list_bids_for_job(job_request_id: str) -> List[dict]:
    """All bids for a given job_request_id, sorted newest first."""
    svc = get_firebase_service()

    def _query():
        if svc.is_mock or MOCK_MODE:
            bucket = _mock_bucket("bids")
            docs = [v for v in bucket.values()
                    if v.get("job_request_id") == job_request_id]
        else:
            db = svc.db
            if db is None:
                bucket = _mock_bucket("bids")
                docs = [v for v in bucket.values()
                        if v.get("job_request_id") == job_request_id]
            else:
                docs = [
                    dict(s.to_dict() or {}) | {"bid_id": s.id}
                    for s in db.collection("bids")
                    .where("job_request_id", "==", job_request_id)
                    .stream()
                ]
        docs.sort(key=lambda x: x.get("created_at", ""), reverse=True)
        return docs

    return await asyncio.to_thread(_query)


async def list_bids_by_worker(worker_id: str) -> List[dict]:
    """All bids submitted by a worker."""
    svc = get_firebase_service()

    def _query():
        if svc.is_mock or MOCK_MODE:
            bucket = _mock_bucket("bids")
            return [v for v in bucket.values() if v.get("worker_id") == worker_id]
        db = svc.db
        if db is None:
            bucket = _mock_bucket("bids")
            return [v for v in bucket.values() if v.get("worker_id") == worker_id]
        return [
            dict(s.to_dict() or {}) | {"bid_id": s.id}
            for s in db.collection("bids").where("worker_id", "==", worker_id).stream()
        ]

    return await asyncio.to_thread(_query)
