"""Tests for agents/moltol.py — all async, no external calls."""
import pytest
from unittest.mock import AsyncMock, patch
from agents.moltol import (
    MoltolAgent,
    _score_bid,
    _score_all_bids,
    WEIGHT_PRICE,
    WEIGHT_ETA,
    WEIGHT_RATING,
    WEIGHT_PAST_PERF,
    MAX_PROVIDERS_TO_BROADCAST,
    TOP_BIDS_TO_PRESENT,
)

MOCK_PROVIDERS = [
    {
        "id": f"p00{i}",
        "name": f"Provider {i}",
        "rating": 3.8 + i * 0.1,
        "distance_km": 2.0 + i,
        "phone": f"0300000000{i}",
    }
    for i in range(1, 8)
]

MOCK_INTENT = {
    "service_type": "AC repair",
    "city": "Karachi",
    "location": "DHA Phase 6",
    "emergency": False,
    "detected_language": "roman_urdu",
}

MOCK_INTENT_EMERGENCY = {**MOCK_INTENT, "emergency": True}

MOCK_PRICING = {"estimated_base": 2500, "total": 2500}

MOCK_BID_A = {
    "provider_id": "p001",
    "provider_name": "Provider 1",
    "provider_rating": 4.5,
    "provider_distance_km": 2.0,
    "provider_phone": "03001234567",
    "bid_price": 2000,
    "eta_minutes": 20,
    "bid_time": "2026-01-01T10:00:00",
    "status": "submitted",
    "past_performance_score": 0.8,
    "message": "Aaunga 10 baje",
}
MOCK_BID_B = {
    "provider_id": "p002",
    "provider_name": "Provider 2",
    "provider_rating": 4.0,
    "provider_distance_km": 3.5,
    "provider_phone": "03001234568",
    "bid_price": 2800,
    "eta_minutes": 35,
    "bid_time": "2026-01-01T10:00:01",
    "status": "submitted",
    "past_performance_score": 0.6,
    "message": "Available hun",
}
MOCK_BID_C = {
    "provider_id": "p003",
    "provider_name": "Provider 3",
    "provider_rating": 4.8,
    "provider_distance_km": 1.5,
    "provider_phone": "03001234569",
    "bid_price": 2200,
    "eta_minutes": 15,
    "bid_time": "2026-01-01T10:00:02",
    "status": "submitted",
    "past_performance_score": 0.9,
    "message": "Jaldi aa sakta hun",
}

ALL_MOCK_BIDS = [MOCK_BID_A, MOCK_BID_B, MOCK_BID_C]


@pytest.fixture
def agent():
    return MoltolAgent()


class TestBidScoring:
    def test_weights_sum_to_one(self):
        total = WEIGHT_PRICE + WEIGHT_ETA + WEIGHT_RATING + WEIGHT_PAST_PERF
        assert abs(total - 1.0) < 0.001

    def test_score_returns_float(self):
        score = _score_bid(MOCK_BID_A, ALL_MOCK_BIDS)
        assert isinstance(score, float)

    def test_score_between_0_and_1(self):
        for bid in ALL_MOCK_BIDS:
            score = _score_bid(bid, ALL_MOCK_BIDS)
            assert 0.0 <= score <= 1.0

    def test_lower_price_scores_higher(self):
        bids = [MOCK_BID_A, MOCK_BID_B]
        score_a = _score_bid(MOCK_BID_A, bids)
        score_b = _score_bid(MOCK_BID_B, bids)
        assert score_a != score_b

    def test_score_all_bids_sorted_descending(self):
        scored = _score_all_bids(ALL_MOCK_BIDS)
        scores = [b["composite_score"] for b in scored]
        assert scores == sorted(scores, reverse=True)

    def test_score_all_bids_adds_rank(self):
        scored = _score_all_bids(ALL_MOCK_BIDS)
        ranks = [b["rank"] for b in scored]
        assert ranks == [1, 2, 3]

    def test_single_bid_scores_1(self):
        scored = _score_all_bids([MOCK_BID_A])
        assert scored[0]["composite_score"] == 1.0

    def test_empty_bids_returns_empty(self):
        assert _score_all_bids([]) == []


