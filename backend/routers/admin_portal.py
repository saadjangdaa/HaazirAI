"""
Haazir AI — Admin Management Portal API.

Separate from legacy /api/admin/verify-* dev tools in main.py.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from backend.models.admin import (
    AdminUserCreate,
    AdminUserUpdate,
    DisputeResolveBody,
    DisputeStatusBody,
    ProviderApproveBody,
    ProviderRejectBody,
    ProviderSuspendBody,
)
from backend.models.investigation import AdminInvestigationDecisionBody
from backend.services import admin_service
from backend.services.admin_auth import AdminAuthContext, get_current_admin, require_permission
from backend.services.investigation_service import apply_admin_investigation_decision, list_admin_investigations

router = APIRouter(prefix="/api/admin", tags=["admin-portal"])


@router.get("/dashboard")
async def admin_dashboard(
    admin: AdminAuthContext = Depends(require_permission("dashboard")),
):
    return await admin_service.get_dashboard()


@router.get("/providers")
async def admin_list_providers(
    status: Optional[str] = Query(None),
    service: Optional[str] = Query(None),
    city: Optional[str] = Query(None),
    min_rating: Optional[float] = Query(None),
    search: Optional[str] = Query(None),
    admin: AdminAuthContext = Depends(require_permission("providers")),
):
    providers = await admin_service.list_providers_admin(status, service, city, min_rating, search)
    return {"providers": providers, "count": len(providers)}


@router.get("/providers/{provider_id}")
async def admin_get_provider(
    provider_id: str,
    admin: AdminAuthContext = Depends(require_permission("providers")),
):
    row = await admin_service.get_provider_admin(provider_id)
    if not row:
        raise HTTPException(status_code=404, detail="Provider not found")
    await admin_service.write_audit_log(admin, "VIEWED", f'Viewed provider "{provider_id}"', {"provider_id": provider_id})
    return row


@router.patch("/providers/{provider_id}/approve")
async def admin_approve_provider(
    provider_id: str,
    body: ProviderApproveBody,
    admin: AdminAuthContext = Depends(require_permission("providers", write=True)),
):
    try:
        return await admin_service.approve_provider(provider_id, admin, body.notes)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.patch("/providers/{provider_id}/reject")
async def admin_reject_provider(
    provider_id: str,
    body: ProviderRejectBody,
    admin: AdminAuthContext = Depends(require_permission("providers", write=True)),
):
    try:
        return await admin_service.reject_provider(provider_id, body.reason, admin)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.patch("/providers/{provider_id}/suspend")
async def admin_suspend_provider(
    provider_id: str,
    body: ProviderSuspendBody,
    admin: AdminAuthContext = Depends(require_permission("providers", write=True)),
):
    try:
        return await admin_service.suspend_provider(
            provider_id, body.reason, admin, body.duration_days, body.permanent
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.patch("/providers/{provider_id}/activate")
async def admin_activate_provider(
    provider_id: str,
    admin: AdminAuthContext = Depends(require_permission("providers", write=True)),
):
    try:
        return await admin_service.activate_provider(provider_id, admin)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/providers/{provider_id}")
async def admin_delete_provider(
    provider_id: str,
    admin: AdminAuthContext = Depends(require_permission("providers", write=True)),
):
    try:
        return await admin_service.delete_provider_admin(provider_id, admin)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/disputes")
async def admin_list_disputes(
    status: Optional[str] = Query(None),
    dispute_type: Optional[str] = Query(None, alias="type"),
    priority: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    admin: AdminAuthContext = Depends(require_permission("disputes")),
):
    rows = await admin_service.list_disputes_admin(status, dispute_type, priority, search)
    return {"disputes": rows, "count": len(rows)}


@router.get("/investigations")
async def admin_list_investigations(
    status: Optional[str] = Query(None),
    admin: AdminAuthContext = Depends(require_permission("disputes")),
):
    rows = await list_admin_investigations(status)
    return {"investigations": rows, "count": len(rows)}


@router.patch("/investigations/{investigation_id}/decision")
async def admin_investigation_decision(
    investigation_id: str,
    body: AdminInvestigationDecisionBody,
    admin: AdminAuthContext = Depends(require_permission("disputes", write=True)),
):
    try:
        return await apply_admin_investigation_decision(
            investigation_id=investigation_id,
            actor=admin,
            action=body.action,
            reason=body.reason,
            suspend_days=body.suspend_days,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/disputes/{dispute_id}")
async def admin_get_dispute(
    dispute_id: str,
    admin: AdminAuthContext = Depends(require_permission("disputes")),
):
    row = await admin_service.get_dispute_admin(dispute_id)
    if not row:
        raise HTTPException(status_code=404, detail="Dispute not found")
    return row


@router.patch("/disputes/{dispute_id}/resolve")
async def admin_resolve_dispute(
    dispute_id: str,
    body: DisputeResolveBody,
    admin: AdminAuthContext = Depends(require_permission("disputes", write=True)),
):
    try:
        return await admin_service.resolve_dispute(dispute_id, body.model_dump(), admin)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.patch("/disputes/{dispute_id}/status")
async def admin_dispute_status(
    dispute_id: str,
    body: DisputeStatusBody,
    admin: AdminAuthContext = Depends(require_permission("disputes", write=True)),
):
    return await admin_service.update_dispute_status(dispute_id, body.status, body.admin_notes, admin)


@router.get("/analytics/all")
async def admin_analytics(
    admin: AdminAuthContext = Depends(require_permission("analytics")),
):
    return await admin_service.get_analytics_all()


@router.get("/users")
async def admin_list_users(
    admin: AdminAuthContext = Depends(require_permission("admin_users")),
):
    users = await admin_service.list_admin_users()
    return {"users": users, "count": len(users)}


@router.post("/users")
async def admin_create_user(
    body: AdminUserCreate,
    admin: AdminAuthContext = Depends(require_permission("admin_users")),
):
    try:
        return await admin_service.create_admin_user(body.model_dump(), admin)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.patch("/users/{admin_id}")
async def admin_update_user(
    admin_id: str,
    body: AdminUserUpdate,
    admin: AdminAuthContext = Depends(require_permission("admin_users")),
):
    try:
        return await admin_service.update_admin_user(admin_id, body.model_dump(exclude_unset=True), admin)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.delete("/users/{admin_id}")
async def admin_delete_user(
    admin_id: str,
    admin: AdminAuthContext = Depends(require_permission("admin_users")),
):
    try:
        ok = await admin_service.delete_admin_user(admin_id, admin)
        return {"deleted": ok}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/audit-log")
async def admin_audit_log(
    admin_uid: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    admin: AdminAuthContext = Depends(require_permission("audit_log")),
):
    logs = await admin_service.list_audit_logs(admin_uid, action, search, limit)
    return {"logs": logs, "count": len(logs)}


@router.get("/me")
async def admin_me(admin: AdminAuthContext = Depends(get_current_admin)):
    return admin
