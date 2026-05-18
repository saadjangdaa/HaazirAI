"""Tests for agents/pakka.py — all Firebase calls mocked."""
import pytest
from unittest.mock import AsyncMock, patch
from agents.pakka import PakkaAgent, TRAVEL_BUFFER_MINUTES

MOCK_INTENT_NORMAL = {
    "service_type": "AC repair",
    "location": "DHA Phase 6",
    "city": "Karachi",
    "time_preference": "tomorrow_morning",
    "urgency": "medium",
    "job_complexity": "intermediate",
    "emergency": False,
}

MOCK_INTENT_EMERGENCY = {
    **MOCK_INTENT_NORMAL,
    "emergency": True,
    "urgency": "critical",
    "time_preference": "now",
}

MOCK_PROVIDER = {
    "id": "p001",
    "name": "Hamza AC Services",
    "phone": "03001234567",
    "service": "AC technician",
    "city": "Karachi",
    "lat": 24.790,
    "lng": 67.068,
    "rating": 4.7,
    "available_slots": ["09:00", "10:00", "14:00", "16:00"],
}

MOCK_PRICING = {"total": 3500, "labor": 2000, "parts": 1500}


@pytest.fixture
def agent():
    return PakkaAgent()


# ── Normal booking ────────────────────────────────────────────────────────

@pytest.mark.asyncio
class TestNormalBooking:

    @patch("agents.pakka.save_booking", new_callable=AsyncMock, return_value=True)
    @patch("agents.pakka.check_slot_conflict", new_callable=AsyncMock, return_value=False)
    async def test_status_confirmed_no_conflict(self, mock_conflict, mock_save, agent):
        result = await agent.create_booking(MOCK_INTENT_NORMAL, MOCK_PROVIDER, MOCK_PRICING)
        assert result["status"] == "confirmed"

    @patch("agents.pakka.save_booking", new_callable=AsyncMock, return_value=True)
    @patch("agents.pakka.check_slot_conflict", new_callable=AsyncMock, return_value=False)
    async def test_booking_id_format(self, mock_conflict, mock_save, agent):
        result = await agent.create_booking(MOCK_INTENT_NORMAL, MOCK_PROVIDER, MOCK_PRICING)
        assert result["booking_id"].startswith("HAZ-")
        parts = result["booking_id"].split("-")
        assert len(parts) == 3

    @patch("agents.pakka.save_booking", new_callable=AsyncMock, return_value=True)
    @patch("agents.pakka.check_slot_conflict", new_callable=AsyncMock, return_value=False)
    async def test_confirmation_message_contains_provider(self, mock_conflict, mock_save, agent):
        result = await agent.create_booking(MOCK_INTENT_NORMAL, MOCK_PROVIDER, MOCK_PRICING)
        assert "Hamza AC Services" in result["confirmation_message"]
        assert "HAZ-" in result["confirmation_message"]
        assert "3,500" in result["confirmation_message"]

    @patch("agents.pakka.save_booking", new_callable=AsyncMock, return_value=True)
    @patch("agents.pakka.check_slot_conflict", new_callable=AsyncMock, return_value=False)
    async def test_urdu_confirmation_present(self, mock_conflict, mock_save, agent):
        result = await agent.create_booking(MOCK_INTENT_NORMAL, MOCK_PROVIDER, MOCK_PRICING)
        assert "confirmation_message_urdu" in result
        assert "Hamza AC Services" in result["confirmation_message_urdu"]
        assert "بکنگ کنفرم" in result["confirmation_message_urdu"]

    @patch("agents.pakka.save_booking", new_callable=AsyncMock, return_value=True)
    @patch("agents.pakka.check_slot_conflict", new_callable=AsyncMock, return_value=False)
    async def test_reminders_set_correctly(self, mock_conflict, mock_save, agent):
        result = await agent.create_booking(MOCK_INTENT_NORMAL, MOCK_PROVIDER, MOCK_PRICING)
        assert len(result["reminder_times"]) == 2

    @patch("agents.pakka.save_booking", new_callable=AsyncMock, return_value=True)
    @patch("agents.pakka.check_slot_conflict", new_callable=AsyncMock, return_value=False)
    async def test_receipt_has_required_keys(self, mock_conflict, mock_save, agent):
        result = await agent.create_booking(MOCK_INTENT_NORMAL, MOCK_PROVIDER, MOCK_PRICING)
        receipt = result["receipt"]
        for key in ["booking_id", "provider_name", "service", "location",
                    "scheduled_time", "estimated_price", "payment_methods", "status"]:
            assert key in receipt

    @patch("agents.pakka.save_booking", new_callable=AsyncMock, return_value=True)
    @patch("agents.pakka.check_slot_conflict", new_callable=AsyncMock, return_value=False)
    async def test_notification_standard_type(self, mock_conflict, mock_save, agent):
        result = await agent.create_booking(MOCK_INTENT_NORMAL, MOCK_PROVIDER, MOCK_PRICING)
        assert result["notification"]["type"] == "standard"
        assert "sms" in result["notification"]["channels"]

    @patch("agents.pakka.save_booking", new_callable=AsyncMock, return_value=True)
    @patch("agents.pakka.check_slot_conflict", new_callable=AsyncMock, return_value=False)
    async def test_not_waitlisted_when_slot_free(self, mock_conflict, mock_save, agent):
        result = await agent.create_booking(MOCK_INTENT_NORMAL, MOCK_PROVIDER, MOCK_PRICING)
        assert result["waitlisted"] is False
        assert result["waitlist_entry"] is None


