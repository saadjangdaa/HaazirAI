"""File disputes — Phase B two-sided lifecycle (open → worker response → review → resolve)."""
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from agents.orchestrator import run_dispute
from services.dispute_config import dispute_instant_resolve_enabled
from services.dispute_eligibility import prepare_booking_for_dispute
from services.notification_service import (
    notify_dispute_filed,
    notify_dispute_resolved,
    notify_dispute_worker_replied,
)
from services.disputes_integrity import (
    VALID_DISPUTE_TYPES,
    can_transition_dispute_status,
    normalize_dispute_type,
)
from services.firebase import (
    append_user_dispute,
    create_dispute,
    get_booking,
    get_dispute,
    list_dispute_entries,
    update_booking,
    update_dispute,
)
from services.firestore_schema import normalize_booking_status, normalize_dispute, require_firebase_uid
from services.worker_service import resolve_worker_provider_id

_OPEN_DISPUTE_MESSAGE = (
    "Aap ki shikayat darj ho gayi hai. Worker ko jawab dene ka moqa diya jayega, "
    "phir HIFAZAT review aur JHAGRA faisla hoga."
)


async def ensure_booking_disputed(booking_id: str) -> None:
    """Mark booking disputed — use only on refund/escalation (Phase E), not on open file."""
    booking = await get_booking(booking_id)
    if not booking:
        return
    if normalize_booking_status(booking.get("status")) == "disputed":
        return
    await update_booking(booking_id, {"status": "disputed"})


def _build_open_dispute_doc(
    *,
    booking_id: str,
    owner_uid: str,
    worker_id: str,
    dtype: str,
    description: str,
    evidence_url: Optional[str],
) -> Dict[str, Any]:
    msg = description.strip()
    return {
        "booking_id": booking_id,
        "user_id": owner_uid,
        "worker_id": worker_id,
        "type": dtype,
        "status": "open",
        "customer_message": msg,
        "description": msg,
        "evidence_url": evidence_url,
        "worker_response": None,
        "resolution": "",
        "refund_amount": 0,
        "provider_penalty": "none",
        "escalated_to_human": False,
        "case_summary": "",
        "resolved_at": None,
    }


async def _file_dispute_open(
    *,
    booking: Dict[str, Any],
    owner_uid: str,
    booking_id: str,
    dtype: str,
    description: str,
    evidence_url: Optional[str],
) -> Dict[str, Any]:
    worker_id = (booking.get("provider_id") or "").strip()
    try:
        from services.investigation_service import create_complaint_record

        await create_complaint_record(
            booking_id=booking_id,
            user_id=owner_uid,
            provider_id=worker_id,
            customer_statement=description,
            severity="medium",
            evidence_url=evidence_url,
        )
    except Exception:
        pass
    dispute_id = await create_dispute(
        _build_open_dispute_doc(
            booking_id=booking_id,
            owner_uid=owner_uid,
            worker_id=worker_id,
            dtype=dtype,
            description=description,
            evidence_url=evidence_url,
        )
    )
    await append_user_dispute(owner_uid, dispute_id)
    await notify_dispute_filed(booking, owner_uid, dispute_id=dispute_id)

    return {
        "booking_id": booking_id,
        "dispute_type": dtype,
        "dispute_id": dispute_id,
        "dispute_status": "open",
        "resolution": "",
        "refund_amount": 0,
        "provider_penalty": "none",
        "case_summary": _OPEN_DISPUTE_MESSAGE,
        "escalated_to_human": False,
        "worker_id": worker_id,
        "worker_response_pending": True,
        "repeat_allowed": True,
        "message": _OPEN_DISPUTE_MESSAGE,
    }


