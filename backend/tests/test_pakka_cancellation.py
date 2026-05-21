"""Tests for PakkaAgent cancellation, replacement, and no-show handling.

Run manually: py -3.13 tests/test_pakka_cancellation.py
Or: py -3.13 -m pytest tests/test_pakka_cancellation.py -v -p pytest_asyncio
"""
from __future__ import annotations

import asyncio
import json
from unittest.mock import AsyncMock, patch

import pytest

from agents.pakka import PakkaAgent

ORIGINAL_BOOKING = {
    "booking_id": "HAZ-20260515-ABC123",
    "provider_id": "p001",
    "user_id": "user_001",
    "service": "AC repair",
    "scheduled_time": "2026-05-16 10:00",
    "status": "confirmed",
    "price": 1500,
    "emergency": False,
}

INTENT = {
    "service_type": "AC repair",
    "location": "DHA",
    "city": "Karachi",
    "time_preference": "tomorrow_morning",
    "urgency": "high",
    "emergency": False,
    "job_complexity": "intermediate",
}

PRICING = {"total": 1500}

ALTERNATIVE_PROVIDERS = [
    {
        "id": "p026",
        "name": "Hamza AC Services — DHA KHI",
        "lat": 24.8134,
        "lng": 67.0697,
        "city": "Karachi",
        "area": "DHA",
        "available_slots": ["09:00", "11:00", "14:00"],
        "verified": True,
        "trust_score": 0.92,
        "complexity_level": "intermediate",
        "phone": "03001556677",
        "price_per_hour": 900,
    },
    {
        "id": "p028",
        "name": "Saad AC Technician — Clifton",
        "lat": 24.828,
        "lng": 67.0328,
        "city": "Karachi",
        "area": "Clifton",
        "available_slots": ["09:00", "11:00", "14:00"],
        "verified": True,
        "trust_score": 0.93,
        "complexity_level": "intermediate",
        "phone": "03211556677",
        "price_per_hour": 950,
    },
]


def _print_case(label: str, result: dict) -> None:
    safe_label = label.encode("ascii", errors="replace").decode("ascii")
    payload = json.dumps(result, indent=2, ensure_ascii=False, default=str)
    safe_payload = payload.encode("ascii", errors="replace").decode("ascii")
    print(f"\n{'=' * 60}")
    print(safe_label)
    print("=" * 60)
    print(safe_payload)


@pytest.fixture
def agent():
    return PakkaAgent()


@pytest.mark.asyncio
@patch("agents.pakka.save_booking", new_callable=AsyncMock, return_value=True)
@patch("agents.pakka.check_slot_conflict", new_callable=AsyncMock, return_value=False)
async def test_case1_provider_cancels_auto_replacement(mock_conflict, mock_save, agent):
    result = await agent.handle_cancellation(
        booking_id="HAZ-20260515-ABC123",
        provider_id="p001",
        cancelled_by="provider",
        reason="Provider beemar ho gaya",
        original_booking=ORIGINAL_BOOKING,
        alternative_providers=ALTERNATIVE_PROVIDERS,
        intent=INTENT,
        pricing=PRICING,
    )
    _print_case("Case 1 - Provider cancels -> auto replacement", result)

    assert result["cancelled_by"] == "provider"
    assert result["penalty_applied"] is True
    assert result["penalty_points"] == 10
    assert result["replacement_status"] in ("replacement_found", "no_replacement_found")
    rb = result["replacement_booking"]
    assert rb is None or isinstance(rb, dict)
    assert result["cancellation_id"].startswith("CAN-")


@pytest.mark.asyncio
@patch("agents.pakka.save_booking", new_callable=AsyncMock, return_value=True)
@patch("agents.pakka.check_slot_conflict", new_callable=AsyncMock, return_value=False)
async def test_case2_customer_cancels_no_replacement(mock_conflict, mock_save, agent):
    result = await agent.handle_cancellation(
        booking_id="HAZ-20260515-ABC123",
        provider_id="p001",
        cancelled_by="customer",
        reason="Plan badal gaya",
        original_booking=ORIGINAL_BOOKING,
        alternative_providers=ALTERNATIVE_PROVIDERS,
        intent=INTENT,
        pricing=PRICING,
    )
    _print_case("Case 2 - Customer cancels -> no replacement", result)

    assert result["cancelled_by"] == "customer"
    assert result["penalty_applied"] is False
    assert result["penalty_points"] == 0
    assert result["replacement_status"] == "customer_cancelled_no_replacement"
    assert result["replacement_booking"] is None


@pytest.mark.asyncio
@patch("agents.pakka.save_booking", new_callable=AsyncMock, return_value=True)
@patch("agents.pakka.check_slot_conflict", new_callable=AsyncMock, return_value=False)
async def test_case3_no_show_harsh_penalty(mock_conflict, mock_save, agent):
    result = await agent.handle_no_show(
        booking_id="HAZ-20260515-ABC123",
        provider_id="p001",
        original_booking=ORIGINAL_BOOKING,
        alternative_providers=ALTERNATIVE_PROVIDERS,
        intent=INTENT,
        pricing=PRICING,
    )
    _print_case("Case 3 - No show -> harsh penalty + auto replacement", result)

    assert result["penalty_points"] == 20
    assert result["replacement_status"] in ("replacement_found", "no_replacement_found")
    assert result["no_show_id"].startswith("NS-")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s", "-p", "pytest_asyncio"])
