"""Phase C — worker dispute list + respond."""
import asyncio
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from services.dispute_service import list_worker_disputes, respond_to_dispute


def test_respond_rejects_short_message(monkeypatch):
    monkeypatch.setattr(
        "services.dispute_service.get_dispute",
        AsyncMock(return_value={"dispute_id": "D1", "status": "open", "booking_id": "B1", "worker_id": "p1"}),
    )
    monkeypatch.setattr(
        "services.dispute_service.get_booking",
        AsyncMock(return_value={"provider_id": "p1"}),
    )
    monkeypatch.setattr(
        "services.dispute_service._worker_can_access_dispute",
        AsyncMock(return_value=True),
    )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            respond_to_dispute(worker_uid="wuid", dispute_id="D1", message="short")
        )
    assert exc.value.status_code == 400


def test_respond_open_to_under_review(monkeypatch):
    uid = "abcdefghijklmnopqrstuvwxyz12"
    dispute = {
        "dispute_id": "D1",
        "status": "open",
        "booking_id": "B1",
        "user_id": uid,
        "worker_id": "p1",
        "type": "quality_complaint",
    }
    booking = {"booking_id": "B1", "provider_id": "p1", "user_id": uid}

    monkeypatch.setattr("services.dispute_service.get_dispute", AsyncMock(side_effect=[dispute, {**dispute, "status": "under_review"}]))
    monkeypatch.setattr("services.dispute_service.get_booking", AsyncMock(return_value=booking))
    monkeypatch.setattr("services.dispute_service._worker_can_access_dispute", AsyncMock(return_value=True))
    monkeypatch.setattr("services.dispute_service.update_dispute", AsyncMock(return_value=True))
    monkeypatch.setattr("services.dispute_service.notify_dispute_worker_replied", AsyncMock())

    result = asyncio.run(
        respond_to_dispute(
            worker_uid="wuid",
            dispute_id="D1",
            message="Main time par pohncha tha aur kaam mukammal kiya.",
        )
    )
    assert result["dispute_status"] == "under_review"
    assert result["worker_response"]["message"].startswith("Main time")


def test_list_worker_filters_by_provider(monkeypatch):
    monkeypatch.setattr(
        "services.dispute_service._worker_provider_id",
        AsyncMock(return_value="p99"),
    )

    uid = "abcdefghijklmnopqrstuvwxyz12"

    async def fake_entries():
        return [
            ("d1", {"booking_id": "b1", "worker_id": "p99", "status": "open", "user_id": uid, "type": "no_show", "created_at": "2026-01-01"}),
            ("d2", {"booking_id": "b2", "worker_id": "p88", "status": "open", "user_id": uid, "type": "no_show", "created_at": "2026-01-02"}),
        ]

    monkeypatch.setattr("services.dispute_service.list_dispute_entries", fake_entries)
    monkeypatch.setattr("services.dispute_service.get_booking", AsyncMock(return_value=None))

    out = asyncio.run(list_worker_disputes("wuid", status="open"))
    assert out["count"] == 1
    assert out["disputes"][0]["dispute_id"] == "d1"
