"""Phase E — finalize dispute (HIFAZAT + JHAGRA)."""
import asyncio
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from services.dispute_service import _apply_hifazat_to_jhagra, finalize_dispute


def test_apply_hifazat_rude_behavior_zero_refund():
    result = _apply_hifazat_to_jhagra(
        {"resolution": "x", "refund_amount": 500, "provider_penalty": "none"},
        dispute={"type": "rude_behavior"},
        booking={"price": 2000},
        hifazat={"complaint_verdict": "valid", "recommended_action": "warn_worker"},
    )
    assert result["refund_amount"] == 0


def test_finalize_requires_worker_response(monkeypatch):
    monkeypatch.setattr(
        "services.dispute_service.get_dispute",
        AsyncMock(
            return_value={
                "dispute_id": "D1",
                "user_id": "abcdefghijklmnopqrstuvwxyz12",
                "status": "open",
                "booking_id": "B1",
                "type": "quality_complaint",
            }
        ),
    )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            finalize_dispute(
                user_id="abcdefghijklmnopqrstuvwxyz12",
                dispute_id="D1",
            )
        )
    assert exc.value.status_code == 409


def test_finalize_under_review(monkeypatch):
    uid = "abcdefghijklmnopqrstuvwxyz12"
    dispute_doc = {
        "dispute_id": "D1",
        "user_id": uid,
        "status": "under_review",
        "booking_id": "B1",
        "type": "quality_complaint",
        "customer_message": "Kaam kharab",
        "worker_response": {"message": "Main ne theek kaam kiya"},
        "hifazat_evaluation": {
            "complaint_verdict": "valid",
            "recommended_action": "warn_worker",
            "trust_score": 0.8,
        },
    }

    async def get_dispute_side_effect(did):
        return dict(dispute_doc)

    monkeypatch.setattr(
        "services.dispute_service.get_dispute",
        AsyncMock(side_effect=get_dispute_side_effect),
    )
    monkeypatch.setattr(
        "services.dispute_service.get_booking",
        AsyncMock(return_value={"booking_id": "B1", "price": 1000, "user_id": uid, "provider_id": "p1"}),
    )
    monkeypatch.setattr(
        "services.dispute_service.run_dispute",
        AsyncMock(
            return_value={
                "resolution": "Refund approved",
                "refund_amount": 500,
                "provider_penalty": "warning_issued",
                "case_summary": "Test",
                "escalated_to_human": False,
            }
        ),
    )
    monkeypatch.setattr("services.dispute_service.update_dispute", AsyncMock(return_value=True))
    monkeypatch.setattr("services.dispute_service.ensure_booking_disputed", AsyncMock())
    monkeypatch.setattr("services.dispute_service.notify_dispute_resolved", AsyncMock())

    result = asyncio.run(finalize_dispute(user_id=uid, dispute_id="D1"))
    assert result["dispute_status"] == "resolved"
    assert result["refund_amount"] == 500
