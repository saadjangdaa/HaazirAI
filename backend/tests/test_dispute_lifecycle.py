"""Phase B — open dispute lifecycle (no instant JHAGRA by default)."""
import asyncio
from unittest.mock import AsyncMock

import pytest

from services import dispute_config
from services.dispute_service import _build_open_dispute_doc, file_dispute


class TestOpenDisputeDoc:
    def test_build_open_fields(self):
        doc = _build_open_dispute_doc(
            booking_id="HAZ-1",
            owner_uid="uid1",
            worker_id="p1",
            dtype="quality_complaint",
            description="Kaam kharab tha",
            evidence_url=None,
        )
        assert doc["status"] == "open"
        assert doc["worker_id"] == "p1"
        assert doc["customer_message"] == "Kaam kharab tha"
        assert doc["worker_response"] is None
        assert doc["resolved_at"] is None


def test_instant_flag_default_off(monkeypatch):
    monkeypatch.delenv("DISPUTE_INSTANT_RESOLVE", raising=False)
    assert dispute_config.dispute_instant_resolve_enabled() is False


def test_file_dispute_open_path(monkeypatch):
    monkeypatch.setattr(dispute_config, "dispute_instant_resolve_enabled", lambda: False)

    created = {}

    async def fake_prepare(bid):
        return {
            "booking_id": bid,
            "user_id": "uid1",
            "provider_id": "p99",
            "status": "completed",
        }

    async def fake_create(data):
        created.update(data)
        return "DSP-TEST-001"

    async def fake_append(*_a, **_k):
        return None

    async def fake_notify(*_a, **_k):
        return None

    monkeypatch.setattr("services.dispute_service.prepare_booking_for_dispute", fake_prepare)
    monkeypatch.setattr("services.dispute_service.create_dispute", fake_create)
    monkeypatch.setattr("services.dispute_service.append_user_dispute", fake_append)
    monkeypatch.setattr("services.dispute_service.notify_dispute_filed", fake_notify)
    monkeypatch.setattr("services.dispute_service.run_dispute", AsyncMock())

    result = asyncio.run(
        file_dispute(
            user_id="uid1",
            booking_id="HAZ-1",
            dispute_type="no_show",
            description="Worker nahi aaya",
        )
    )

    assert result["dispute_status"] == "open"
    assert result["dispute_id"] == "DSP-TEST-001"
    assert created["status"] == "open"
    assert created["worker_id"] == "p99"
    assert result["worker_response_pending"] is True


class TestDisputeTypeAliases:
    def test_rude_behavior_canonical(self):
        from services.disputes_integrity import normalize_dispute_type

        assert normalize_dispute_type("rude_behavior") == "rude_behavior"
        assert normalize_dispute_type("overpricing") == "price_disagreement"


class TestDisputeStatusTransitions:
    def test_open_to_under_review(self):
        from services.disputes_integrity import can_transition_dispute_status

        assert can_transition_dispute_status("open", "under_review") is True
        assert can_transition_dispute_status("resolved", "open") is False