# ── Conflict + alternate slots ─────────────────────────────────────────────

@pytest.mark.asyncio
class TestConflictResolution:

    @patch("agents.pakka.save_booking", new_callable=AsyncMock, return_value=True)
    @patch("agents.pakka.check_slot_conflict", new_callable=AsyncMock, return_value=True)
    async def test_all_slots_busy_triggers_waitlist(self, mock_conflict, mock_save, agent):
        result = await agent.create_booking(MOCK_INTENT_NORMAL, MOCK_PROVIDER, MOCK_PRICING)
        assert result["waitlisted"] is True
        assert result["waitlist_entry"] is not None
        assert result["status"] == "waitlisted"

    @patch("agents.pakka.save_booking", new_callable=AsyncMock, return_value=True)
    async def test_first_free_alternate_selected(self, mock_save, agent):
        side_effects = [True, True, True, False, False, False, False]
        with patch("agents.pakka.check_slot_conflict",
                   new_callable=AsyncMock, side_effect=side_effects):
            result = await agent.create_booking(MOCK_INTENT_NORMAL, MOCK_PROVIDER, MOCK_PRICING)
        assert result["status"] == "confirmed"
        assert len(result["alternate_slots"]) > 0

    @patch("agents.pakka.save_booking", new_callable=AsyncMock, return_value=True)
    @patch("agents.pakka.check_slot_conflict", new_callable=AsyncMock, return_value=True)
    async def test_waitlist_id_format(self, mock_conflict, mock_save, agent):
        result = await agent.create_booking(MOCK_INTENT_NORMAL, MOCK_PROVIDER, MOCK_PRICING)
        if result["waitlist_entry"]:
            assert result["waitlist_entry"]["waitlist_id"].startswith("WL-")

    @patch("agents.pakka.save_booking", new_callable=AsyncMock, return_value=True)
    @patch("agents.pakka.check_slot_conflict", new_callable=AsyncMock, return_value=True)
    async def test_travel_buffer_constant_present(self, mock_conflict, mock_save, agent):
        assert TRAVEL_BUFFER_MINUTES == 30


# ── Emergency booking ──────────────────────────────────────────────────────