async def _file_dispute_instant(
    *,
    booking: Dict[str, Any],
    owner_uid: str,
    booking_id: str,
    dtype: str,
    description: str,
    evidence_url: Optional[str],
) -> Dict[str, Any]:
    """Legacy path — immediate JHAGRA resolution (DISPUTE_INSTANT_RESOLVE=true)."""
    result = await run_dispute(
        booking_id=booking_id,
        dispute_type=dtype,
        description=description,
        evidence_url=evidence_url,
    )

    escalated = bool(result.get("escalated_to_human"))
    dispute_status = "escalated" if escalated else "resolved"
    resolved_at = datetime.now().isoformat()
    worker_id = (booking.get("provider_id") or "").strip()
    try:
        from services.investigation_service import create_complaint_record

        await create_complaint_record(
            booking_id=booking_id,
            user_id=owner_uid,
            provider_id=worker_id,
            customer_statement=description,
            severity="high",
            evidence_url=evidence_url,
        )
    except Exception:
        pass
    msg = description.strip()

    dispute_id = await create_dispute(
        {
            "booking_id": booking_id,
            "user_id": owner_uid,
            "worker_id": worker_id,
            "type": dtype,
            "customer_message": msg,
            "description": msg,
            "evidence_url": evidence_url,
            "status": dispute_status,
            "resolution": result.get("resolution", ""),
            "refund_amount": result.get("refund_amount", 0),
            "provider_penalty": result.get("provider_penalty", "none"),
            "escalated_to_human": escalated,
            "case_summary": result.get("case_summary", ""),
            "resolved_at": resolved_at,
            "worker_response": None,
        }
    )
    await append_user_dispute(owner_uid, dispute_id)

    if escalated or (result.get("refund_amount") or 0) > 0:
        await ensure_booking_disputed(booking_id)

    updated_booking = await get_booking(booking_id) or booking
    await notify_dispute_filed(updated_booking, owner_uid, dispute_id=dispute_id)

    return {
        **result,
        "dispute_id": dispute_id,
        "dispute_status": dispute_status,
        "dispute_type": dtype,
        "worker_id": worker_id,
        "repeat_allowed": True,
        "instant_resolve": True,
    }


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
    Default: status=open (two-sided). Set DISPUTE_INSTANT_RESOLVE=true for legacy instant JHAGRA.
    """
    booking_id = (booking_id or "").strip()
    if not booking_id:
        raise HTTPException(status_code=400, detail="booking_id is required")

    booking = await prepare_booking_for_dispute(booking_id)

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

    if dispute_instant_resolve_enabled():
        return await _file_dispute_instant(
            booking=booking,
            owner_uid=owner_uid,
            booking_id=booking_id,
            dtype=dtype,
            description=description,
            evidence_url=evidence_url,
        )

    return await _file_dispute_open(
        booking=booking,
        owner_uid=owner_uid,
        booking_id=booking_id,
        dtype=dtype,
        description=description,
        evidence_url=evidence_url,
    )


# Fields visible to workers (no internal trust / HIFAZAT data).
_WORKER_DISPUTE_PUBLIC_KEYS = frozenset(
    {
        "dispute_id",
        "booking_id",
        "type",
        "dispute_type",
        "status",
        "customer_message",
        "description",
        "created_at",
        "updated_at",
        "worker_response",
    }
)


def _dispute_worker_view(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Worker-safe dispute payload — complaint + booking ref only."""
    return {k: doc[k] for k in _WORKER_DISPUTE_PUBLIC_KEYS if k in doc and doc[k] is not None}


async def _worker_provider_id(worker_uid: str) -> str:
    try:
        worker_uid = require_firebase_uid(worker_uid)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    provider_id = await resolve_worker_provider_id(worker_uid, persist=False)
    if not provider_id:
        raise HTTPException(
            status_code=403,
            detail="Worker profile is not linked to a provider — complete worker setup first",
        )
    return provider_id


async def _worker_can_access_dispute(
    worker_uid: str, dispute: Dict[str, Any], booking: Optional[Dict[str, Any]]
) -> bool:
    provider_id = await _worker_provider_id(worker_uid)
    worker_on_doc = (dispute.get("worker_id") or "").strip()
    if worker_on_doc and worker_on_doc == provider_id:
        return True
    if booking and (booking.get("provider_id") or "").strip() == provider_id:
        return True
    return False


async def list_worker_disputes(
    worker_uid: str,
    *,
    status: Optional[str] = None,
) -> Dict[str, Any]:
    """Open disputes for the worker's linked provider (worker-visible fields only)."""
    provider_id = await _worker_provider_id(worker_uid)
    want = (status or "").strip().lower() or None

    rows: List[Dict[str, Any]] = []
    for doc_id, data in await list_dispute_entries():
        data = data or {}
        doc_worker = (data.get("worker_id") or "").strip()
        if doc_worker != provider_id:
            bid = (data.get("booking_id") or "").strip()
            if bid:
                booking = await get_booking(bid)
                if (booking or {}).get("provider_id", "").strip() != provider_id:
                    continue
            else:
                continue
        normalized = normalize_dispute({**data, "dispute_id": doc_id}, dispute_id=doc_id)
        st = (normalized.get("status") or "open").lower()
        if want and st != want:
            continue
        rows.append(_dispute_worker_view(normalized))

    rows.sort(key=lambda d: d.get("created_at", ""), reverse=True)
    return {
        "user_id": worker_uid,
        "provider_id": provider_id,
        "disputes": rows,
        "count": len(rows),
    }


