"""Tests for agents/hisaab.py — pure logic, no external calls."""
import pytest
from agents.hisaab import (
    HisaabAgent,
    URGENCY_MULTIPLIERS,
    COMPLEXITY_MULTIPLIERS,
    PLATFORM_FEE_RATE,
    _get_surge_multiplier,
    _build_fairness_note,
)

MOCK_PROVIDER = {
    "id": "p001",
    "name": "Ustad Ali AC Services",
    "rating": 4.8,
    "distance_km": 3.0,
    "price_per_hour": 600,
    "estimated_hours": 2.0,
    "phone": "03001234567",
}

MOCK_PROVIDER_CHEAP = {
    "id": "p002",
    "name": "Budget AC Wala",
    "rating": 4.0,
    "distance_km": 6.0,
    "price_per_hour": 400,
    "estimated_hours": 2.5,
    "phone": "03009876543",
}

MOCK_INTENT_NORMAL = {
    "service_type": "AC repair",
    "urgency": "medium",
    "job_complexity": "intermediate",
    "budget_sensitivity": "medium",
    "emergency": False,
    "detected_language": "roman_urdu",
}

MOCK_INTENT_EMERGENCY = {
    **MOCK_INTENT_NORMAL,
    "emergency": True,
    "urgency": "high",
    "budget_sensitivity": "low",
}

MOCK_INTENT_BUDGET = {
    **MOCK_INTENT_NORMAL,
    "budget_sensitivity": "high",
}

ALL_PROVIDERS = [MOCK_PROVIDER, MOCK_PROVIDER_CHEAP]


@pytest.fixture
def agent():
    return HisaabAgent()


class TestPricingFormula:

    @pytest.mark.asyncio
    async def test_base_price_correct(self, agent):
        result = await agent.calculate_price(
            MOCK_INTENT_NORMAL, MOCK_PROVIDER, override_hour=11
        )
        assert result["base_price"] == 1200

    @pytest.mark.asyncio
    async def test_distance_cost_correct(self, agent):
        result = await agent.calculate_price(
            MOCK_INTENT_NORMAL, MOCK_PROVIDER, override_hour=11
        )
        assert result["distance_cost"] == 60

    @pytest.mark.asyncio
    async def test_urgency_medium_multiplier(self, agent):
        result = await agent.calculate_price(
            MOCK_INTENT_NORMAL, MOCK_PROVIDER, override_hour=11
        )
        assert result["urgency_adjustment"] == 240
        assert result["urgency_multiplier"] == 1.2

    @pytest.mark.asyncio
    async def test_urgency_critical_for_emergency(self, agent):
        result = await agent.calculate_price(
            MOCK_INTENT_EMERGENCY, MOCK_PROVIDER, override_hour=11
        )
        assert result["urgency_multiplier"] == URGENCY_MULTIPLIERS["critical"]
        assert result["urgency_adjustment"] > 0

    @pytest.mark.asyncio
    async def test_complexity_intermediate_multiplier(self, agent):
        result = await agent.calculate_price(
            MOCK_INTENT_NORMAL, MOCK_PROVIDER, override_hour=11
        )
        assert result["complexity_fee"] == 360
        assert result["complexity_multiplier"] == 1.3

    @pytest.mark.asyncio
    async def test_no_surge_at_noon(self, agent):
        result = await agent.calculate_price(
            MOCK_INTENT_NORMAL, MOCK_PROVIDER, override_hour=12
        )
        assert result["surge_multiplier"] == 1.0
        assert result["surge_pricing"] == 0

    @pytest.mark.asyncio
    async def test_surge_at_peak_hour(self, agent):
        result = await agent.calculate_price(
            MOCK_INTENT_NORMAL, MOCK_PROVIDER, override_hour=18
        )
        assert result["surge_multiplier"] == 1.4
        assert result["surge_pricing"] > 0

    @pytest.mark.asyncio
    async def test_loyalty_discount_applied(self, agent):
        result = await agent.calculate_price(
            MOCK_INTENT_NORMAL,
            MOCK_PROVIDER,
            is_repeat_customer=True,
            override_hour=11,
        )
        assert result["loyalty_discount"] < 0
        assert result["is_repeat_customer"] is True

    @pytest.mark.asyncio
    async def test_no_loyalty_for_new_customer(self, agent):
        result = await agent.calculate_price(
            MOCK_INTENT_NORMAL,
            MOCK_PROVIDER,
            is_repeat_customer=False,
            override_hour=11,
        )
        assert result["loyalty_discount"] == 0

    @pytest.mark.asyncio
    async def test_total_equals_sum_of_parts(self, agent):
        result = await agent.calculate_price(
            MOCK_INTENT_NORMAL, MOCK_PROVIDER, override_hour=11
        )
        expected = (
            result["base_price"]
            + result["distance_cost"]
            + result["urgency_adjustment"]
            + result["complexity_fee"]
            + result["surge_pricing"]
            + result["loyalty_discount"]
        )
        assert result["total"] == expected

    @pytest.mark.asyncio
    async def test_total_minimum_300(self, agent):
        cheap_provider = {
            **MOCK_PROVIDER,
            "price_per_hour": 50,
            "estimated_hours": 0.5,
            "distance_km": 0.5,
        }
        result = await agent.calculate_price(
            MOCK_INTENT_NORMAL, cheap_provider, override_hour=11
        )
        assert result["total"] >= 300

    @pytest.mark.asyncio
    async def test_all_urgency_levels(self, agent):
        for urgency, expected_mult in URGENCY_MULTIPLIERS.items():
            intent = {**MOCK_INTENT_NORMAL, "urgency": urgency, "emergency": False}
            result = await agent.calculate_price(intent, MOCK_PROVIDER, override_hour=11)
            assert result["urgency_multiplier"] == expected_mult

    @pytest.mark.asyncio
    async def test_all_complexity_levels(self, agent):
        for complexity, expected_mult in COMPLEXITY_MULTIPLIERS.items():
            intent = {**MOCK_INTENT_NORMAL, "job_complexity": complexity}
            result = await agent.calculate_price(intent, MOCK_PROVIDER, override_hour=11)
            assert result["complexity_multiplier"] == expected_mult


