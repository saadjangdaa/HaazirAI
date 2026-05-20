"""Phase D — persist HIFAZAT trust outcomes (post-booking only; never touches /api/request)."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from agents.hifazat import HifazatAgent, _SERIOUS_DISPUTE_TYPES
from services.disputes_integrity import normalize_dispute_type
from services.firebase import (
    get_booking,
    get_dispute,
    get_provider,
    get_user,
    list_dispute_entries,
    update_booking,
    update_dispute,
    update_provider,
    update_user,
)
from services.providers_integrity import derive_trust_score
from services.worker_service import resolve_worker_provider_id

_hifazat = HifazatAgent()


def _clamp_trust(score: float) -> float:
    return round(max(0.0, min(1.0, float(score))), 4)


def trust_points_to_delta(points: int) -> float:
    """Map HIFAZAT feedback trust_point_change (-15..+5) to 0–1 scale delta."""
    return round(int(points) * 0.01, 4)


async def adjust_provider_trust(provider_id: str, delta: float) -> float:
    pid = (provider_id or "").strip()
    if not pid:
        return 0.5
    prov = await get_provider(pid) or {}
    current = derive_trust_score(prov)
    new_score = _clamp_trust(current + delta)
    await update_provider(pid, {"trust_score": new_score})
    return new_score


async def adjust_customer_trust(user_id: str, delta: float) -> Optional[float]:
    uid = (user_id or "").strip()
    if not uid or abs(delta) < 0.0001:
        return None
    user = await get_user(uid) or {}
    try:
        current = float(user.get("trust_score", 1.0))
    except (ValueError, TypeError):
        current = 1.0
    new_score = _clamp_trust(current + delta)
    await update_user(uid, {"trust_score": new_score})
    return new_score


async def _count_disputes_for_provider(provider_id: str) -> Dict[str, int]:
    pid = (provider_id or "").strip()
    total = 0
    serious = 0
    for _doc_id, data in await list_dispute_entries():
        data = data or {}
        w = (data.get("worker_id") or "").strip()
        if w != pid:
            continue
        total += 1
        dtype = normalize_dispute_type(data.get("type") or data.get("dispute_type"))
        if dtype in _SERIOUS_DISPUTE_TYPES:
            serious += 1
    return {"total": total, "serious": serious}


async def _count_customer_disputes(user_id: str) -> int:
    uid = (user_id or "").strip()
    n = 0
    for _doc_id, data in await list_dispute_entries():
        if (data or {}).get("user_id", "").strip() == uid:
            n += 1
    return n


async def _build_customer_profile(user_id: str, dispute_count: int) -> Dict[str, Any]:
    user = await get_user(user_id) or {}
    try:
        trust = float(user.get("trust_score", 1.0))
    except (ValueError, TypeError):
        trust = 1.0
    return {
        "id": user_id,
        "user_id": user_id,
        "trust_score": trust,
        "dispute_count": dispute_count,
        "payment_failures": int(user.get("payment_failures", 0) or 0),
        "fake_request_flags": int(user.get("fake_request_flags", 0) or 0),
        "jobs_completed": len(user.get("booking_history") or []),
        "account_age_days": int(user.get("account_age_days", 90) or 90),
    }


async def run_hifazat_dispute_evaluation(dispute_id: str) -> Dict[str, Any]:
    """
    Run HIFAZAT on under_review dispute; persist trust + snapshot on dispute doc.
    """
    dispute = await get_dispute(dispute_id)
    if not dispute:
        return {"ok": False, "reason": "dispute_not_found"}

    booking_id = (dispute.get("booking_id") or "").strip()
    booking = await get_booking(booking_id) if booking_id else {}
    booking = booking or {}

    provider_id = (
        (dispute.get("worker_id") or "").strip()
        or (booking.get("provider_id") or "").strip()
    )
    provider = await get_provider(provider_id) if provider_id else {}
    provider = provider or {"id": provider_id, "provider_id": provider_id}

    customer_id = (dispute.get("user_id") or booking.get("user_id") or "").strip()
    cust_disputes = await _count_customer_disputes(customer_id) if customer_id else 0
    customer = await _build_customer_profile(customer_id, cust_disputes) if customer_id else {}

    prov_counts = await _count_disputes_for_provider(provider_id) if provider_id else {"serious": 0}

    evaluation = await _hifazat.evaluate_dispute(
        booking=booking,
        dispute=dispute,
        provider=provider,
        customer=customer,
        provider_serious_dispute_count=prov_counts["serious"],
        customer_dispute_count=cust_disputes,
    )

    if provider_id:
        await update_provider(provider_id, {"trust_score": evaluation["trust_score"]})
    if customer_id and evaluation.get("customer_trust_delta"):
        await adjust_customer_trust(customer_id, float(evaluation["customer_trust_delta"]))

    worker_warning = None
    action = evaluation.get("recommended_action", "no_action")
    if action in ("warn_worker", "reduce_visibility", "block_recommendation"):
        worker_warning = (
            "Aap ke profile par ek warning darj hui hai — agli bookings par asar ho sakta hai."
        )

    snapshot = {
        **{k: v for k, v in evaluation.items() if not k.startswith("_")},
        "evaluated_at": datetime.now(timezone.utc).isoformat(),
        "worker_warning_message": worker_warning,
    }

    await update_dispute(dispute_id, {"hifazat_evaluation": snapshot})

    return {"ok": True, "dispute_id": dispute_id, "hifazat_evaluation": snapshot}


async def on_booking_completed(booking: dict) -> None:
    """Small trust bump + completion marker when service finishes."""
    if not booking:
        return
    booking_id = (booking.get("booking_id") or "").strip()
    provider_id = (booking.get("provider_id") or "").strip()
    if provider_id:
        await adjust_provider_trust(provider_id, 0.02)
    if booking_id:
        await update_booking(
            booking_id,
            {
                "completion_trust_logged": True,
                "completion_trust_at": datetime.now(timezone.utc).isoformat(),
            },
        )


async def apply_feedback_trust(
    hifazat_result: Dict[str, Any],
    *,
    provider_id: str,
    customer_id: str,
) -> Dict[str, Any]:
    """Apply process_feedback trust_point_change to Firestore."""
    out: Dict[str, Any] = {"provider_trust_score": None, "customer_trust_score": None}
    if not hifazat_result.get("feedback_valid"):
        return out

    delta = trust_points_to_delta(int(hifazat_result.get("trust_point_change", 0)))
    pid = (provider_id or "").strip()
    if pid and delta != 0:
        out["provider_trust_score"] = await adjust_provider_trust(pid, delta)

    cid = (customer_id or "").strip()
    if cid and hifazat_result.get("risk_flags"):
        if "POSSIBLE_FAKE_COMPLAINT" in hifazat_result["risk_flags"]:
            out["customer_trust_score"] = await adjust_customer_trust(cid, -0.02)

    return out


async def build_feedback_payload(
    *,
    booking: dict,
    rating: int,
    review: Optional[str],
    tags: List[str],
) -> Dict[str, Any]:
    """Assemble payload for HifazatAgent.process_feedback."""
    booking = booking or {}
    complaint_type = "none"
    if tags:
        complaint_type = str(tags[0]).lower().replace(" ", "_")
    complaint = (review or "").strip() or None
    try:
        price = float(booking.get("price") or 0)
    except (ValueError, TypeError):
        price = 0.0

    completed_at = booking.get("completed_at") or ""
    days_since = 0
    if completed_at:
        try:
            done = datetime.fromisoformat(completed_at.replace("Z", "+00:00"))
            if done.tzinfo is None:
                done = done.replace(tzinfo=timezone.utc)
            days_since = max(0, (datetime.now(timezone.utc) - done).days)
        except ValueError:
            days_since = 0

    return {
        "job_id": booking.get("booking_id", ""),
        "provider_id": booking.get("provider_id", ""),
        "customer_id": booking.get("user_id", ""),
        "rating": rating,
        "complaint": complaint,
        "complaint_type": complaint_type,
        "job_value_pkr": price,
        "days_since_job": days_since,
        "repeat_customer": False,
    }
