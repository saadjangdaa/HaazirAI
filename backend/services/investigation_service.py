from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from agents.hifazat import _SERIOUS_DISPUTE_TYPES
from models.admin import AdminAuthContext
from services import admin_service
from services.disputes_integrity import normalize_dispute_type
from services.firebase import (
    create_complaint,
    create_investigation,
    get_booking,
    get_complaint,
    get_investigation,
    get_provider,
    list_complaint_entries,
    list_dispute_entries,
    list_investigation_entries,
    update_complaint,
    update_investigation,
    update_provider,
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _provider_is_disabled(provider: Dict[str, Any]) -> bool:
    status = (provider.get("admin_status") or provider.get("status") or "").strip().lower()
    return status in ("disabled", "rejected")


def is_provider_eligible_for_assignment(provider: Optional[Dict[str, Any]]) -> bool:
    p = provider or {}
    status = (p.get("admin_status") or p.get("status") or "").strip().lower()
    if status in ("disabled", "rejected", "suspended", "inactive"):
        return False
    return bool(p.get("available", True))


async def _list_provider_complaints(provider_id: str) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for doc_id, data in await list_complaint_entries():
        data = data or {}
        if (data.get("provider_id") or "").strip() != provider_id:
            continue
        rows.append({**data, "complaint_id": doc_id})
    rows.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return rows


def _complaint_status_counts(complaints: List[Dict[str, Any]]) -> Dict[str, int]:
    out = {"pending": 0, "under_investigation": 0, "resolved": 0, "dismissed": 0}
    for c in complaints:
        st = (c.get("status") or "pending").strip().lower()
        if st in out:
            out[st] += 1
    return out


async def _compute_operational_metrics(provider_id: str) -> Dict[str, float]:
    bookings = 0
    completed = 0
    late_count = 0
    for _bid, data in await list_dispute_entries():
        _ = data
    from services.firebase import list_booking_entries

    for _doc_id, data in await list_booking_entries():
        data = data or {}
        if (data.get("provider_id") or "").strip() != provider_id:
            continue
        bookings += 1
        if (data.get("status") or "").strip().lower() == "completed":
            completed += 1
        try:
            late_minutes = int(data.get("late_arrival_minutes") or 0)
        except (TypeError, ValueError):
            late_minutes = 0
        if late_minutes > 20 or bool(data.get("pakka_late_flag")):
            late_count += 1
    completion_rate = round((completed / bookings), 4) if bookings else 0.0
    return {"completion_rate": completion_rate, "late_arrival_count": late_count, "jobs_count": bookings}


async def _count_serious_disputes(provider_id: str) -> int:
    n = 0
    for _doc_id, data in await list_dispute_entries():
        data = data or {}
        if (data.get("worker_id") or "").strip() != provider_id:
            continue
        dtype = normalize_dispute_type(data.get("type") or data.get("dispute_type"))
        if dtype in _SERIOUS_DISPUTE_TYPES:
            n += 1
    return n


def _map_recommendation(risk_score: float, verified_count: int, late_arrival_count: int) -> str:
    if risk_score >= 0.85 or verified_count >= 6:
        return "disable_provider"
    if risk_score >= 0.65 or verified_count >= 4:
        return "temporary_suspend"
    if risk_score >= 0.4 or late_arrival_count >= 3:
        return "warning"
    return "keep_active"


def _build_investigation_summary(
    *,
    verified_count: int,
    severe_count: int,
    trust_score: float,
    risk_score: float,
    completion_rate: float,
    late_arrival_count: int,
    defense: str,
) -> str:
    defense_short = (defense or "").strip()[:160]
    return (
        f"Verified complaints={verified_count}, serious_disputes={severe_count}, trust={trust_score:.2f}, "
        f"risk={risk_score:.2f}, completion_rate={completion_rate:.2f}, late_arrivals={late_arrival_count}. "
        f"Worker defense: {defense_short or 'Not submitted yet.'}"
    )


async def _update_provider_risk_fields(provider_id: str, fields: Dict[str, Any]) -> None:
    await update_provider(provider_id, {**fields, "updated_at": _now_iso()})


async def create_complaint_record(
    *,
    booking_id: str,
    user_id: str,
    provider_id: str,
    customer_statement: str,
    severity: str,
    evidence_url: Optional[str] = None,
) -> Dict[str, Any]:
    complaint_id = await create_complaint(
        {
            "booking_id": booking_id,
            "user_id": user_id,
            "provider_id": provider_id,
            "customer_statement": customer_statement.strip(),
            "status": "pending",
            "severity": (severity or "medium").strip().lower(),
            "evidence_url": evidence_url or "",
            "verified": False,
            "created_at": _now_iso(),
        }
    )

    await refresh_provider_complaint_metrics(provider_id)
    await maybe_open_investigation_for_provider(provider_id, trigger="complaint_threshold")

    return (await get_complaint(complaint_id)) or {"complaint_id": complaint_id}


async def refresh_provider_complaint_metrics(provider_id: str) -> Dict[str, Any]:
    complaints = await _list_provider_complaints(provider_id)
    complaint_count = len(complaints)
    verified_count = sum(1 for c in complaints if bool(c.get("verified")))
    provider = await get_provider(provider_id) or {}
    trust_score = float(provider.get("trust_score") or 0.5)
    ops = await _compute_operational_metrics(provider_id)
    severe_disputes = await _count_serious_disputes(provider_id)

    risk_score = min(
        1.0,
        round(
            0.20 * verified_count
            + 0.10 * severe_disputes
            + 0.15 * (1.0 - ops["completion_rate"])
            + 0.10 * max(0, ops["late_arrival_count"] - 1)
            + 0.20 * (1.0 - trust_score),
            4,
        ),
    )
    investigation_status = "none"
    if verified_count >= 3 or ops["late_arrival_count"] >= 3:
        investigation_status = "pending_review"

    await _update_provider_risk_fields(
        provider_id,
        {
            "complaint_count": complaint_count,
            "verified_complaint_count": verified_count,
            "risk_score": risk_score,
            "late_arrival_count": ops["late_arrival_count"],
            "completion_rate": ops["completion_rate"],
            "investigation_status": investigation_status,
            "recommended_action": provider.get("recommended_action") or "keep_active",
            "admin_status": provider.get("admin_status") or "active",
        },
    )

    return {
        "complaint_count": complaint_count,
        "verified_complaint_count": verified_count,
        "risk_score": risk_score,
        "late_arrival_count": ops["late_arrival_count"],
        "completion_rate": ops["completion_rate"],
    }


async def maybe_open_investigation_for_provider(provider_id: str, trigger: str) -> Optional[Dict[str, Any]]:
    provider = await get_provider(provider_id) or {}
    if _provider_is_disabled(provider):
        return None
    metrics = await refresh_provider_complaint_metrics(provider_id)
    verified = int(metrics["verified_complaint_count"])
    late_count = int(metrics["late_arrival_count"])
    if verified < 3 and late_count < 3:
        return None

    for doc_id, data in await list_investigation_entries():
        data = data or {}
        if (data.get("provider_id") or "").strip() != provider_id:
            continue
        if (data.get("status") or "").strip().lower() in ("open", "awaiting_worker_defense", "admin_review"):
            return {**data, "investigation_id": doc_id}

    investigation_id = await create_investigation(
        {
            "provider_id": provider_id,
            "status": "awaiting_worker_defense",
            "trigger": trigger,
            "complaint_count": metrics["complaint_count"],
            "verified_complaint_count": metrics["verified_complaint_count"],
            "trust_score": float(provider.get("trust_score") or 0.5),
            "risk_score": float(metrics["risk_score"]),
            "completion_rate": float(metrics["completion_rate"]),
            "late_arrival_count": int(metrics["late_arrival_count"]),
            "customer_complaints": [c.get("customer_statement", "") for c in await _list_provider_complaints(provider_id)],
            "worker_defense_statement": "",
            "investigation_summary": "Investigation opened. Awaiting worker defense.",
            "confidence_score": 0.0,
            "recommended_action": "keep_active",
            "admin_review_status": "pending",
            "created_by": "system",
            "created_at": _now_iso(),
        }
    )
    await _update_provider_risk_fields(provider_id, {"investigation_status": "under_investigation"})
    return await get_investigation(investigation_id)


async def submit_worker_defense(*, investigation_id: str, worker_uid: str, statement: str) -> Dict[str, Any]:
    row = await get_investigation(investigation_id)
    if not row:
        raise ValueError("Investigation not found")
    provider_id = (row.get("provider_id") or "").strip()
    provider = await get_provider(provider_id) or {}

    metrics = await refresh_provider_complaint_metrics(provider_id)
    verified = int(metrics["verified_complaint_count"])
    risk_score = float(metrics["risk_score"])
    trust = float((provider.get("trust_score") or 0.5))
    completion = float(metrics["completion_rate"])
    late_count = int(metrics["late_arrival_count"])
    severe_count = await _count_serious_disputes(provider_id)
    recommended_action = _map_recommendation(risk_score, verified, late_count)
    confidence = min(0.98, round(0.45 + (verified * 0.1) + (risk_score * 0.3), 4))
    summary = _build_investigation_summary(
        verified_count=verified,
        severe_count=severe_count,
        trust_score=trust,
        risk_score=risk_score,
        completion_rate=completion,
        late_arrival_count=late_count,
        defense=statement,
    )

    await update_investigation(
        investigation_id,
        {
            "status": "admin_review",
            "worker_uid": worker_uid,
            "worker_defense_statement": statement.strip(),
            "complaint_count": int(metrics["complaint_count"]),
            "verified_complaint_count": verified,
            "trust_score": trust,
            "risk_score": risk_score,
            "completion_rate": completion,
            "late_arrival_count": late_count,
            "investigation_summary": summary,
            "confidence_score": confidence,
            "recommended_action": recommended_action,
            "analysis_completed_at": _now_iso(),
        },
    )
    await _update_provider_risk_fields(
        provider_id,
        {
            "investigation_status": "admin_review",
            "recommended_action": recommended_action,
            "risk_score": risk_score,
            "late_arrival_count": late_count,
        },
    )
    return (await get_investigation(investigation_id)) or {"investigation_id": investigation_id}


async def list_admin_investigations(status: Optional[str] = None) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for doc_id, data in await list_investigation_entries():
        data = data or {}
        st = (data.get("status") or "").strip().lower()
        if status and st != status.strip().lower():
            continue
        provider_id = (data.get("provider_id") or "").strip()
        provider = await get_provider(provider_id) or {}
        rows.append(
            {
                **data,
                "id": doc_id,
                "investigation_id": doc_id,
                "provider_name": provider.get("name") or provider_id,
                "provider_service": provider.get("service", ""),
                "provider_city": provider.get("city", ""),
            }
        )
    rows.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return rows


async def apply_admin_investigation_decision(
    *,
    investigation_id: str,
    actor: AdminAuthContext,
    action: str,
    reason: str,
    suspend_days: Optional[int] = None,
) -> Dict[str, Any]:
    row = await get_investigation(investigation_id)
    if not row:
        raise ValueError("Investigation not found")
    provider_id = (row.get("provider_id") or "").strip()
    if not provider_id:
        raise ValueError("Investigation missing provider_id")

    action = (action or "").strip().lower()
    if action == "temporary_suspend":
        await admin_service.suspend_provider(
            provider_id,
            reason=f"Investigation {investigation_id}: {reason}",
            actor=actor,
            duration_days=suspend_days or 7,
            permanent=False,
        )
    elif action == "disable_provider":
        await admin_service.suspend_provider(
            provider_id,
            reason=f"Investigation {investigation_id}: {reason}",
            actor=actor,
            duration_days=None,
            permanent=True,
        )
        await update_provider(provider_id, {"admin_status": "disabled", "available": False})
    elif action == "warning":
        await update_provider(provider_id, {"admin_status": "active", "available": True})
    elif action == "keep_active":
        await admin_service.activate_provider(provider_id, actor)
    elif action == "request_more_evidence":
        await update_investigation(
            investigation_id,
            {
                "status": "awaiting_worker_defense",
                "admin_review_status": "more_evidence_requested",
                "admin_decision": action,
                "admin_reason": reason,
                "admin_actor_uid": actor.uid,
                "admin_decided_at": _now_iso(),
            },
        )
        await _update_provider_risk_fields(provider_id, {"investigation_status": "awaiting_worker_defense"})
        await admin_service.write_audit_log(
            actor,
            "INVESTIGATION_DECISION",
            f"Investigation {investigation_id} decision={action}",
            {"provider_id": provider_id, "reason": reason},
        )
        return (await get_investigation(investigation_id)) or {"investigation_id": investigation_id}
    else:
        raise ValueError("Unsupported action")

    await update_investigation(
        investigation_id,
        {
            "status": "closed",
            "admin_review_status": "decided",
            "admin_decision": action,
            "admin_reason": reason,
            "admin_actor_uid": actor.uid,
            "admin_actor_name": actor.name or actor.email or actor.uid,
            "admin_decided_at": _now_iso(),
        },
    )
    await _update_provider_risk_fields(provider_id, {"investigation_status": "closed", "recommended_action": action})
    await admin_service.write_audit_log(
        actor,
        "INVESTIGATION_DECISION",
        f"Investigation {investigation_id} decision={action}",
        {"provider_id": provider_id, "reason": reason},
    )
    return (await get_investigation(investigation_id)) or {"investigation_id": investigation_id}


async def verify_and_update_complaint(complaint_id: str, verified: bool) -> Dict[str, Any]:
    row = await get_complaint(complaint_id)
    if not row:
        raise ValueError("Complaint not found")
    status = "resolved" if verified else "dismissed"
    await update_complaint(
        complaint_id,
        {
            "verified": bool(verified),
            "status": status,
            "verified_at": _now_iso(),
        },
    )
    provider_id = (row.get("provider_id") or "").strip()
    await refresh_provider_complaint_metrics(provider_id)
    await maybe_open_investigation_for_provider(provider_id, trigger="verified_complaint_threshold")
    return (await get_complaint(complaint_id)) or {"complaint_id": complaint_id}
