"""Worker dashboard data — bookings by linked provider_id."""
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from services.firebase import get_user, list_bookings, list_providers, update_user
from services.booking_service import _enrich_booking
from services.users_integrity import is_plausible_firebase_uid


async def resolve_worker_provider_id(user_id: str, persist: bool = True) -> Optional[str]:
    """
    Return provider_id for a worker users/{uid} document.
    Uses stored provider_id or matches Firestore provider by skill + city.
    """
    if not is_plausible_firebase_uid(user_id):
        return None

    user = await get_user(user_id)
    if not user:
        return None

    existing = (user.get("provider_id") or "").strip()
    if existing:
        return existing

    skills: List[str] = list(user.get("skills") or [])
    wd = user.get("worker_data") or {}
    if not skills and isinstance(wd, dict):
        skills = list(wd.get("specializations") or [])

    areas: List[str] = list(user.get("areas") or [])
    if not areas and isinstance(wd, dict):
        areas = list(wd.get("areas") or [])
    city = (user.get("city") or (areas[0] if areas else "") or "Islamabad").strip()

    providers = await list_providers(city=city if city else None)
    if not providers and city:
        providers = await list_providers()

    matched: Optional[str] = None
    for skill in skills:
        sk = skill.lower()
        for p in providers:
            svc = (p.get("service") or "").lower()
            specs = [s.lower() for s in (p.get("specialization") or [])]
            if sk in svc or any(sk in s or s in sk for s in specs):
                matched = p.get("id") or p.get("provider_id")
                break
        if matched:
            break

    if not matched and providers:
        matched = providers[0].get("id") or providers[0].get("provider_id")

    if matched and persist:
        await update_user(user_id, {"provider_id": matched})

    return matched


async def get_worker_bookings(
    user_id: str, status: Optional[str] = None
) -> Dict[str, Any]:
    """Bookings for worker dashboard (via provider_id on users/{uid})."""
    if not is_plausible_firebase_uid(user_id):
        raise HTTPException(status_code=400, detail="Valid Firebase Auth UID required")

    provider_id = await resolve_worker_provider_id(user_id)
    if not provider_id:
        return {
            "user_id": user_id,
            "provider_id": None,
            "bookings": [],
            "count": 0,
            "message": "No provider linked — complete worker profile or seed providers",
        }

    rows = await list_bookings(provider_id=provider_id, status=status)
    rows.sort(key=lambda b: b.get("slot_time") or b.get("scheduled_time") or b.get("created_at", ""))
    enriched = []
    for b in rows:
        enriched.append(await _enrich_booking(b))

    return {
        "user_id": user_id,
        "provider_id": provider_id,
        "bookings": enriched,
        "count": len(enriched),
    }


def summarize_worker_earnings(bookings: List[dict]) -> Dict[str, Any]:
    """Derive earnings stats from booking list (completed = paid)."""
    from datetime import datetime, timedelta

    now = datetime.now()
    today = now.date()
    week_start = today - timedelta(days=6)

    completed = [b for b in bookings if (b.get("status") or "").lower() == "completed"]
    today_rows = []
    week_rows = []
    for b in completed:
        raw = b.get("slot_time") or b.get("scheduled_time") or b.get("created_at") or ""
        try:
            if "T" in raw:
                dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
            else:
                dt = datetime.strptime(raw[:16], "%Y-%m-%d %H:%M")
        except (ValueError, TypeError):
            dt = now
        d = dt.date()
        if d == today:
            today_rows.append(b)
        if week_start <= d <= today:
            week_rows.append(b)

    def total(rows: List[dict]) -> int:
        return sum(int(r.get("price") or 0) for r in rows)

    week_by_day: Dict[str, int] = {}
    for i in range(7):
        d = week_start + timedelta(days=i)
        week_by_day[d.isoformat()] = 0
    for b in week_rows:
        raw = b.get("slot_time") or b.get("scheduled_time") or b.get("created_at") or ""
        try:
            if "T" in raw:
                dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
            else:
                dt = datetime.strptime(raw[:16], "%Y-%m-%d %H:%M")
        except (ValueError, TypeError):
            continue
        key = dt.date().isoformat()
        if key in week_by_day:
            week_by_day[key] += int(b.get("price") or 0)

    pending_payment = [
        {
            "booking_id": b.get("booking_id"),
            "label": b.get("service") or "Service",
            "amount": int(b.get("price") or 0),
            "received": True,
        }
        for b in sorted(completed, key=lambda x: x.get("created_at", ""), reverse=True)[:8]
    ]

    return {
        "today_total": total(today_rows),
        "today_jobs": len(today_rows),
        "week_total": total(week_rows),
        "week_jobs": len(week_rows),
        "week_by_day": list(week_by_day.values()),
        "completed_count": len(completed),
        "recent_payments": pending_payment,
    }
