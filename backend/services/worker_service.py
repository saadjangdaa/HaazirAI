"""Worker dashboard data — bookings by linked provider_id."""
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from services.firebase import get_user, list_bookings
from services.booking_service import _enrich_booking
from services.users_integrity import is_plausible_firebase_uid
from services.user_validation import is_profile_complete
from services.worker_registration import (
    ensure_worker_provider_application,
    get_worker_approval_status,
    provider_id_for_worker,
)


async def resolve_worker_provider_id(user_id: str, persist: bool = True) -> Optional[str]:
    """
    Return this worker's own provider_id (Firebase UID).
    Creates a pending providers/{uid} application when profile is complete.
    Does not link workers to unrelated seed/demo providers.
    """
    if not is_plausible_firebase_uid(user_id):
        return None

    user = await get_user(user_id)
    if not user or user.get("role") != "worker":
        return None

    existing = (user.get("provider_id") or "").strip()
    if existing:
        return existing

    if not is_profile_complete(user):
        return None

    if persist:
        try:
            return await ensure_worker_provider_application(user_id)
        except ValueError:
            return provider_id_for_worker(user_id)

    return provider_id_for_worker(user_id)


async def get_worker_bookings(
    user_id: str, status: Optional[str] = None
) -> Dict[str, Any]:
    """Bookings for worker dashboard (via provider_id on users/{uid})."""
    if not is_plausible_firebase_uid(user_id):
        raise HTTPException(status_code=400, detail="Valid Firebase Auth UID required")

    approval = await get_worker_approval_status(user_id)
    if approval != "active":
        msg = {
            "pending": "Your application is pending admin approval",
            "rejected": "Your worker application was rejected",
            "none": "Complete worker registration first",
        }.get(approval, "Worker account is not active")
        raise HTTPException(status_code=403, detail=msg)

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
    from datetime import datetime, timedelta, timezone

    now = datetime.now(timezone.utc)
    today = now.date()
    week_start = today - timedelta(days=6)

    completed = [b for b in bookings if (b.get("status") or "").lower() == "completed"]

    def _parse_booking_date(b: dict) -> "datetime":
        # Prefer completed_at (set when status transitions to completed),
        # then created_at. Falls back to now so the booking is counted today.
        for field in ("completed_at", "created_at", "slot_time", "scheduled_time"):
            raw = (b.get(field) or "").strip()
            if not raw:
                continue
            try:
                if "T" in raw:
                    return datetime.fromisoformat(raw.replace("Z", "+00:00"))
                return datetime.strptime(raw[:16], "%Y-%m-%d %H:%M").replace(tzinfo=timezone.utc)
            except (ValueError, TypeError):
                continue
        return now  # no parseable date → treat as today

    today_rows, week_rows = [], []
    for b in completed:
        dt = _parse_booking_date(b)
        d = dt.date()
        if d == today:
            today_rows.append(b)
        if week_start <= d <= today:
            week_rows.append(b)

    # Bookings with no completed_at (completed before this fix) are treated as
    # completed "today" so they immediately show up in the earnings summary.
    legacy = [b for b in completed if not b.get("completed_at")]
    for b in legacy:
        if b not in today_rows:
            today_rows.append(b)
        if b not in week_rows:
            week_rows.append(b)

    def total(rows: List[dict]) -> int:
        return sum(int(r.get("price") or 0) for r in rows)

    week_by_day: Dict[str, int] = {}
    for i in range(7):
        d = week_start + timedelta(days=i)
        week_by_day[d.isoformat()] = 0
    for b in week_rows:
        dt = _parse_booking_date(b)
        key = dt.date().isoformat()
        if key in week_by_day:
            week_by_day[key] += int(b.get("price") or 0)
        else:
            # Legacy booking outside chart window → add to today's bar
            week_by_day[today.isoformat()] = week_by_day.get(today.isoformat(), 0) + int(b.get("price") or 0)

    recent_payments = [
        {
            "booking_id": b.get("booking_id"),
            "label": b.get("service") or "Service",
            "amount": int(b.get("price") or 0),
            "received": True,
        }
        for b in sorted(completed, key=lambda x: x.get("completed_at") or x.get("created_at", ""), reverse=True)[:8]
    ]

    return {
        "today_total": total(today_rows),
        "today_jobs": len(today_rows),
        "week_total": total(week_rows),
        "week_jobs": len(week_rows),
        "week_by_day": list(week_by_day.values()),
        "completed_count": len(completed),
        "recent_payments": recent_payments,
    }
