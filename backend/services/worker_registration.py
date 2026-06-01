"""Worker signup → pending provider application → admin approval."""
from __future__ import annotations

from typing import Any, Dict, Optional

from services.firebase import get_provider, get_user, sync_user_profile, update_user, upsert_provider
from services.user_validation import is_profile_complete

# City centroids for provider records (agents expect lat/lng).
_CITY_COORDS: Dict[str, tuple[float, float]] = {
    "islamabad": (33.6844, 73.0479),
    "rawalpindi": (33.5651, 73.0169),
    "lahore": (31.5204, 74.3587),
    "karachi": (24.8607, 67.0011),
    "peshawar": (34.0151, 71.5249),
    "multan": (30.1575, 71.5249),
    "faisalabad": (31.4504, 73.1350),
}


def provider_id_for_worker(user_id: str) -> str:
    """One provider application per Firebase worker UID."""
    return user_id.strip()


def _admin_status(provider: Optional[dict]) -> str:
    if not provider:
        return "none"
    if provider.get("deleted"):
        return "rejected"
    status = (provider.get("admin_status") or provider.get("status") or "").strip().lower()
    if status in ("pending", "active", "inactive", "suspended", "rejected"):
        return status
    if provider.get("available") is False:
        return "pending"
    return "active"


async def get_worker_approval_status(user_id: str) -> str:
    """
    none — worker profile incomplete / no application yet
    pending — awaiting admin approval
    active — approved, can use worker app
    rejected — admin rejected application
    """
    user = await get_user(user_id)
    if not user or user.get("role") != "worker":
        return "none"

    if not is_profile_complete(user):
        return "none"

    pid = (user.get("provider_id") or "").strip() or provider_id_for_worker(user_id)
    provider = await get_provider(pid)
    if not provider:
        return "pending"

    return _admin_status(provider)


def _coords_for_city(city: str) -> tuple[float, float]:
    key = (city or "Islamabad").strip().lower()
    return _CITY_COORDS.get(key, _CITY_COORDS["islamabad"])


def _build_provider_payload(user: dict, user_id: str) -> Dict[str, Any]:
    skills = list(user.get("skills") or [])
    wd = user.get("worker_data") or {}
    if not skills and isinstance(wd, dict):
        skills = list(wd.get("specializations") or [])

    areas = list(user.get("areas") or [])
    if not areas and isinstance(wd, dict):
        areas = list(wd.get("areas") or [])

    city = (user.get("city") or (areas[0] if areas else "") or "Islamabad").strip()
    area = (areas[0] if areas else city).strip()
    primary_service = skills[0] if skills else "General Services"
    username = (user.get("username") or user.get("name") or user.get("display_name") or "Worker").strip()
    lat, lng = _coords_for_city(city)

    price = user.get("price_per_service")
    if price is None and isinstance(wd, dict):
        price = wd.get("pricePerService")
    price_per_hour = int(price or 500)

    return {
        "id": user_id,
        "provider_id": user_id,
        "firebase_uid": user_id,
        "user_id": user_id,
        "name": username,
        "service": primary_service,
        "specialization": skills,
        "city": city,
        "area": area,
        "phone": (user.get("phone") or "").strip(),
        "email": (user.get("email") or "").strip(),
        "cnic": (user.get("cnic") or "").strip(),
        "rating": float(user.get("rating") or 0),
        "experience_years": int(user.get("experience_years") or 0),
        "price_per_hour": price_per_hour,
        "available": False,
        "admin_status": "pending",
        "status": "pending",
        "verified": False,
        "trust_score": 0.5,
        "lat": lat,
        "lng": lng,
        "documents_verified": False,
    }


async def ensure_worker_provider_application(user_id: str) -> str:
    """
    Create or refresh providers/{uid} as pending and link users/{uid}.provider_id.
    Returns provider_id.
    """
    user = await get_user(user_id)
    if not user or user.get("role") != "worker":
        raise ValueError("Worker user not found")

    if not is_profile_complete(user):
        raise ValueError("Complete worker profile before submitting for approval")

    pid = provider_id_for_worker(user_id)
    existing = await get_provider(pid)
    payload = _build_provider_payload(user, user_id)

    if existing:
        current = _admin_status(existing)
        # Keep terminal states; refresh profile fields for pending/active reviews.
        if current in ("rejected", "suspended", "inactive"):
            payload["admin_status"] = existing.get("admin_status") or current
            payload["status"] = payload["admin_status"]
            payload["available"] = bool(existing.get("available", False))
        elif current == "active":
            payload["admin_status"] = "active"
            payload["status"] = "active"
            payload["available"] = True
        else:
            payload["admin_status"] = "pending"
            payload["status"] = "pending"
            payload["available"] = False
    else:
        payload["admin_status"] = "pending"
        payload["status"] = "pending"
        payload["available"] = False

    await upsert_provider(pid, payload)
    await update_user(user_id, {"provider_id": pid, "approval_status": payload["admin_status"]})
    return pid


async def sync_all_worker_applications() -> int:
    """Backfill providers/{uid} for every complete worker in Firestore (admin portal)."""
    from services.firebase import _query_all, is_mock_mode

    if is_mock_mode():
        return 0

    synced = 0
    for u in _query_all("users"):
        if u.get("role") != "worker":
            continue
        uid = (u.get("user_id") or u.get("uid") or u.get("id") or "").strip()
        if not uid or not is_profile_complete(u):
            continue
        try:
            await ensure_worker_provider_application(uid)
            synced += 1
        except ValueError:
            continue
    return synced


async def require_approved_worker(user_id: str) -> str:
    """Raise ValueError if worker cannot access worker APIs yet. Returns provider_id."""
    status = await get_worker_approval_status(user_id)
    if status == "none":
        raise ValueError("Complete worker registration first")
    if status == "pending":
        raise ValueError("Your application is pending admin approval")
    if status == "rejected":
        raise ValueError("Your worker application was rejected. Contact support.")
    if status in ("suspended", "inactive"):
        raise ValueError("Your worker account is not active. Contact support.")

    user = await get_user(user_id)
    pid = (user or {}).get("provider_id") or provider_id_for_worker(user_id)
    return pid