async def respond_to_dispute(
    *,
    worker_uid: str,
    dispute_id: str,
    message: str,
) -> Dict[str, Any]:
    """Worker submits one response; dispute moves open → under_review."""
    dispute_id = (dispute_id or "").strip()
    if not dispute_id:
        raise HTTPException(status_code=400, detail="dispute_id is required")

    msg = (message or "").strip()
    if len(msg) < 10:
        raise HTTPException(
            status_code=400,
            detail="Response must be at least 10 characters",
        )

    dispute = await get_dispute(dispute_id)
    if not dispute:
        raise HTTPException(status_code=404, detail="Dispute not found")

    booking_id = (dispute.get("booking_id") or "").strip()
    booking = await get_booking(booking_id) if booking_id else None

    if not await _worker_can_access_dispute(worker_uid, dispute, booking):
        raise HTTPException(status_code=403, detail="Not authorized to respond to this dispute")

    current = (dispute.get("status") or "open").lower()
    if current != "open":
        raise HTTPException(
            status_code=409,
            detail=f"Dispute cannot be answered while status is '{current}'",
        )

    existing = dispute.get("worker_response")
    if isinstance(existing, dict) and (existing.get("message") or "").strip():
        raise HTTPException(status_code=409, detail="Worker response already submitted")

    if not can_transition_dispute_status("open", "under_review"):
        raise HTTPException(status_code=500, detail="Invalid dispute status transition")

    timestamp = datetime.now().isoformat()
    worker_response = {"message": msg, "timestamp": timestamp}
    ok = await update_dispute(
        dispute_id,
        {
            "worker_response": worker_response,
            "status": "under_review",
        },
    )
    if not ok:
        raise HTTPException(status_code=500, detail="Failed to save worker response")

    customer_id = (dispute.get("user_id") or (booking or {}).get("user_id") or "").strip()
    if booking and customer_id:
        await notify_dispute_worker_replied(booking, customer_id, dispute_id=dispute_id)

    hifazat_summary: Dict[str, Any] = {}
    worker_warning: Optional[str] = None
    try:
        from services.trust_service import run_hifazat_dispute_evaluation

        hifazat_out = await run_hifazat_dispute_evaluation(dispute_id)
        if hifazat_out.get("ok"):
            ev = hifazat_out.get("hifazat_evaluation") or {}
            hifazat_summary = {
                "recommended_action": ev.get("recommended_action"),
                "complaint_verdict": ev.get("complaint_verdict"),
                "trust_score": ev.get("trust_score"),
            }
            worker_warning = ev.get("worker_warning_message")
            if worker_warning and booking:
                from services.notification_service import notify_worker_trust_warning

                pid = (dispute.get("worker_id") or booking.get("provider_id") or "").strip()
                if pid:
                    await notify_worker_trust_warning(pid, worker_warning, dispute_id=dispute_id)
    except Exception as exc:
        print(f"[HIFAZAT] evaluate dispute {dispute_id} failed: {exc}")

    updated = await get_dispute(dispute_id) or dispute
    return {
        "dispute_id": dispute_id,
        "dispute_status": "under_review",
        "booking_id": booking_id,
        "worker_response": worker_response,
        "message": "Your response was recorded. The case is now under review.",
        "dispute": _dispute_worker_view(normalize_dispute(updated, dispute_id=dispute_id)),
        "hifazat_summary": hifazat_summary,
        "worker_warning": worker_warning,
    }


def _build_jhagra_description(dispute: Dict[str, Any]) -> str:
    customer_msg = (dispute.get("customer_message") or dispute.get("description") or "").strip()
    wr = dispute.get("worker_response")
    worker_msg = ""
    if isinstance(wr, dict):
        worker_msg = (wr.get("message") or "").strip()
    parts = [f"Customer complaint: {customer_msg}"]
    if worker_msg:
        parts.append(f"Worker response: {worker_msg}")
    hif = dispute.get("hifazat_evaluation") or {}
    if hif:
        parts.append(
            f"HIFAZAT (internal context): verdict={hif.get('complaint_verdict')} "
            f"action={hif.get('recommended_action')} flags={hif.get('risk_flags')}"
        )
    return "\n".join(parts)


