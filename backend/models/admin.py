"""Pydantic models for Haazir  admin management portal."""
from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field

AdminRole = Literal[
    "super_admin",
    "provider_manager",
    "dispute_manager",
    "analytics_manager",
    "viewer",
]

ProviderAdminStatus = Literal[
    "pending",
    "active",
    "inactive",
    "suspended",
    "rejected",
]

DisputeAdminStatus = Literal["open", "in_review", "resolved", "on_hold", "closed"]
DisputeDecision = Literal[
    "provider_at_fault",
    "customer_at_fault",
    "both_fault",
    "unable_to_determine",
]


class AdminAuthContext(BaseModel):
    uid: str
    email: str = ""
    name: str = ""
    role: AdminRole = "viewer"


class ProviderRejectBody(BaseModel):
    reason: str = Field(..., min_length=1, max_length=500)


class ProviderSuspendBody(BaseModel):
    reason: str = Field(..., min_length=1, max_length=200)
    duration_days: Optional[int] = Field(None, ge=0, le=3650)
    permanent: bool = False


class ProviderApproveBody(BaseModel):
    notes: str = ""


class DisputeResolveBody(BaseModel):
    decision: DisputeDecision
    refund_amount: int = Field(0, ge=0)
    compensation_amount: int = Field(0, ge=0)
    action_warn: bool = False
    action_suspend_days: int = Field(0, ge=0)
    action_blacklist: bool = False
    action_none: bool = True
    admin_notes: str = ""
    status: DisputeAdminStatus = "resolved"


class DisputeStatusBody(BaseModel):
    status: DisputeAdminStatus
    admin_notes: str = ""


class AdminUserCreate(BaseModel):
    email: str = Field(..., min_length=3)
    name: str = Field(..., min_length=1, max_length=120)
    role: AdminRole
    firebase_uid: Optional[str] = None
    active: bool = True


class AdminUserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[AdminRole] = None
    active: Optional[bool] = None


class AuditLogFilters(BaseModel):
    admin_uid: Optional[str] = None
    action: Optional[str] = None
    search: Optional[str] = None
    limit: int = Field(50, ge=1, le=200)


class ProviderListQuery(BaseModel):
    status: Optional[str] = None
    service: Optional[str] = None
    city: Optional[str] = None
    min_rating: Optional[float] = None
    search: Optional[str] = None


class DashboardResponse(BaseModel):
    metrics: Dict[str, Any]
    recent_activity: List[Dict[str, Any]]


class AnalyticsResponse(BaseModel):
    providers: Dict[str, Any]
    bookings: Dict[str, Any]
    revenue: Dict[str, Any]
    disputes: Dict[str, Any]
