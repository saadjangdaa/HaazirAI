"""Phase 1/5: post-Pakka notification hook (mocked, no Firebase push)."""
import asyncio
from unittest.mock import AsyncMock, patch

import pytest


@pytest.mark.asyncio
async def test_after_pakka_booking_notifies_then_confirms():
    from main import _after_pakka_booking

    booking = {"booking_id": "HAZ-TEST-001", "user_id": "cust1", "status": "assigned"}
    pakka = {"reminder_times": ["2099-01-01T10:00:00+00:00"]}

    with patch("main.schedule_booking_reminders", new_callable=AsyncMock) as sched, patch(
        "main.get_booking", new_callable=AsyncMock, return_value=booking
    ), patch("main.notify_booking_created", new_callable=AsyncMock) as notify, patch(
        "main.set_booking_status", new_callable=AsyncMock, return_value={"status": "confirmed"}
    ) as confirm:
        out = await _after_pakka_booking("HAZ-TEST-001", "cust1", pakka)

    sched.assert_awaited_once()
    notify.assert_awaited_once_with(booking)
    confirm.assert_awaited_once_with("HAZ-TEST-001", "confirmed")
    assert out["status"] == "confirmed"


@pytest.mark.asyncio
async def test_after_pakka_booking_skips_reminders_when_empty():
    from main import _after_pakka_booking

    with patch("main.schedule_booking_reminders", new_callable=AsyncMock) as sched, patch(
        "main.get_booking", new_callable=AsyncMock, return_value={"booking_id": "B1", "status": "assigned"}
    ), patch("main.notify_booking_created", new_callable=AsyncMock), patch(
        "main.set_booking_status", new_callable=AsyncMock, return_value={"status": "confirmed"}
    ):
        await _after_pakka_booking("B1", "cust1", {})

    sched.assert_not_awaited()
