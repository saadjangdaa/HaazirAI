"""Booking status transitions with lifecycle validation + push on change."""
from fastapi import HTTPException

from services.booking_lifecycle import build_tracking_steps, can_transition
from services.firestore_schema import normalize_booking_status
from services.firebase import get_booking, update_booking, get_provider
from services.push_notify import notify_booking_status_change


async def set_booking_status(booking_id: str, new_status: str) -> dict:
    booking = await get_booking(booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail=f"Booking {booking_id} not found")

    old_status = normalize_booking_status(booking.get("status"))
    new_status = normalize_booking_status(new_status)

    if not can_transition(old_status, new_status):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot transition from {old_status} to {new_status}",
        )

    if old_status == new_status:
        return await _enrich_booking(booking)

    await update_booking(booking_id, {"status": new_status})
    updated = await get_booking(booking_id)
    try:
        await notify_booking_status_change(updated, old_status, new_status)
    except Exception as e:
        print(f"[Push] notify_booking_status_change failed: {e}")
    return await _enrich_booking(updated)


async def _enrich_booking(booking: dict) -> dict:
    provider_name = booking.get("provider_name")
    if not provider_name and booking.get("provider_id"):
        prov = await get_provider(booking["provider_id"])
        provider_name = (prov or {}).get("name", "Provider")
    status = (booking.get("status") or "pending").lower()
    return {
        **booking,
        "provider_name": provider_name or "Provider",
        "status": status,
        "tracking_steps": build_tracking_steps(status),
    }