def _apply_hifazat_to_jhagra(
    result: Dict[str, Any],
    *,
    dispute: Dict[str, Any],
    booking: Dict[str, Any],
    hifazat: Dict[str, Any],
) -> Dict[str, Any]:
    """Merge HIFAZAT trust outcome into JHAGRA decision (no refund for rude_behavior)."""
    dtype = normalize_dispute_type(dispute.get("type") or dispute.get("dispute_type"))
    out = dict(result)
    price = int(booking.get("price") or 0)

    if dtype == "rude_behavior":
        out["refund_amount"] = 0
        out["provider_penalty"] = out.get("provider_penalty") or "warning_issued"
        if not (out.get("resolution") or "").strip():
            out["resolution"] = (
                "Behavior ki shikayat valid hai. Provider ko warning di gayi. "
                "Service complete thi — koi refund nahi."
            )

    verdict = (hifazat.get("complaint_verdict") or "").lower()
    if verdict == "abuse_risk":
        cap = int(price * 0.25) if price else 0
        if int(out.get("refund_amount") or 0) > cap:
            out["refund_amount"] = cap
        out["case_summary"] = (
            (out.get("case_summary") or "")
            + " HIFAZAT flagged possible abusive language from customer."
        ).strip()

    action = (hifazat.get("recommended_action") or "").lower()
    if action == "escalate_admin":
        out["escalated_to_human"] = True
        out["case_summary"] = (
            (out.get("case_summary") or "") + " Escalated per HIFAZAT risk review."
        ).strip()
    elif action == "block_recommendation":
        out["provider_penalty"] = "temporary_ban"
        out["escalated_to_human"] = True

    if hifazat.get("refund_recommended") is False:
        out["refund_amount"] = 0

    return out


def _should_mark_booking_disputed(
    *,
    refund_amount: int,
    escalated: bool,
    hifazat: Dict[str, Any],
) -> bool:
    if refund_amount > 0 or escalated:
        return True
    action = (hifazat.get("recommended_action") or "").lower()
    return action in ("escalate_admin", "block_recommendation")


