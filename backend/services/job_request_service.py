"""
Job Request Service — real marketplace flow.

Lifecycle:
  Customer posts job_request (status=open)
      → DHUNDHO finds matching providers
      → Workers with matching service+city get push notifications
      → Workers submit bids via POST /api/job-requests/{id}/bid
      → Customer sees real bids, picks one
      → HISAAB + PAKKA create booking, job_request status → assigned
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from services.firebase import (
    get_job_request,
    get_user,
    list_bids_for_job,
    list_open_job_requests,
    save_bid,
    save_job_request,
    update_job_request,
)
from services.fcm import send_push

_JOB_TTL_MINUTES = 20  # job expires after 20 min if no one accepts


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _expires_at() -> str:
    return (datetime.now(timezone.utc) + timedelta(minutes=_JOB_TTL_MINUTES)).isoformat()


# ── Create job request ────────────────────────────────────────────────────────

async def create_job_request(
    *,
    customer_id: str,
    customer_name: str,
    service: str,
    location: str,
    city: str,
    urgency: str = "medium",
    description: str = "",
    estimated_price: int = 0,
) -> Dict[str, Any]:
    """Persist job_request in Firestore and return the doc."""
    request_id = f"JR-{uuid.uuid4().hex[:10].upper()}"
    doc = {
        "request_id": request_id,
        "customer_id": customer_id,
        "customer_name": customer_name,
        "service": service,
        "location": location,
        "city": city,
        "urgency": urgency,
        "description": description,
        "estimated_price": estimated_price,
        "status": "open",
        "created_at": _now_iso(),
        "expires_at": _expires_at(),
        "notified_provider_ids": [],
        "bid_count": 0,
    }
    await save_job_request(request_id, doc)
    return doc


# ── Notify matching workers ───────────────────────────────────────────────────

async def notify_matching_workers(
    job_request: Dict[str, Any],
    providers: List[Dict[str, Any]],
) -> List[str]:
    """
    For each provider in the list, find the linked worker user and send a push.
    Returns list of provider_ids that were notified.
    """
    service = job_request.get("service", "Service")
    location = job_request.get("location", "")
    city = job_request.get("city", "")
    request_id = job_request.get("request_id", "")
    estimated_price = job_request.get("estimated_price", 0)
    urgency = job_request.get("urgency", "medium")

    urgency_label = {"high": "ZARURI", "critical": "BAHUT ZARURI"}.get(urgency, "")
    title = f"{'🚨 ' if urgency_label else '🔔 '}Naya Kaam — {service}"
    body = (
        f"{location}, {city} • "
        f"~Rs {estimated_price:,} • "
        f"Bid lagaen!"
    )

    notified: List[str] = []
    for provider in providers:
        provider_id = provider.get("id") or provider.get("provider_id") or ""
        if not provider_id:
            continue

        # Find the worker user linked to this provider
        worker_uid = await _find_worker_uid(provider_id)
        if not worker_uid:
            continue

        user = await get_user(worker_uid)
        if not user:
            continue

        push_token = (user.get("push_token") or "").strip()
        if push_token:
            await send_push(
                push_token,
                title,
                body,
                data={
                    "type": "new_job_request",
                    "job_request_id": request_id,
                    "service": service,
                    "city": city,
                },
            )
            print(f"[JobRequest] Notified worker uid={worker_uid} provider={provider_id}")
        else:
            print(f"[JobRequest] No push_token for worker uid={worker_uid} provider={provider_id}")

        notified.append(provider_id)

    # Update job_request with notified list
    if notified:
        await update_job_request(request_id, {
            "notified_provider_ids": notified,
            "status": "open",
        })

    return notified


def _skill_matches_service(worker_skills: List[str], job_service: str) -> bool:
    """Flexible match: AC Repair skill matches AC technician job (share 'ac')."""
    js = (job_service or "").lower().strip()
    js_words = set(js.split())
    for skill in (worker_skills or []):
        sk = skill.lower().strip()
        if sk in js or js in sk:
            return True
        if js_words & set(sk.split()):
            return True
    return False


async def notify_all_workers_by_service(job_request: Dict[str, Any]) -> List[str]:
    """
    Scan ALL worker users in Firestore and notify those whose skills match
    the job service + city. This catches workers not in providers.json.
    """
    from services.firebase import _query_all
    service = job_request.get("service", "")
    city = (job_request.get("city") or "").lower().strip()
    request_id = job_request.get("request_id", "")
    estimated_price = job_request.get("estimated_price", 0)
    location = job_request.get("location", "")
    urgency = job_request.get("urgency", "medium")

    urgency_label = {"high": "ZARURI", "critical": "BAHUT ZARURI"}.get(urgency, "")
    title = f"{'🚨 ' if urgency_label else '🔔 '}Naya Kaam — {service}"
    body = f"{location}, {city.title()} • ~Rs {estimated_price:,} • Bid lagaen!"

    users = _query_all("users")
    notified_uids: List[str] = []

    for u in users:
        if u.get("role") != "worker":
            continue
        uid = (u.get("user_id") or u.get("uid") or "").strip()
        approval = (u.get("approval_status") or "").strip().lower()
        if approval and approval != "active":
            continue
        if not approval and uid:
            from services.worker_registration import get_worker_approval_status

            if await get_worker_approval_status(uid) != "active":
                continue
        # City match (loose)
        w_city = (u.get("city") or "").lower().strip()
        if city and w_city and w_city != city:
            continue
        # Skill match
        skills = u.get("skills") or []
        if not _skill_matches_service(skills, service):
            continue

        if not uid:
            continue
        push_token = (u.get("push_token") or "").strip()
        if push_token:
            await send_push(
                push_token, title, body,
                data={"type": "new_job_request", "job_request_id": request_id,
                      "service": service, "city": city},
            )
        print(f"[JobRequest] Notified worker uid={uid} skills={skills[:2]} city={w_city}")
        notified_uids.append(uid)

    return notified_uids


async def _find_worker_uid(provider_id: str) -> Optional[str]:
    """Find Firebase UID of worker linked to this provider_id."""
    from services.firebase import _query_all
    rows = _query_all("users")
    for u in rows:
        if u.get("role") != "worker":
            continue
        if (u.get("provider_id") or "").strip() == provider_id:
            uid = (u.get("user_id") or u.get("uid") or "").strip()
            if uid:
                return uid
    return None


# ── Submit worker bid ─────────────────────────────────────────────────────────

async def submit_bid(
    *,
    job_request_id: str,
    worker_id: str,
    provider_id: str,
    provider_name: str,
    price: int,
    eta_minutes: int = 30,
    message: str = "",
    rating: float = 0.0,
) -> Dict[str, Any]:
    """Worker submits a bid on a job request."""
    from services.worker_registration import require_approved_worker

    await require_approved_worker(worker_id)

    job = await get_job_request(job_request_id)
    if not job:
        raise ValueError(f"Job request {job_request_id} not found")
    if job.get("status") not in ("open", "bidding"):
        raise ValueError(f"Job request {job_request_id} is not accepting bids (status={job.get('status')})")

    bid_id = f"BID-{uuid.uuid4().hex[:10].upper()}"
    doc = {
        "bid_id": bid_id,
        "job_request_id": job_request_id,
        "worker_id": worker_id,
        "provider_id": provider_id,
        "provider_name": provider_name,
        "price": price,
        "eta_minutes": eta_minutes,
        "message": message or f"Main {eta_minutes} minute mein pahunch sakta hoon.",
        "rating": rating,
        "status": "pending",
        "created_at": _now_iso(),
    }
    await save_bid(bid_id, doc)

    # Update job_request status → bidding + increment bid_count
    current_count = int(job.get("bid_count") or 0)
    await update_job_request(job_request_id, {
        "status": "bidding",
        "bid_count": current_count + 1,
    })

    # Notify customer that a new bid arrived
    customer_id = job.get("customer_id", "")
    if customer_id:
        customer = await get_user(customer_id)
        token = (customer or {}).get("push_token", "")
        if token:
            await send_push(
                token,
                f"💰 Naya Bid — {provider_name}",
                f"Rs {price:,} • ETA {eta_minutes} min",
                data={
                    "type": "new_bid",
                    "job_request_id": job_request_id,
                    "bid_id": bid_id,
                },
            )

    return doc


# ── Accept bid → create booking ───────────────────────────────────────────────

async def accept_bid(
    *,
    job_request_id: str,
    bid_id: str,
    customer_id: str,
) -> Dict[str, Any]:
    """
    Customer accepts a bid.
    - Marks accepted bid status=accepted
    - Marks all other bids status=rejected
    - Updates job_request status=assigned
    Returns the accepted bid dict (caller creates booking via PAKKA).
    """
    job = await get_job_request(job_request_id)
    if not job:
        raise ValueError(f"Job request {job_request_id} not found")
    if job.get("customer_id") != customer_id:
        raise ValueError("Only the customer who posted the job can accept a bid")

    all_bids = await list_bids_for_job(job_request_id)
    accepted_doc: Optional[Dict[str, Any]] = None

    for bid in all_bids:
        this_id = bid.get("bid_id", "")
        if this_id == bid_id:
            await update_bid(this_id, {"status": "accepted"})
            accepted_doc = {**bid, "status": "accepted"}
        elif bid.get("status") == "pending":
            await update_bid(this_id, {"status": "rejected"})
            # Notify losing workers
            loser_uid = bid.get("worker_id", "")
            if loser_uid:
                user = await get_user(loser_uid)
                token = (user or {}).get("push_token", "")
                if token:
                    await send_push(
                        token,
                        "Job kisi aur ko mil gayi",
                        f"{job.get('service','Service')} ki booking confirm ho gayi",
                        data={"type": "bid_rejected", "job_request_id": job_request_id},
                    )

    if not accepted_doc:
        raise ValueError(f"Bid {bid_id} not found in job {job_request_id}")

    await update_job_request(job_request_id, {"status": "assigned"})

    # Notify winning worker
    winner_uid = accepted_doc.get("worker_id", "")
    if winner_uid:
        user = await get_user(winner_uid)
        token = (user or {}).get("push_token", "")
        if token:
            await send_push(
                token,
                "🎉 Tumhari bid accept ho gayi!",
                f"{job.get('location','')}, {job.get('city','')} — Rs {accepted_doc.get('price',0):,}",
                data={
                    "type": "bid_accepted",
                    "job_request_id": job_request_id,
                    "bid_id": bid_id,
                },
            )

    return accepted_doc


# ── Get available jobs for a worker ──────────────────────────────────────────

async def get_available_jobs_for_worker(
    worker_id: str,
    service: str = "",
    city: str = "",
) -> List[Dict[str, Any]]:
    """
    Open job requests where the worker hasn't already bid,
    filtered by service + city.
    """
    all_open = await list_open_job_requests(service=service, city=city)
    worker_bids = await list_bids_by_worker(worker_id)
    already_bid_ids = {b.get("job_request_id") for b in worker_bids}
    return [j for j in all_open if j.get("request_id") not in already_bid_ids]


async def list_bids_by_worker(worker_id: str) -> List[Dict[str, Any]]:
    from services.firebase import list_bids_by_worker as _fb_list
    return await _fb_list(worker_id)
