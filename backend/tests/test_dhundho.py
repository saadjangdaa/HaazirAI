"""Tests for agents/dhundho.py — Firebase and Maps calls are mocked."""
import pytest
from unittest.mock import AsyncMock, patch
from agents.dhundho import DhundhoAgent, _service_matches

MOCK_COORDS = {"lat": 33.7215, "lng": 73.0433, "formatted_address": "DHA Phase 2, Islamabad"}


# ---------------------------------------------------------------------------
# _service_matches unit tests (pure, no I/O)
# ---------------------------------------------------------------------------

class TestServiceMatches:
    def _make_provider(self, service: str, specs: list = None):
        return {"service": service, "specialization": specs or []}

    def test_ac_matches_ac_provider(self):
        p = self._make_provider("AC technician", ["split", "inverter", "gas"])
        assert _service_matches("AC repair", p) is True

    def test_ac_does_not_match_plumber(self):
        p = self._make_provider("plumber", ["pipe", "drain", "sanitary"])
        assert _service_matches("AC repair", p) is False

    def test_plumber_matches_pipe_provider(self):
        p = self._make_provider("plumber", ["pipe", "drain", "bathroom"])
        assert _service_matches("plumber needed", p) is True

    def test_bijli_matches_electrician(self):
        p = self._make_provider("electrician", ["wiring", "switch", "fault"])
        assert _service_matches("bijli theek karni hai", p) is True

    def test_no_cross_contamination_gas_plumber(self):
        # "gas" appears in AC intent — must NOT match plumber
        p = self._make_provider("plumber", ["pipe", "drain"])
        assert _service_matches("gas refill AC", p) is False

    def test_empty_service_no_crash(self):
        p = self._make_provider("plumber", [])
        result = _service_matches("", p)
        assert isinstance(result, bool)


# ---------------------------------------------------------------------------
# DhundhoAgent.find_providers integration-style tests (Firebase + Maps mocked)
# ---------------------------------------------------------------------------

@pytest.fixture
def agent():
    return DhundhoAgent()


def base_intent(**overrides):
    intent = {
        "service_type": "AC repair",
        "city": "Islamabad",
        "location": "DHA Phase 2",
        "job_complexity": "intermediate",
        "emergency": False,
        "time_preference": "tomorrow_morning",
    }
    intent.update(overrides)
    return intent


@pytest.mark.asyncio
class TestFindProviders:

    @patch("agents.dhundho.check_slot_conflict", new_callable=AsyncMock, return_value=False)
    @patch("agents.dhundho.get_user_coordinates", return_value=MOCK_COORDS)
    async def test_returns_providers_when_available(self, mock_coords, mock_conflict, agent):
        result = await agent.find_providers(base_intent())
        assert isinstance(result["providers"], list)
        assert result["total_found"] >= 0
        assert "filter_trace" in result
        assert "counts" in result

    @patch("agents.dhundho.check_slot_conflict", new_callable=AsyncMock, return_value=False)
    @patch("agents.dhundho.get_user_coordinates", return_value=MOCK_COORDS)
    async def test_providers_sorted_by_distance(self, mock_coords, mock_conflict, agent):
        result = await agent.find_providers(base_intent())
        distances = [p["distance_km"] for p in result["providers"]]
        assert distances == sorted(distances)

    @patch("agents.dhundho.check_slot_conflict", new_callable=AsyncMock, return_value=False)
    @patch("agents.dhundho.get_user_coordinates", return_value=MOCK_COORDS)
    async def test_cap_at_top_n(self, mock_coords, mock_conflict, agent):
        result = await agent.find_providers(base_intent())
        assert result["total_found"] <= 10

    @patch("agents.dhundho.check_slot_conflict", new_callable=AsyncMock, return_value=True)
    @patch("agents.dhundho.get_user_coordinates", return_value=MOCK_COORDS)
    async def test_fallback_when_all_slots_busy(self, mock_coords, mock_conflict, agent):
        # All slots conflict → should trigger fallback
        result = await agent.find_providers(base_intent())
        assert result["fallback_triggered"] is True
        assert result["waitlist_recommended"] is True
        assert result["next_available_slot_hint"] is not None

    @patch("agents.dhundho.check_slot_conflict", new_callable=AsyncMock, return_value=False)
    @patch("agents.dhundho.get_user_coordinates", return_value=MOCK_COORDS)
    async def test_emergency_filters_only_verified(self, mock_coords, mock_conflict, agent):
        result = await agent.find_providers(base_intent(emergency=True))
        for p in result["providers"]:
            assert p.get("verified") is True

    @patch("agents.dhundho.check_slot_conflict", new_callable=AsyncMock, return_value=False)
    @patch("agents.dhundho.get_user_coordinates", return_value=MOCK_COORDS)
    async def test_no_available_flag_in_filters(self, mock_coords, mock_conflict, agent):
        # Fix 2: stale JSON `available` flag must NOT be in filter chain
        result = await agent.find_providers(base_intent())
        assert "available=true (dataset)" not in result["filters_applied"]

    @patch("agents.dhundho.check_slot_conflict", new_callable=AsyncMock, return_value=False)
    @patch("agents.dhundho.get_user_coordinates", return_value=MOCK_COORDS)
    async def test_log_block_present(self, mock_coords, mock_conflict, agent):
        result = await agent.find_providers(base_intent())
        log = result["_log"]
        assert log["agent_name"] == "DHUNDHO"
        assert "time_seconds" in log
        assert "decision_made" in log

    @patch("agents.dhundho.check_slot_conflict", new_callable=AsyncMock, return_value=False)
    @patch("agents.dhundho.get_user_coordinates", return_value=MOCK_COORDS)
    async def test_scheduled_time_is_real_datetime(self, mock_coords, mock_conflict, agent):
        # Fix 1: scheduled_time must never be "ASAP" string
        from datetime import datetime
        result = await agent.find_providers(base_intent(time_preference="now"))
        st = result["scheduled_time_checked"]
        assert st != "ASAP"
        datetime.strptime(st, "%Y-%m-%d %H:%M")  # must parse

    @patch("agents.dhundho.check_slot_conflict", new_callable=AsyncMock, return_value=False)
    @patch("agents.dhundho.get_user_coordinates", return_value=MOCK_COORDS)
    async def test_complexity_filter_applied(self, mock_coords, mock_conflict, agent):
        result = await agent.find_providers(base_intent(job_complexity="complex"))
        for p in result["providers"]:
            assert p.get("complexity_level") == "complex"

    @patch("agents.dhundho.check_slot_conflict", new_callable=AsyncMock, return_value=False)
    @patch("agents.dhundho.get_user_coordinates", return_value=MOCK_COORDS)
    async def test_unknown_city_returns_empty_not_crash(self, mock_coords, mock_conflict, agent):
        result = await agent.find_providers(base_intent(city="MadeUpCity_XYZ"))
        assert result["total_found"] == 0
        assert result["fallback_triggered"] is True
