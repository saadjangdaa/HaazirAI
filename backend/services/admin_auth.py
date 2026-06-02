"""Firebase token verification and RBAC for admin portal."""
from __future__ import annotations

import os
from typing import Callable, Optional, Set

from fastapi import Depends, Header, HTTPException

from backend.models.admin import AdminAuthContext, AdminRole

# Section → allowed roles (super_admin always included via ALL)
ROLE_PERMISSIONS: dict[str, Set[AdminRole]] = {
    "dashboard": {"super_admin", "provider_manager", "dispute_manager", "analytics_manager", "viewer"},
    "providers": {"super_admin", "provider_manager", "viewer"},
    "providers_write": {"super_admin", "provider_manager"},
    "disputes": {"super_admin", "dispute_manager", "viewer"},
    "disputes_write": {"super_admin", "dispute_manager"},
    "analytics": {"super_admin", "analytics_manager", "viewer"},
    "admin_users": {"super_admin"},
    "audit_log": {"super_admin", "viewer"},
}

_DEV_BYPASS_UID = os.getenv("ADMIN_DEV_UID", "").strip()
_DEV_BYPASS_ROLE: AdminRole = "super_admin"  # type: ignore[assignment]


async def _lookup_admin(uid: str, email: str = "") -> Optional[AdminAuthContext]:
    from backend.services.admin_service import get_admin_user_by_uid

    doc = await get_admin_user_by_uid(uid)
    if not doc:
        return None
    if not doc.get("active", True):
        return None
    return AdminAuthContext(
        uid=uid,
        email=doc.get("email") or email,
        name=doc.get("name") or "",
        role=doc.get("role") or "viewer",
    )


def _verify_firebase_token(token: str) -> tuple[str, str]:
    import firebase_admin
    from firebase_admin import auth as fb_auth

    if not firebase_admin._apps:
        raise HTTPException(status_code=503, detail="Firebase Admin not initialized")
    try:
        decoded = fb_auth.verify_id_token(token)
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired token") from exc
    uid = (decoded.get("uid") or "").strip()
    email = (decoded.get("email") or "").strip()
    if not uid:
        raise HTTPException(status_code=401, detail="Token missing uid")
    return uid, email


async def get_current_admin(
    authorization: Optional[str] = Header(None),
    x_admin_uid: Optional[str] = Header(None, alias="X-Admin-Uid"),
) -> AdminAuthContext:
    """Resolve admin from Bearer token; dev fallback via X-Admin-Uid when ENV=development."""
    uid: Optional[str] = None
    email = ""

    dev_uid_cfg = _DEV_BYPASS_UID or "dev_super_admin"

    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
        if token:
            uid, email = _verify_firebase_token(token)
    else:
        header_uid = (x_admin_uid or "").strip()
        if header_uid and header_uid == dev_uid_cfg:
            uid = header_uid
        elif os.getenv("ENVIRONMENT", "development") == "development":
            bypass = (x_admin_uid or dev_uid_cfg).strip()
            if bypass:
                uid = bypass

    if not uid:
        raise HTTPException(status_code=401, detail="Admin authentication required")

    admin = await _lookup_admin(uid, email)
    if admin:
        return admin

    if uid == dev_uid_cfg:
        return AdminAuthContext(uid=uid, email=email or "admin@haazir.dev", name="Dev Admin", role=_DEV_BYPASS_ROLE)

    raise HTTPException(status_code=403, detail="Not registered as an admin user")


def require_permission(section: str, write: bool = False) -> Callable:
    key = f"{section}_write" if write else section

    async def _dep(admin: AdminAuthContext = Depends(get_current_admin)) -> AdminAuthContext:
        allowed = ROLE_PERMISSIONS.get(key) or ROLE_PERMISSIONS.get(section, set())
        if admin.role not in allowed and admin.role != "super_admin":
            raise HTTPException(status_code=403, detail=f"Insufficient permissions for {section}")
        return admin

    return _dep
