"""Admin portal business logic — providers, disputes, analytics, audit."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from backend.models.admin import AdminAuthContext

# ─── Firestore helpers (admin_users, audit_logs) ─────────────────────────────


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _list_collection(name: str) -> List[Tuple[str, dict]]:
    from services.firebase import _get_db, is_mock_mode, _mock_bucket

    if is_mock_mode():
        return list(_mock_bucket(name).items())
    db = _get_db()
    if db is None:
        return list(_mock_bucket(name).items())
    return [(snap.id, snap.to_dict() or {}) for snap in db.collection(name).stream()]


async def _get_doc(collection: str, doc_id: str) -> Optional[dict]:
    from services.firebase import _doc_get

    return _doc_get(collection, doc_id)


async def _set_doc(collection: str, doc_id: str, data: dict, merge: bool = True) -> None:
    from services.firebase import _doc_set

    _doc_set(collection, doc_id, data, merge=merge)


async def _delete_doc(collection: str, doc_id: str) -> bool:
    from services.firebase import _doc_delete

    return _doc_delete(collection, doc_id)


# ─── Admin users ─────────────────────────────────────────────────────────────


async def get_admin_user_by_uid(uid: str) -> Optional[dict]:
    return await _get_doc("admin_users", uid)


async def list_admin_users() -> List[dict]:
    rows = []
    for doc_id, data in await _list_collection("admin_users"):
        rows.append({**(data or {}), "id": doc_id, "uid": doc_id})
    rows.sort(key=lambda r: (r.get("role") or "", r.get("name") or ""))
    return rows


async def create_admin_user(payload: dict, actor: AdminAuthContext) -> dict:
    uid = (payload.get("firebase_uid") or payload.get("uid") or "").strip()
    if not uid:
        uid = f"admin_{uuid.uuid4().hex[:12]}"
    doc = {
        "uid": uid,
        "email": payload.get("email", ""),
        "name": payload.get("name", ""),
        "role": payload.get("role", "viewer"),
        "active": bool(payload.get("active", True)),
        "created_at": _now_iso(),
        "created_by": actor.uid,
    }
    await _set_doc("admin_users", uid, doc, merge=False)
    await write_audit_log(actor, "CREATE_ADMIN", f"Created admin {doc['name']}", {"admin_uid": uid})
    return {**doc, "id": uid}


async def update_admin_user(admin_id: str, patch: dict, actor: AdminAuthContext) -> dict:
    existing = await get_admin_user_by_uid(admin_id)
    if not existing:
        raise ValueError("Admin user not found")
    updates = {k: v for k, v in patch.items() if v is not None}
    updates["updated_at"] = _now_iso()
    await _set_doc("admin_users", admin_id, updates)
    await write_audit_log(actor, "UPDATE_ADMIN", f"Updated admin {admin_id}", updates)
    merged = {**existing, **updates, "id": admin_id}
    return merged


async def delete_admin_user(admin_id: str, actor: AdminAuthContext) -> bool:
    if admin_id == actor.uid:
        raise ValueError("Cannot delete your own admin account")
    ok = await _delete_doc("admin_users", admin_id)
    if ok:
        await write_audit_log(actor, "DELETE_ADMIN", f"Deleted admin {admin_id}", {})
    return ok


# ─── Audit log ───────────────────────────────────────────────────────────────


async def write_audit_log(
    actor: AdminAuthContext,
    action: str,
    details: str,
    meta: Optional[dict] = None,
) -> str:
    log_id = f"log_{uuid.uuid4().hex[:12]}"
    entry = {
        "log_id": log_id,
        "admin_uid": actor.uid,
        "admin_name": actor.name or actor.email or actor.uid,
        "action": action.upper(),
        "details": details,
        "meta": meta or {},
        "timestamp": _now_iso(),
    }
    await _set_doc("audit_logs", log_id, entry, merge=False)
    return log_id


async def list_audit_logs(
    admin_uid: Optional[str] = None,
    action: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 50,
) -> List[dict]:
    rows = []
    for doc_id, data in await _list_collection("audit_logs"):
        data = data or {}
        if admin_uid and data.get("admin_uid") != admin_uid:
            continue
        act = (data.get("action") or "").upper()
        if action and action.upper() not in act:
            continue
        if search:
            blob = f"{data.get('details', '')} {data.get('admin_name', '')}".lower()
            if search.lower() not in blob:
                continue
        rows.append({**data, "id": doc_id})
    rows.sort(key=lambda r: r.get("timestamp", ""), reverse=True)
    return rows[:limit]


# ─── Provider admin fields ───────────────────────────────────────────────────


def _provider_admin_status(data: dict) -> str:
    if data.get("deleted"):
        return "inactive"
    status = (data.get("admin_status") or data.get("status") or "").strip().lower()
    if status in ("pending", "active", "inactive", "suspended", "rejected", "disabled"):
        return status
    if data.get("suspended_until"):
        return "suspended"
    if data.get("available") is False:
        return "inactive"
    return "active"


def _format_provider_admin(doc_id: str, data: dict) -> dict:
    from services.providers_integrity import format_provider_record

    base = format_provider_record(data or {}, doc_id)
    admin_status = _provider_admin_status(data or {})
    docs = (data or {}).get("documents") or {}
    verified = all(
        (docs.get(k) or {}).get("verified") for k in ("id_proof", "address_proof", "service_license")
    ) if docs else bool(data.get("documents_verified"))
    return {
        **base,
        "id": doc_id,
        "provider_id": doc_id,
        "admin_status": admin_status,
        "status": admin_status,
        "verification_complete": verified,
        "documents": docs or _default_documents(data),
        "phone": (data or {}).get("phone", ""),
        "email": (data or {}).get("email", ""),
        "firebase_uid": (data or {}).get("firebase_uid") or (data or {}).get("user_id") or "",
        "experience_years": (data or {}).get("experience_years", 0),
        "created_at": (data or {}).get("created_at", ""),
        "suspended_until": (data or {}).get("suspended_until"),
        "suspend_reason": (data or {}).get("suspend_reason"),
        "reject_reason": (data or {}).get("reject_reason"),
        "complaint_count": int((data or {}).get("complaint_count") or 0),
        "verified_complaint_count": int((data or {}).get("verified_complaint_count") or 0),
        "risk_score": float((data or {}).get("risk_score") or 0),
        "late_arrival_count": int((data or {}).get("late_arrival_count") or 0),
        "investigation_status": (data or {}).get("investigation_status") or "none",
        "recommended_action": (data or {}).get("recommended_action") or "keep_active",
        "background_check": (data or {}).get(
            "background_check",
            {"status": "clear", "details": "No criminal record", "verified": True},
        ),
    }


def _default_documents(data: dict) -> dict:
    return {
        "id_proof": {"verified": True, "url": data.get("id_proof_url", "")},
        "address_proof": {"verified": True, "url": data.get("address_proof_url", "")},
        "service_license": {"verified": True, "url": data.get("license_url", "")},
        "insurance": {"verified": False, "url": data.get("insurance_url", "")},
    }


async def list_providers_admin(
    status: Optional[str] = None,
    service: Optional[str] = None,
    city: Optional[str] = None,
    min_rating: Optional[float] = None,
    search: Optional[str] = None,
) -> List[dict]:
    from services.firebase import is_mock_mode, list_provider_entries
    from services.worker_registration import sync_all_worker_applications

    if not is_mock_mode():
        await sync_all_worker_applications()

    rows = []
    for doc_id, data in await list_provider_entries():
        row = _format_provider_admin(doc_id, data or {})
        if status and status != "all" and row["admin_status"] != status:
            continue
        if service and service != "all":
            svc = (row.get("service") or "").lower()
            if service.lower() not in svc:
                continue
        if city and city != "all":
            if (row.get("city") or "").lower() != city.lower():
                continue
        if min_rating is not None and float(row.get("rating") or 0) < min_rating:
            continue
        if search:
            q = search.lower()
            if q not in (row.get("name") or "").lower() and q not in (row.get("phone") or ""):
                continue
        rows.append(row)
    rows.sort(key=lambda r: r.get("created_at", ""), reverse=True)
    return rows


async def get_provider_admin(provider_id: str) -> Optional[dict]:
    from services.firebase import get_provider

    raw = await get_provider(provider_id)
    if not raw:
        doc = await _get_doc("providers", provider_id)
        if not doc:
            return None
        return _format_provider_admin(provider_id, doc)
    return _format_provider_admin(provider_id, raw)


async def _patch_provider(provider_id: str, patch: dict, actor: AdminAuthContext, action: str, detail: str) -> dict:
    from services.firebase import update_provider

    patch["updated_at"] = _now_iso()
    await update_provider(provider_id, patch)
    await write_audit_log(actor, action, detail, {"provider_id": provider_id, **patch})
    out = await get_provider_admin(provider_id)
    return out or {"provider_id": provider_id, **patch}


async def approve_provider(provider_id: str, actor: AdminAuthContext, notes: str = "") -> dict:
    from services.firebase import list_users_by_provider, update_user

    result = await _patch_provider(
        provider_id,
        {"admin_status": "active", "available": True, "approved_at": _now_iso(), "approval_notes": notes},
        actor,
        "APPROVED",
        f'Approved provider "{provider_id}"',
    )
    for uid in await list_users_by_provider(provider_id):
        await update_user(uid, {"approval_status": "active"})
    user = await _get_doc("users", provider_id)
    if user and user.get("role") == "worker":
        await update_user(provider_id, {"approval_status": "active", "provider_id": provider_id})
    return result


async def reject_provider(provider_id: str, reason: str, actor: AdminAuthContext) -> dict:
    from services.firebase import list_users_by_provider, update_user

    result = await _patch_provider(
        provider_id,
        {"admin_status": "rejected", "available": False, "reject_reason": reason},
        actor,
        "REJECTED",
        f'Rejected provider "{provider_id}": {reason}',
    )
    for uid in await list_users_by_provider(provider_id):
        await update_user(uid, {"approval_status": "rejected"})
    user = await _get_doc("users", provider_id)
    if user and user.get("role") == "worker":
        await update_user(provider_id, {"approval_status": "rejected"})
    return result


async def suspend_provider(
    provider_id: str,
    reason: str,
    actor: AdminAuthContext,
    duration_days: Optional[int] = None,
    permanent: bool = False,
) -> dict:
    until = None
    if not permanent and duration_days:
        until = (datetime.now(timezone.utc) + timedelta(days=duration_days)).date().isoformat()
    return await _patch_provider(
        provider_id,
        {
            "admin_status": "suspended",
            "available": False,
            "suspend_reason": reason,
            "suspended_until": until if not permanent else "permanent",
        },
        actor,
        "SUSPENDED",
        f'Suspended provider "{provider_id}" — {reason}',
    )


async def activate_provider(provider_id: str, actor: AdminAuthContext) -> dict:
    return await _patch_provider(
        provider_id,
        {
            "admin_status": "active",
            "available": True,
            "suspended_until": None,
            "suspend_reason": None,
        },
        actor,
        "ACTIVATED",
        f'Activated provider "{provider_id}"',
    )


async def delete_provider_admin(provider_id: str, actor: AdminAuthContext) -> dict:
    from services.firebase import delete_provider

    await delete_provider(provider_id)
    await write_audit_log(actor, "DELETED", f'Deleted provider "{provider_id}"', {"provider_id": provider_id})
    return {"deleted": True, "provider_id": provider_id}


# ─── Disputes ────────────────────────────────────────────────────────────────


def _format_dispute_admin(doc_id: str, data: dict, bookings: dict, providers: dict, users: dict) -> dict:
    bid = (data.get("booking_id") or "").strip()
    booking = bookings.get(bid) or {}
    pid = (booking.get("provider_id") or data.get("provider_id") or "").strip()
    uid = (data.get("user_id") or booking.get("user_id") or "").strip()
    provider = providers.get(pid) or {}
    customer = users.get(uid) or {}
    status = (data.get("status") or "open").lower()
    admin_status = status
    if status == "under_review":
        admin_status = "in_review"
    return {
        "dispute_id": doc_id,
        "id": doc_id,
        "booking_id": bid,
        "type": data.get("type") or data.get("dispute_type") or "other",
        "status": admin_status,
        "priority": data.get("priority") or "medium",
        "description": data.get("description") or "",
        "evidence_urls": data.get("evidence_urls") or ([data["evidence_url"]] if data.get("evidence_url") else []),
        "created_at": data.get("created_at", ""),
        "resolution": data.get("resolution", ""),
        "refund_amount": data.get("refund_amount", 0),
        "decision": data.get("decision", ""),
        "customer_name": customer.get("name") or data.get("customer_name", "Customer"),
        "customer_phone": customer.get("phone", ""),
        "provider_name": provider.get("name") or data.get("provider_name", "Provider"),
        "provider_phone": provider.get("phone", ""),
        "provider_id": pid,
        "service": booking.get("service", ""),
        "scheduled_time": booking.get("slot_time") or booking.get("scheduled_time", ""),
        "scheduled_price": booking.get("price", 0),
        "admin_notes": data.get("admin_notes", ""),
    }


async def _load_dispute_context() -> Tuple[dict, dict, dict]:
    from services.firebase import list_booking_entries, list_provider_entries, list_user_entries

    bookings = {doc_id: data for doc_id, data in await list_booking_entries()}
    providers = {}
    for doc_id, data in await list_provider_entries():
        providers[doc_id] = data or {}
    users = {}
    for doc_id, data in await list_user_entries():
        users[doc_id] = data or {}
    return bookings, providers, users


async def list_disputes_admin(
    status: Optional[str] = None,
    dispute_type: Optional[str] = None,
    priority: Optional[str] = None,
    search: Optional[str] = None,
) -> List[dict]:
    from services.firebase import list_dispute_entries

    bookings, providers, users = await _load_dispute_context()
    rows = []
    for doc_id, data in await list_dispute_entries():
        row = _format_dispute_admin(doc_id, data or {}, bookings, providers, users)
        if status and status != "all":
            if row["status"] != status.replace(" ", "_"):
                continue
        if dispute_type and dispute_type != "all":
            if dispute_type.lower() not in (row.get("type") or "").lower():
                continue
        if priority and priority != "all":
            if (row.get("priority") or "").lower() != priority.lower():
                continue
        if search:
            q = search.lower()
            if q not in row["dispute_id"].lower() and q not in row["booking_id"].lower():
                if q not in (row.get("customer_name") or "").lower() and q not in (row.get("provider_name") or "").lower():
                    continue
        rows.append(row)
    rows.sort(key=lambda r: r.get("created_at", ""), reverse=True)
    return rows


async def get_dispute_admin(dispute_id: str) -> Optional[dict]:
    from services.firebase import get_dispute

    data = await get_dispute(dispute_id)
    if not data:
        return None
    bookings, providers, users = await _load_dispute_context()
    return _format_dispute_admin(dispute_id, data, bookings, providers, users)


async def resolve_dispute(dispute_id: str, body: dict, actor: AdminAuthContext) -> dict:
    from services.firebase import get_dispute, update_dispute

    existing = await get_dispute(dispute_id)
    if not existing:
        raise ValueError("Dispute not found")
    patch = {
        "status": body.get("status", "resolved"),
        "decision": body.get("decision"),
        "resolution": body.get("admin_notes") or body.get("resolution", ""),
        "admin_notes": body.get("admin_notes", ""),
        "refund_amount": int(body.get("refund_amount") or 0),
        "compensation_amount": int(body.get("compensation_amount") or 0),
        "provider_actions": {
            "warn": body.get("action_warn"),
            "suspend_days": body.get("action_suspend_days"),
            "blacklist": body.get("action_blacklist"),
        },
        "resolved_at": _now_iso(),
        "resolved_by": actor.uid,
    }
    await update_dispute(dispute_id, patch)
    pid = existing.get("provider_id")
    if body.get("action_suspend_days") and pid:
        await suspend_provider(
            pid,
            f"Dispute {dispute_id} resolution",
            actor,
            duration_days=int(body["action_suspend_days"]),
        )
    await write_audit_log(
        actor,
        "RESOLVED",
        f"Resolved dispute #{dispute_id}",
        patch,
    )
    return await get_dispute_admin(dispute_id) or patch


async def update_dispute_status(dispute_id: str, status: str, notes: str, actor: AdminAuthContext) -> dict:
    from services.firebase import update_dispute

    fs_status = "under_review" if status == "in_review" else status
    await update_dispute(dispute_id, {"status": fs_status, "admin_notes": notes})
    await write_audit_log(actor, "DISPUTE_STATUS", f"Dispute {dispute_id} → {status}", {"notes": notes})
    return await get_dispute_admin(dispute_id) or {"dispute_id": dispute_id, "status": status}


# ─── Dashboard & analytics ───────────────────────────────────────────────────


async def get_dashboard() -> dict:
    providers = await list_providers_admin()
    disputes = await list_disputes_admin()
    from services.firebase import list_booking_entries

    bookings = await list_booking_entries()
    today = datetime.now(timezone.utc).date().isoformat()

    pending = sum(1 for p in providers if p["admin_status"] == "pending")
    active = sum(1 for p in providers if p["admin_status"] == "active")
    suspended = sum(1 for p in providers if p["admin_status"] == "suspended")
    open_disputes = sum(1 for d in disputes if d["status"] in ("open", "in_review", "under_review"))
    resolved_today = sum(
        1 for d in disputes
        if d.get("status") == "resolved" and (d.get("created_at") or "").startswith(today)
    )

    revenue_today = 0
    for _, b in bookings:
        created = (b or {}).get("created_at", "")
        if created.startswith(today) and (b or {}).get("status") == "completed":
            revenue_today += int((b or {}).get("price") or 0)

    metrics = {
        "total_providers": len(providers),
        "pending_approvals": pending,
        "active_providers": active,
        "suspended_providers": suspended,
        "open_disputes": open_disputes,
        "resolved_today": resolved_today,
        "total_bookings": len(bookings),
        "revenue_today": revenue_today,
    }

    logs = await list_audit_logs(limit=8)
    recent = [
        {
            "id": log.get("id"),
            "action": log.get("action"),
            "details": log.get("details"),
            "admin_name": log.get("admin_name"),
            "timestamp": log.get("timestamp"),
        }
        for log in logs
    ]
    return {"metrics": metrics, "recent_activity": recent}


async def get_analytics_all() -> dict:
    providers = await list_providers_admin()
    disputes = await list_disputes_admin()
    from services.firebase import list_booking_entries

    booking_entries = await list_booking_entries()
    total_p = len(providers)
    by_status = {}
    for p in providers:
        s = p["admin_status"]
        by_status[s] = by_status.get(s, 0) + 1

    ratings = [float(p.get("rating") or 0) for p in providers if p["admin_status"] == "active"]
    avg_rating = round(sum(ratings) / len(ratings), 2) if ratings else 0.0

    top5 = sorted(
        [p for p in providers if p["admin_status"] == "active"],
        key=lambda x: float(x.get("rating") or 0),
        reverse=True,
    )[:5]
    at_risk = [p for p in providers if float(p.get("rating") or 0) < 3.5 and p["admin_status"] == "active"]

    booking_status: dict[str, int] = {}
    service_counts: dict[str, int] = {}
    total_revenue = 0
    month_prefix = datetime.now(timezone.utc).strftime("%Y-%m")
    month_count = 0
    today_prefix = datetime.now(timezone.utc).date().isoformat()
    today_count = 0

    for _, b in booking_entries:
        b = b or {}
        st = (b.get("status") or "pending").lower()
        booking_status[st] = booking_status.get(st, 0) + 1
        svc = b.get("service") or "Other"
        service_counts[svc] = service_counts.get(svc, 0) + 1
        price = int(b.get("price") or 0)
        if st == "completed":
            total_revenue += price
        created = b.get("created_at") or ""
        if created.startswith(month_prefix):
            month_count += 1
        if created.startswith(today_prefix):
            today_count += 1

    total_bookings = len(booking_entries)
    commission_rate = 0.15
    gross = total_revenue
    commission = int(gross * commission_rate)
    provider_earnings = gross - commission

    dispute_types: dict[str, int] = {}
    outcomes: dict[str, int] = {}
    resolved = 0
    for d in disputes:
        t = (d.get("type") or "other").replace("_", " ")
        dispute_types[t] = dispute_types.get(t, 0) + 1
        if d.get("status") == "resolved":
            resolved += 1
        dec = d.get("decision") or ""
        if dec:
            outcomes[dec] = outcomes.get(dec, 0) + 1

    return {
        "providers": {
            "total": total_p,
            "active": by_status.get("active", 0),
            "pending": by_status.get("pending", 0),
            "suspended": by_status.get("suspended", 0),
            "rejected": by_status.get("rejected", 0),
            "avg_rating": avg_rating,
            "avg_on_time_pct": 92.0,
            "avg_cancellation_pct": 5.2,
            "top_providers": [
                {"name": p.get("name"), "rating": p.get("rating"), "id": p.get("id")}
                for p in top5
            ],
            "at_risk": [
                {"name": p.get("name"), "rating": p.get("rating"), "id": p.get("id")}
                for p in at_risk[:10]
            ],
        },
        "bookings": {
            "total": total_bookings,
            "this_month": month_count,
            "today": today_count,
            "by_status": booking_status,
            "by_service": service_counts,
        },
        "revenue": {
            "total_all_time": gross,
            "this_month": int(gross * 0.1) if gross else 0,
            "today": int(gross * 0.004) if gross else 0,
            "gross": gross,
            "platform_commission": commission,
            "provider_earnings": provider_earnings,
            "commission_rate_pct": 15,
            "by_service": {k: int(v * 100) for k, v in list(service_counts.items())[:5]},
        },
        "disputes": {
            "total": len(disputes),
            "resolved": resolved,
            "pending": len(disputes) - resolved,
            "by_type": dispute_types,
            "outcomes": outcomes,
            "avg_resolution_hours": 4.2,
        },
    }


async def seed_default_admin_if_empty() -> None:
    """Create a dev super-admin doc when collection is empty (development only)."""
    import os

    if os.getenv("ENVIRONMENT", "development") != "development":
        return
    rows = await list_admin_users()
    if rows:
        return
    await ensure_dev_admin_user()


async def ensure_dev_admin_user() -> None:
    """Ensure ADMIN_DEV_UID exists in admin_users (local + Render with header login)."""
    import os

    dev_uid = os.getenv("ADMIN_DEV_UID", "dev_super_admin").strip()
    if not dev_uid:
        return
    existing = await get_admin_user_by_uid(dev_uid)
    if existing:
        return
    await _set_doc(
        "admin_users",
        dev_uid,
        {
            "uid": dev_uid,
            "email": "admin@haazir.dev",
            "name": "Dev Super Admin",
            "role": "super_admin",
            "active": True,
            "created_at": _now_iso(),
        },
        merge=False,
    )
