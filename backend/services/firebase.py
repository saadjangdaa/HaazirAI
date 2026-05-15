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
import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# ── Collection names ─────────────────────────────────────────────────────
COL_USERS = "users"
COL_PROVIDERS = "providers"
COL_BOOKINGS = "bookings"
COL_AGENT_LOGS = "agent_logs"
COL_DISPUTES = "disputes"
COL_REVIEWS = "reviews"
COL_WAITLIST = "waitlist"

# Bookings that block the same slot for ``check_double_booking``
_BLOCKING_BOOKING_STATUSES = frozenset(
    {"confirmed", "en_route", "enroute", "in_progress", "pending"}
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
        }

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

    def delete_provider(self, provider_id: str) -> bool:
        try:
            if self._mock:
                self._mock_store[COL_PROVIDERS].pop(provider_id, None)
                return True
            self._collection(COL_PROVIDERS).document(provider_id).delete()
            logger.info("✅ delete_provider: %s", provider_id)
            return True
        except Exception as e:
            logger.error("❌ delete_provider failed: %s", e)
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


async def get_provider_bookings(provider_id: str) -> list:
    svc = get_firebase_service()
    return await asyncio.to_thread(svc.get_provider_bookings, provider_id)


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


async def add_to_waitlist(data: dict) -> str:
    svc = get_firebase_service()
    return await asyncio.to_thread(svc.save_waitlist_entry, data)