@pytest.mark.asyncio
class TestEmergencyBooking:

    @patch("agents.pakka.save_booking", new_callable=AsyncMock, return_value=True)
    @patch("agents.pakka.check_slot_conflict", new_callable=AsyncMock, return_value=False)
    async def test_emergency_status_confirmed(self, mock_conflict, mock_save, agent):
        result = await agent.create_booking(MOCK_INTENT_EMERGENCY, MOCK_PROVIDER, MOCK_PRICING)
        assert result["status"] == "confirmed"

    @patch("agents.pakka.save_booking", new_callable=AsyncMock, return_value=True)
    @patch("agents.pakka.check_slot_conflict", new_callable=AsyncMock, return_value=False)
    async def test_emergency_confirmation_has_urgent_marker(self, mock_conflict, mock_save, agent):
        result = await agent.create_booking(MOCK_INTENT_EMERGENCY, MOCK_PROVIDER, MOCK_PRICING)
        msg = result["confirmation_message"]
        assert "🚨" in msg or "EMERGENCY" in msg or "emergency" in msg.lower()

    @patch("agents.pakka.save_booking", new_callable=AsyncMock, return_value=True)
    @patch("agents.pakka.check_slot_conflict", new_callable=AsyncMock, return_value=False)
    async def test_emergency_urdu_has_urgent_marker(self, mock_conflict, mock_save, agent):
        result = await agent.create_booking(MOCK_INTENT_EMERGENCY, MOCK_PROVIDER, MOCK_PRICING)
        urdu_msg = result["confirmation_message_urdu"]
        assert "🚨" in urdu_msg or "فوری" in urdu_msg

    @patch("agents.pakka.save_booking", new_callable=AsyncMock, return_value=True)
    @patch("agents.pakka.check_slot_conflict", new_callable=AsyncMock, return_value=False)
    async def test_emergency_notification_urgent_type(self, mock_conflict, mock_save, agent):
        result = await agent.create_booking(MOCK_INTENT_EMERGENCY, MOCK_PROVIDER, MOCK_PRICING)
        assert result["notification"]["type"] == "urgent"
        assert "whatsapp" in result["notification"]["channels"]

    @patch("agents.pakka.save_booking", new_callable=AsyncMock, return_value=True)
    @patch("agents.pakka.check_slot_conflict", new_callable=AsyncMock, return_value=False)
    async def test_emergency_reminders_immediate(self, mock_conflict, mock_save, agent):
        result = await agent.create_booking(MOCK_INTENT_EMERGENCY, MOCK_PROVIDER, MOCK_PRICING)
        assert len(result["reminder_times"]) == 2

    @patch("agents.pakka.save_booking", new_callable=AsyncMock, return_value=True)
    @patch("agents.pakka.check_slot_conflict", new_callable=AsyncMock, return_value=False)
    async def test_emergency_log_fields(self, mock_conflict, mock_save, agent):
        result = await agent.create_booking(MOCK_INTENT_EMERGENCY, MOCK_PROVIDER, MOCK_PRICING)
        log = result["_log"]
        assert "emergency_slot_found" in log
        assert "emergency_override_used" in log
        assert log["emergency_slot_found"] is not None


# ── Log + structure ────────────────────────────────────────────────────────

@pytest.mark.asyncio
class TestLogAndStructure:

    @patch("agents.pakka.save_booking", new_callable=AsyncMock, return_value=True)
    @patch("agents.pakka.check_slot_conflict", new_callable=AsyncMock, return_value=False)
    async def test_log_has_required_keys(self, mock_conflict, mock_save, agent):
        result = await agent.create_booking(MOCK_INTENT_NORMAL, MOCK_PROVIDER, MOCK_PRICING)
        log = result["_log"]
        for key in ["agent_name", "start_time", "end_time", "decision_made",
                    "confidence", "fallback_used", "time_seconds",
                    "travel_buffer_minutes", "conflict_detected",
                    "alternate_slots_found", "waitlisted"]:
            assert key in log, f"Missing log key: {key}"

    @patch("agents.pakka.save_booking", new_callable=AsyncMock, return_value=True)
    @patch("agents.pakka.check_slot_conflict", new_callable=AsyncMock, return_value=False)
    async def test_return_dict_has_all_keys(self, mock_conflict, mock_save, agent):
        result = await agent.create_booking(MOCK_INTENT_NORMAL, MOCK_PROVIDER, MOCK_PRICING)
        for key in ["booking_id", "provider_id", "user_id", "service",
                    "scheduled_time", "status", "confirmation_message",
                    "confirmation_message_urdu", "receipt", "reminder_times",
                    "alternate_slots", "calendar_entry", "waitlisted",
                    "waitlist_entry", "notification", "travel_buffer_minutes"]:
            assert key in result, f"Missing return key: {key}"

    @patch("agents.pakka.save_booking", new_callable=AsyncMock, return_value=True)
    @patch("agents.pakka.check_slot_conflict", new_callable=AsyncMock, return_value=False)
    async def test_save_booking_called_once(self, mock_conflict, mock_save, agent):
        await agent.create_booking(MOCK_INTENT_NORMAL, MOCK_PROVIDER, MOCK_PRICING)
        assert mock_save.call_count == 1

    @patch("agents.pakka.save_booking", new_callable=AsyncMock, return_value=True)
    @patch("agents.pakka.check_slot_conflict", new_callable=AsyncMock, return_value=True)
    async def test_save_booking_called_twice_when_waitlisted(self, mock_conflict, mock_save, agent):
        await agent.create_booking(MOCK_INTENT_NORMAL, MOCK_PROVIDER, MOCK_PRICING)
        assert mock_save.call_count == 2
