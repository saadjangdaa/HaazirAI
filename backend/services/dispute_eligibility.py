"""Phase A — dispute filing eligibility (completed/cancelled or no-show auto-cancel)."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from fastapi import HTTPException

from services.booking_service import set_booking_status
from services.firestore_schema import normalize_booking_status
from services.firebase import get_booking, update_booking

# Hours after scheduled slot before a confirmed booking is treated as worker no-show.
NO_SHOW_GRACE_HOURS = 3

_DISPUTE_ELIGIBLE_STATUSES = frozenset({"completed", "cancelled"})


@dataclass(frozen=True)
class DisputeEligibility:
    eligible: bool
    reason: str
    message: str
    booking_status: str
    would_auto_cancel: bool = False


def _parse_slot_datetime(booking: Dict[str, Any]) -> Optional[datetime]:
    """Parse slot_time or scheduled_time (Pakka format or ISO)."""
    for field in ("slot_time", "scheduled_time"):
        raw = (booking.get(field) or "").strip()
        if not raw:
            continue
        for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d %H:%M:%S"):
            try:
                dt = datetime.strptime(raw[:19], fmt)
                return dt.replace(tzinfo=timezone.utc)
            except ValueError:
                continue
        try:
            dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except ValueError:
            continue
    return None


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def is_past_no_show_grace(booking: Dict[str, Any], *, now: Optional[datetime] = None) -> bool:
    """True when booking is still confirmed and scheduled slot + grace has passed."""
    status = normalize_booking_status(booking.get("status"))
    if status != "confirmed":
        return False
    slot = _parse_slot_datetime(booking)
    if slot is None:
        return False
    now = now or _now_utc()
    if slot.tzinfo is None:
        slot = slot.replace(tzinfo=timezone.utc)
    return now >= slot + timedelta(hours=NO_SHOW_GRACE_HOURS)


def assess_dispute_eligibility(
    booking: Dict[str, Any], *, now: Optional[datetime] = None
) -> DisputeEligibility:
    """Read-only eligibility check (no auto-cancel)."""
    status = normalize_booking_status(booking.get("status"))

    if status in _DISPUTE_ELIGIBLE_STATUSES:
        return DisputeEligibility(
            eligible=True,
            reason="eligible",
            message="Dispute filing is allowed for this booking.",
            booking_status=status,
        )

    if status == "confirmed" and is_past_no_show_grace(booking, now=now):
        return DisputeEligibility(
            eligible=True,
            reason="no_show_grace_exceeded",
            message=(
                "Worker did not arrive within the grace period. "
                "Filing a dispute will cancel this booking and open your case."
            ),
            booking_status=status,
            would_auto_cancel=True,
        )

    if status in ("pending", "assigned", "confirmed", "on_the_way", "arrived", "in_progress"):
        if status == "confirmed":
            return DisputeEligibility(
                eligible=False,
                reason="awaiting_service_or_grace",
                message=(
                    "Dispute is available after the service ends, is cancelled, "
                    f"or {NO_SHOW_GRACE_HOURS} hours after the scheduled time if the worker does not arrive."
                ),
                booking_status=status,
            )
        return DisputeEligibility(
            eligible=False,
            reason="booking_in_progress",
            message="Dispute can only be filed after the booking is completed or cancelled.",
            booking_status=status,
        )

    return DisputeEligibility(
        eligible=False,
        reason="status_not_eligible",
        message=f"Disputes are not available for booking status '{status}'.",
        booking_status=status,
    )


async def prepare_booking_for_dispute(booking_id: str) -> Dict[str, Any]:
    """
    Ensure booking is eligible; auto-cancel confirmed no-shows before dispute filing.
    Returns refreshed booking document.
    """
    booking_id = (booking_id or "").strip()
    booking = await get_booking(booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail=f"Booking {booking_id} not found")

    check = assess_dispute_eligibility(booking)
    if check.eligible and not check.would_auto_cancel:
        return booking

    if check.would_auto_cancel:
        await set_booking_status(booking_id, "cancelled")
        await update_booking(
            booking_id,
            {
                "cancel_reason": "worker_no_show",
                "cancelled_at": _now_utc().isoformat(),
            },
        )
        refreshed = await get_booking(booking_id)
        return refreshed or booking

    raise HTTPException(status_code=409, detail=check.message)