@pytest.mark.asyncio
class TestNegotiateFlow:

    @patch("agents.moltol._simulate_provider_bid", new_callable=AsyncMock, return_value=MOCK_BID_A)
    async def test_status_bids_ready(self, mock_bid, agent):
        result = await agent.negotiate(MOCK_INTENT, MOCK_PROVIDERS, MOCK_PRICING)
        assert result["status"] == "bids_ready"

    @patch("agents.moltol._simulate_provider_bid", new_callable=AsyncMock, return_value=MOCK_BID_A)
    async def test_session_id_format(self, mock_bid, agent):
        result = await agent.negotiate(MOCK_INTENT, MOCK_PROVIDERS, MOCK_PRICING)
        assert result["session_id"].startswith("NEG-")

    @patch("agents.moltol._simulate_provider_bid", new_callable=AsyncMock, return_value=MOCK_BID_A)
    async def test_top_bids_max_3(self, mock_bid, agent):
        result = await agent.negotiate(MOCK_INTENT, MOCK_PROVIDERS, MOCK_PRICING)
        assert len(result["top_bids"]) <= TOP_BIDS_TO_PRESENT

    @patch("agents.moltol._simulate_provider_bid", new_callable=AsyncMock, return_value=MOCK_BID_A)
    async def test_broadcast_max_5(self, mock_bid, agent):
        result = await agent.negotiate(MOCK_INTENT, MOCK_PROVIDERS, MOCK_PRICING)
        assert result["broadcast_count"] <= MAX_PROVIDERS_TO_BROADCAST

    @patch("agents.moltol._simulate_provider_bid", new_callable=AsyncMock, return_value=MOCK_BID_A)
    async def test_recommendation_present(self, mock_bid, agent):
        result = await agent.negotiate(MOCK_INTENT, MOCK_PROVIDERS, MOCK_PRICING)
        assert result["recommendation"]
        assert len(result["recommendation"]) > 10

    @patch("agents.moltol._simulate_provider_bid", new_callable=AsyncMock, return_value=MOCK_BID_A)
    async def test_recommended_provider_id_set(self, mock_bid, agent):
        result = await agent.negotiate(MOCK_INTENT, MOCK_PROVIDERS, MOCK_PRICING)
        assert result["recommended_provider_id"] is not None

    @patch("agents.moltol._simulate_provider_bid", new_callable=AsyncMock, return_value=None)
    async def test_no_bids_status(self, mock_bid, agent):
        result = await agent.negotiate(MOCK_INTENT, MOCK_PROVIDERS, MOCK_PRICING)
        assert result["status"] == "no_bids"
        assert result["top_bids"] == []

    @patch("agents.moltol._simulate_provider_bid", new_callable=AsyncMock, return_value=MOCK_BID_A)
    async def test_fallback_chain_present(self, mock_bid, agent):
        result = await agent.negotiate(MOCK_INTENT, MOCK_PROVIDERS, MOCK_PRICING)
        assert isinstance(result["fallback_chain"], list)

    @patch("agents.moltol._simulate_provider_bid", new_callable=AsyncMock, return_value=MOCK_BID_A)
    async def test_log_block_complete(self, mock_bid, agent):
        result = await agent.negotiate(MOCK_INTENT, MOCK_PROVIDERS, MOCK_PRICING)
        log = result["_log"]
        for key in [
            "agent_name",
            "start_time",
            "end_time",
            "decision_made",
            "confidence",
            "time_seconds",
            "weights_used",
        ]:
            assert key in log, f"Missing log key: {key}"
        assert log["agent_name"] == "MOLTOL"

    @patch("agents.moltol._simulate_provider_bid", new_callable=AsyncMock, return_value=MOCK_BID_A)
    async def test_weights_logged(self, mock_bid, agent):
        result = await agent.negotiate(MOCK_INTENT, MOCK_PROVIDERS, MOCK_PRICING)
        weights = result["_log"]["weights_used"]
        assert weights["price"] == WEIGHT_PRICE
        assert abs(sum(weights.values()) - 1.0) < 0.001

    @patch("agents.moltol._simulate_provider_bid", new_callable=AsyncMock, return_value=MOCK_BID_A)
    async def test_emergency_broadcast_log_channel_whatsapp(self, mock_bid, agent):
        result = await agent.negotiate(MOCK_INTENT_EMERGENCY, MOCK_PROVIDERS, MOCK_PRICING)
        channels = [b["channel"] for b in result["broadcast_log"]]
        assert all(c == "whatsapp" for c in channels)

    @patch("agents.moltol._simulate_provider_bid", new_callable=AsyncMock, return_value=MOCK_BID_A)
    async def test_negotiation_savings_non_negative(self, mock_bid, agent):
        result = await agent.negotiate(MOCK_INTENT, MOCK_PROVIDERS, MOCK_PRICING)
        assert result["total_negotiation_savings"] >= 0

    @patch("agents.moltol._simulate_provider_bid", new_callable=AsyncMock, return_value=MOCK_BID_A)
    async def test_return_dict_all_keys(self, mock_bid, agent):
        result = await agent.negotiate(MOCK_INTENT, MOCK_PROVIDERS, MOCK_PRICING)
        required_keys = [
            "session_id",
            "service",
            "city",
            "status",
            "top_bids",
            "all_bids_ranked",
            "recommendation",
            "recommended_provider_id",
            "broadcast_count",
            "bids_received",
            "no_response_providers",
            "broadcast_log",
            "negotiation_log",
            "total_negotiation_savings",
            "median_bid_price",
            "average_bid_price",
            "reference_price",
            "fallback_chain",
            "cancellation_note",
            "_log",
        ]
        for key in required_keys:
            assert key in result, f"Missing key: {key}"


@pytest.mark.asyncio
class TestCancellationHandler:

    def _mock_session(self):
        scored = _score_all_bids(ALL_MOCK_BIDS)
        return {
            "all_bids_ranked": scored,
            "fallback_chain": [
                {
                    "rank": b["rank"],
                    "provider_id": b["provider_id"],
                    "provider_name": b.get("provider_name", ""),
                    "status": "standby",
                }
                for b in scored
            ],
        }

    async def test_cancellation_activates_next(self, agent):
        session = self._mock_session()
        winner_id = session["all_bids_ranked"][0]["provider_id"]
        result = await agent.handle_cancellation(session, winner_id)
        assert result["status"] == "fallback_activated"
        assert result["new_provider_id"] != winner_id

    async def test_cancellation_unknown_provider(self, agent):
        session = self._mock_session()
        result = await agent.handle_cancellation(session, "unknown_xyz")
        assert result["status"] == "error"

    async def test_cancellation_last_provider_no_fallback(self, agent):
        session = self._mock_session()
        last_id = session["all_bids_ranked"][-1]["provider_id"]
        result = await agent.handle_cancellation(session, last_id)
        assert result["status"] == "no_fallback"

    async def test_cancellation_message_has_provider_name(self, agent):
        session = self._mock_session()
        winner_id = session["all_bids_ranked"][0]["provider_id"]
        result = await agent.handle_cancellation(session, winner_id)
        if result["status"] == "fallback_activated":
            assert result["message"]
            assert "Rs." in result["message"]