async def finalize_dispute(*, user_id: str, dispute_id: str) -> Dict[str, Any]:
    """
    Phase E — HIFAZAT snapshot + JHAGRA final outcome.
    Requires under_review (worker responded + HIFAZAT evaluated).
    """
    dispute_id = (dispute_id or "").strip()
    if not dispute_id:
        raise HTTPException(status_code=400, detail="dispute_id is required")

    try:
        owner_uid = require_firebase_uid((user_id or "").strip())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    dispute = await get_dispute(dispute_id)
    if not dispute:
        raise HTTPException(status_code=404, detail="Dispute not found")

    dispute_uid = (dispute.get("user_id") or "").strip()
    if dispute_uid and dispute_uid != owner_uid:
        raise HTTPException(status_code=403, detail="You can only finalize your own disputes")

    status = (dispute.get("status") or "open").lower()
    if status in ("resolved", "escalated"):
        return _finalize_response_from_doc(dispute, dispute_id)

    agent_logs: List[dict] = []

    if status == "open":
        wr = dispute.get("worker_response")
        if not (isinstance(wr, dict) and (wr.get("message") or "").strip()):
            raise HTTPException(
                status_code=409,
                detail="Worker has not responded yet. Please wait for the worker's side.",
            )
        from services.trust_service import run_hifazat_dispute_evaluation

        hif_res = await run_hifazat_dispute_evaluation(dispute_id)
        if hif_res.get("agent_log"):
            agent_logs.append(hif_res["agent_log"])
        await update_dispute(dispute_id, {"status": "under_review"})
        dispute = await get_dispute(dispute_id) or dispute
        status = (dispute.get("status") or "under_review").lower()

    if status != "under_review":
        raise HTTPException(
            status_code=409,
            detail=f"Dispute cannot be finalized while status is '{status}'",
        )

    if not dispute.get("hifazat_evaluation"):
        try:
            from services.trust_service import run_hifazat_dispute_evaluation

            hif_res = await run_hifazat_dispute_evaluation(dispute_id)
            if hif_res.get("agent_log"):
                agent_logs.append(hif_res["agent_log"])
            dispute = await get_dispute(dispute_id) or dispute
        except Exception as exc:
            print(f"[HIFAZAT] pre-finalize eval failed: {exc}")

    hifazat = dispute.get("hifazat_evaluation") or {}
    booking_id = (dispute.get("booking_id") or "").strip()
    booking = await get_booking(booking_id) if booking_id else {}
    booking = booking or {}

    dtype = normalize_dispute_type(dispute.get("type") or dispute.get("dispute_type"))
    description = _build_jhagra_description(dispute)
    evidence_url = dispute.get("evidence_url")

    jhagra_result = await run_dispute(
        booking_id=booking_id,
        dispute_type=dtype,
        description=description,
        evidence_url=evidence_url,
    )
    jhagra_log = jhagra_result.get("agent_log")
    if jhagra_log:
        agent_logs.append(jhagra_log)
    jhagra_result = _apply_hifazat_to_jhagra(
        jhagra_result, dispute=dispute, booking=booking, hifazat=hifazat
    )

    escalated = bool(jhagra_result.get("escalated_to_human"))
    final_status = "escalated" if escalated else "resolved"
    if not can_transition_dispute_status("under_review", final_status):
        final_status = "resolved"

    resolved_at = datetime.now().isoformat()
    await update_dispute(
        dispute_id,
        {
            "status": final_status,
            "resolution": jhagra_result.get("resolution", ""),
            "refund_amount": int(jhagra_result.get("refund_amount") or 0),
            "provider_penalty": jhagra_result.get("provider_penalty", "none"),
            "escalated_to_human": escalated,
            "case_summary": jhagra_result.get("case_summary", ""),
            "resolved_at": resolved_at,
            "jhagra_resolution": {
                k: v
                for k, v in jhagra_result.items()
                if not str(k).startswith("_")
            },
        },
    )

    refund_amount = int(jhagra_result.get("refund_amount") or 0)
    if _should_mark_booking_disputed(
        refund_amount=refund_amount,
        escalated=escalated,
        hifazat=hifazat,
    ):
        await ensure_booking_disputed(booking_id)

    customer_notify = dispute_uid or owner_uid
    if booking and customer_notify:
        await notify_dispute_resolved(
            booking,
            customer_notify,
            dispute_id=dispute_id,
            dispute_status=final_status,
            refund_amount=refund_amount,
        )

    updated = await get_dispute(dispute_id) or dispute
    response = _finalize_response_from_doc(updated, dispute_id, jhagra_extra=jhagra_result)
    response["_agent_logs"] = agent_logs
    return response


def _finalize_response_from_doc(
    dispute: Dict[str, Any],
    dispute_id: str,
    *,
    jhagra_extra: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    dtype = normalize_dispute_type(dispute.get("type") or dispute.get("dispute_type"))
    hifazat = dispute.get("hifazat_evaluation") or {}

    if jhagra_extra is not None:
        escalated = bool(jhagra_extra.get("escalated_to_human"))
        status = "escalated" if escalated else "resolved"
        return {
            "booking_id": dispute.get("booking_id", ""),
            "dispute_type": dtype,
            "dispute_id": dispute_id,
            "dispute_status": status,
            "resolution": jhagra_extra.get("resolution", ""),
            "refund_amount": int(jhagra_extra.get("refund_amount") or 0),
            "provider_penalty": jhagra_extra.get("provider_penalty", "none"),
            "case_summary": jhagra_extra.get("case_summary", ""),
            "escalated_to_human": escalated,
            "hifazat_summary": {
                "complaint_verdict": hifazat.get("complaint_verdict"),
                "recommended_action": hifazat.get("recommended_action"),
                "trust_score": hifazat.get("trust_score"),
            },
            "already_finalized": False,
            "repeat_allowed": True,
        }

    status = (dispute.get("status") or "resolved").lower()
    return {
        "booking_id": dispute.get("booking_id", ""),
        "dispute_type": dtype,
        "dispute_id": dispute_id,
        "dispute_status": status,
        "resolution": dispute.get("resolution", ""),
        "refund_amount": int(dispute.get("refund_amount") or 0),
        "provider_penalty": dispute.get("provider_penalty", "none"),
        "case_summary": dispute.get("case_summary", ""),
        "escalated_to_human": bool(dispute.get("escalated_to_human")),
        "hifazat_summary": {
            "complaint_verdict": hifazat.get("complaint_verdict"),
            "recommended_action": hifazat.get("recommended_action"),
            "trust_score": hifazat.get("trust_score"),
        },
        "already_finalized": True,
        "repeat_allowed": True,
    }