class TestBudgetAlternative:

    @pytest.mark.asyncio
    async def test_budget_alternative_present_when_high_sensitivity(self, agent):
        result = await agent.calculate_price(
            MOCK_INTENT_BUDGET,
            MOCK_PROVIDER,
            providers_list=ALL_PROVIDERS,
            override_hour=11,
        )
        assert result["budget_alternative"] is not None

    @pytest.mark.asyncio
    async def test_budget_alternative_cheaper(self, agent):
        result = await agent.calculate_price(
            MOCK_INTENT_BUDGET,
            MOCK_PROVIDER,
            providers_list=ALL_PROVIDERS,
            override_hour=11,
        )
        alt = result["budget_alternative"]
        assert alt["total"] < result["total"]

    @pytest.mark.asyncio
    async def test_no_budget_alternative_when_medium_sensitivity(self, agent):
        result = await agent.calculate_price(
            MOCK_INTENT_NORMAL,
            MOCK_PROVIDER,
            providers_list=ALL_PROVIDERS,
            override_hour=11,
        )
        assert result["budget_alternative"] is None

    @pytest.mark.asyncio
    async def test_budget_alternative_has_tradeoff(self, agent):
        result = await agent.calculate_price(
            MOCK_INTENT_BUDGET,
            MOCK_PROVIDER,
            providers_list=ALL_PROVIDERS,
            override_hour=11,
        )
        alt = result["budget_alternative"]
        assert alt.get("tradeoff")
        assert len(alt["tradeoff"]) > 0

    @pytest.mark.asyncio
    async def test_budget_alternative_different_provider(self, agent):
        result = await agent.calculate_price(
            MOCK_INTENT_BUDGET,
            MOCK_PROVIDER,
            providers_list=ALL_PROVIDERS,
            override_hour=11,
        )
        alt = result["budget_alternative"]
        assert alt["provider_id"] != MOCK_PROVIDER["id"]


