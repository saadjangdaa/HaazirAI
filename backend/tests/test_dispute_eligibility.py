"""Phase A — dispute eligibility rules."""
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException

from services.dispute_eligibility import (
    NO_SHOW_GRACE_HOURS,
    assess_dispute_eligibility,
    is_past_no_show_grace,
    prepare_booking_for_dispute,
)


def _booking(status: str, slot: str | None = None) -> dict:
    b = {"booking_id": "HAZ-TEST-001", "user_id": "uid1", "status": status}
    if slot:
        b["slot_time"] = slot
        b["scheduled_time"] = slot
    return b


class TestAssessEligibility:
    def test_completed_eligible(self):
        r = assess_dispute_eligibility(_booking("completed"))
        assert r.eligible is True
        assert r.reason == "eligible"

    def test_cancelled_eligible(self):
        r = assess_dispute_eligibility(_booking("cancelled"))
        assert r.eligible is True

    def test_in_progress_not_eligible(self):
        r = assess_dispute_eligibility(_booking("in_progress"))
        assert r.eligible is False
        assert r.reason == "booking_in_progress"

    def test_confirmed_before_grace_not_eligible(self):
        future = (datetime.now(timezone.utc) + timedelta(days=1)).strftime("%Y-%m-%d %H:%M")
        r = assess_dispute_eligibility(_booking("confirmed", future))
        assert r.eligible is False
        assert r.reason == "awaiting_service_or_grace"

    def test_confirmed_after_grace_eligible_with_auto_cancel(self):
        past = (datetime.now(timezone.utc) - timedelta(hours=NO_SHOW_GRACE_HOURS + 1)).strftime(
            "%Y-%m-%d %H:%M"
        )
        r = assess_dispute_eligibility(_booking("confirmed", past))
        assert r.eligible is True
        assert r.would_auto_cancel is True
        assert r.reason == "no_show_grace_exceeded"


class TestNoShowGrace:
    def test_is_past_grace_only_for_confirmed(self):
        past = (datetime.now(timezone.utc) - timedelta(hours=5)).strftime("%Y-%m-%d %H:%M")
        assert is_past_no_show_grace(_booking("confirmed", past)) is True
        assert is_past_no_show_grace(_booking("on_the_way", past)) is False


def test_prepare_rejects_in_progress(monkeypatch):
    import asyncio

    async def fake_get(_bid):
        return _booking("in_progress")

    monkeypatch.setattr("services.dispute_eligibility.get_booking", fake_get)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(prepare_booking_for_dispute("HAZ-TEST-001"))
    assert exc.value.status_code == 409
