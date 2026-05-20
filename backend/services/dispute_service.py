"""File disputes — always allow repeat filings on the same booking."""
from datetime import datetime
from typing import Any, Dict, Optional

from fastapi import HTTPException

from agents.orchestrator import run_dispute
from services.notification_service import notify_dispute_filed
from services.disputes_integrity import VALID_DISPUTE_TYPES, normalize_dispute_type
from services.firebase import append_user_dispute, create_dispute, get_booking, update_booking
from services.firestore_schema import normalize_booking_status, require_firebase_uid


async def ensure_booking_disputed(booking_id: str) -> None:
    """Mark booking disputed without duplicate lifecycle push (dispute flow notifies separately)."""
    booking = await get_booking(booking_id)
    if not booking:
        return
    if normalize_booking_status(booking.get("status")) == "disputed":
        return
    await update_booking(booking_id, {"status": "disputed"})


async def file_dispute(
    *,
    user_id: str,
    booking_id: str,
    dispute_type: str,
    description: str,
    evidence_url: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Create a new disputes/{id} document every time — no one-per-booking limit.
    """
    booking_id = (booking_id or "").strip()
    if not booking_id:
        raise HTTPException(status_code=400, detail="booking_id is required")

    booking = await get_booking(booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail=f"Booking {booking_id} not found")

    booking_uid = (booking.get("user_id") or "").strip()
    owner_uid = (user_id or "").strip() or booking_uid
    try:
        owner_uid = require_firebase_uid(owner_uid)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if booking_uid and booking_uid != owner_uid:
        raise HTTPException(status_code=403, detail="You can only dispute your own bookings")

    dtype = normalize_dispute_type(dispute_type)
    if dtype not in VALID_DISPUTE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid dispute_type. Use one of: {', '.join(sorted(VALID_DISPUTE_TYPES))}",
        )

    result = await run_dispute(
        booking_id=booking_id,
        dispute_type=dtype,
        description=description,
        evidence_url=evidence_url,
    )

    escalated = bool(result.get("escalated_to_human"))
    dispute_status = "escalated" if escalated else "resolved"
    resolved_at = datetime.now().isoformat()

    dispute_id = await create_dispute(
        {
            "booking_id": booking_id,
            "user_id": owner_uid,
            "type": dtype,
            "description": description.strip(),
            "evidence_url": evidence_url,
            "status": dispute_status,
            "resolution": result.get("resolution", ""),
            "refund_amount": result.get("refund_amount", 0),
            "provider_penalty": result.get("provider_penalty", "none"),
            "escalated_to_human": escalated,
            "case_summary": result.get("case_summary", ""),
            "resolved_at": resolved_at,
        }
    )
    await append_user_dispute(owner_uid, dispute_id)

    await ensure_booking_disputed(booking_id)
    updated_booking = await get_booking(booking_id) or booking
    await notify_dispute_filed(updated_booking, owner_uid, dispute_id=dispute_id)

    return {
        **result,
        "dispute_id": dispute_id,
        "dispute_status": dispute_status,
        "dispute_type": dtype,
        "repeat_allowed": True,
    }