class TestFairnessAndTransparency:

    @pytest.mark.asyncio
    async def test_fairness_note_present(self, agent):
        result = await agent.calculate_price(
            MOCK_INTENT_NORMAL, MOCK_PROVIDER, override_hour=11
        )
        assert result["fairness_note"]
        assert "Haazir" in result["fairness_note"]

    @pytest.mark.asyncio
    async def test_fairness_note_in_urdu(self, agent):
        intent = {**MOCK_INTENT_NORMAL, "detected_language": "urdu"}
        result = await agent.calculate_price(intent, MOCK_PROVIDER, override_hour=11)
        assert "حساب" in result["fairness_note"] or "Haazir" in result["fairness_note"]

    def test_fairness_note_shows_correct_provider_earnings(self):
        note = _build_fairness_note(1000, "Ustad Ali", "roman_urdu")
        expected_earnings = round(1000 * (1 - PLATFORM_FEE_RATE))
        assert str(expected_earnings) in note

    @pytest.mark.asyncio
    async def test_price_explanation_present(self, agent):
        result = await agent.calculate_price(
            MOCK_INTENT_NORMAL, MOCK_PROVIDER, override_hour=11
        )
        assert result["price_explanation"]
        assert "Base rate" in result["price_explanation"]
        assert "Total" in result["price_explanation"]

    @pytest.mark.asyncio
    async def test_surge_warning_at_peak_hour(self, agent):
        result = await agent.calculate_price(
            MOCK_INTENT_NORMAL, MOCK_PROVIDER, override_hour=18
        )
        assert result["surge_warning"] is not None

    @pytest.mark.asyncio
    async def test_no_surge_warning_at_off_peak(self, agent):
        result = await agent.calculate_price(
            MOCK_INTENT_NORMAL, MOCK_PROVIDER, override_hour=12
        )
        assert result["surge_warning"] is None

    @pytest.mark.asyncio
    async def test_value_verdict_present(self, agent):
        result = await agent.calculate_price(
            MOCK_INTENT_NORMAL, MOCK_PROVIDER, override_hour=11
        )
        assert result["value_verdict"]
        assert len(result["value_verdict"]) > 5


class TestReturnStructure:

    @pytest.mark.asyncio
    async def test_quote_id_format(self, agent):
        result = await agent.calculate_price(
            MOCK_INTENT_NORMAL, MOCK_PROVIDER, override_hour=11
        )
        assert result["quote_id"].startswith("QT-")

    @pytest.mark.asyncio
    async def test_all_required_keys_present(self, agent):
        result = await agent.calculate_price(
            MOCK_INTENT_NORMAL, MOCK_PROVIDER, override_hour=11
        )
        required = [
            "quote_id",
            "provider_id",
            "provider_name",
            "service",
            "base_price",
            "distance_cost",
            "urgency_adjustment",
            "complexity_fee",
            "surge_pricing",
            "loyalty_discount",
            "total",
            "price_per_hour",
            "estimated_hours",
            "distance_km",
            "urgency_multiplier",
            "complexity_multiplier",
            "surge_multiplier",
            "is_repeat_customer",
            "budget_alternative",
            "fairness_note",
            "price_explanation",
            "surge_warning",
            "value_verdict",
            "estimated_base",
            "_log",
        ]
        for key in required:
            assert key in result, f"Missing key: {key}"

    @pytest.mark.asyncio
    async def test_log_has_required_keys(self, agent):
        result = await agent.calculate_price(
            MOCK_INTENT_NORMAL, MOCK_PROVIDER, override_hour=11
        )
        log = result["_log"]
        for key in [
            "agent_name",
            "start_time",
            "end_time",
            "decision_made",
            "confidence",
            "time_seconds",
            "multipliers_used",
        ]:
            assert key in log, f"Missing log key: {key}"
        assert log["agent_name"] == "HISAAB"

    @pytest.mark.asyncio
    async def test_estimated_base_for_moltol(self, agent):
        result = await agent.calculate_price(
            MOCK_INTENT_NORMAL, MOCK_PROVIDER, override_hour=11
        )
        assert result["estimated_base"] == result["base_price"] + result["distance_cost"]

    @pytest.mark.asyncio
    async def test_multipliers_logged(self, agent):
        result = await agent.calculate_price(
            MOCK_INTENT_NORMAL, MOCK_PROVIDER, override_hour=11
        )
        mults = result["_log"]["multipliers_used"]
        assert "urgency" in mults
        assert "complexity" in mults
        assert "surge" in mults
        assert "loyalty" in mults


class TestSurgeSchedule:

    def test_peak_hour_18_is_1_4(self):
        assert _get_surge_multiplier(18) == 1.4

    def test_morning_rush_9_is_1_3(self):
        assert _get_surge_multiplier(9) == 1.3

    def test_off_peak_noon_is_1_0(self):
        assert _get_surge_multiplier(12) == 1.0

    def test_unknown_hour_returns_default(self):
        assert _get_surge_multiplier(3) == 1.0
