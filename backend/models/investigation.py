from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

ComplaintStatus = Literal["pending", "under_investigation", "resolved", "dismissed"]
InvestigationStatus = Literal["open", "awaiting_worker_defense", "analysis_complete", "admin_review", "closed"]
InvestigationRecommendation = Literal[
    "keep_active",
    "warning",
    "temporary_suspend",
    "disable_provider",
]
AdminInvestigationAction = Literal[
    "keep_active",
    "warning",
    "temporary_suspend",
    "disable_provider",
    "request_more_evidence",
]


class ComplaintCreateBody(BaseModel):
    booking_id: str
    user_id: str
    provider_id: str
    customer_statement: str = Field(..., min_length=5, max_length=2000)
    severity: str = Field(default="medium", min_length=3, max_length=20)
    evidence_url: Optional[str] = None


class WorkerDefenseBody(BaseModel):
    worker_uid: str
    statement: str = Field(..., min_length=10, max_length=3000)


class AdminInvestigationDecisionBody(BaseModel):
    action: AdminInvestigationAction
    reason: str = Field(..., min_length=3, max_length=1000)
    suspend_days: Optional[int] = Field(default=None, ge=1, le=3650)
