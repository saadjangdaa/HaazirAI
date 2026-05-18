"""Integration tests: full LangGraph pipeline on POST /api/request."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from agents.hifazat import HifazatAgent
from main import app

client = TestClient(app)


@pytest.fixture(scope="module")
def ac_repair_response():
    return client.post(
        "/api/request",
        json={
            "user_input": "Mujhe AC repair chahiye kal subah G-13 Islamabad",
            "user_location": "G-13, Islamabad",
            "user_id": "test_user",
        },
    )


def test_request_returns_200(ac_repair_response):
    assert ac_repair_response.status_code == 200


def test_hifazat_returns_trust_scores(ac_repair_response):
    data = ac_repair_response.json()
    assert data.get("clarification_needed") is not True
    ranked = data.get("providers_ranked") or []
    if not ranked:
        pytest.skip("No providers from Dhundho for this fixture input")
    trust_scores = data.get("trust_scores") or []
    assert trust_scores
    assert len(trust_scores) >= len(ranked)
    for entry in trust_scores:
        assert "provider_id" in entry
        assert "trust_score" in entry
        assert "recommended_action" in entry


def test_providers_still_sorted_by_chunno(ac_repair_response):
    data = ac_repair_response.json()
    ranked = data.get("providers_ranked") or []
    if not ranked:
        pytest.skip("No ranked providers")
    scores = [p["ranking_score"] for p in ranked]
    assert scores == sorted(scores, reverse=True)


def test_agent_logs_include_hifazat(ac_repair_response):
    data = ac_repair_response.json()
    names = {log.get("agent_name") for log in data.get("agent_logs") or []}
    assert "SAMAJH" in names
    if data.get("providers_ranked"):
        assert "DHUNDHO" in names
        assert "CHUNNO" in names
        assert "HIFAZAT" in names
        assert "HISAAB" in names
        assert "MOLTOL" in names
        assert "PAKKA" in names


def test_hisaab_pakka_moltol_fields(ac_repair_response):
    data = ac_repair_response.json()
    if not data.get("providers_ranked"):
        pytest.skip("No providers")
    pricing = data.get("price_breakdown") or {}
    assert pricing.get("total")
    moltol = data.get("moltol_result") or {}
    assert moltol.get("status") in ("bids_ready", "no_bids")
    booking = data.get("booking") or {}
    assert booking.get("booking_id", "").startswith("HAZ-")


def test_hifazat_meta_present(ac_repair_response):
    data = ac_repair_response.json()
    meta = data.get("hifazat_meta")
    if not data.get("providers_ranked"):
        pytest.skip("No providers")
    assert isinstance(meta, dict)
    assert meta.get("assessed_count", 0) > 0


@pytest.mark.asyncio
async def test_assess_trust_blocks_high_cancellation_provider():
    agent = HifazatAgent()
    risky = {
        "id": "p_risky",
        "verified": False,
        "trust_score": 0.52,
        "cancellation_rate": 0.31,
        "jobs_completed": 1,
        "recent_reviews_positive": 0.45,
        "rating": 4.9,
        "review_count": 8,
        "price_per_hour": 3200,
    }
    result = await agent.assess_trust([risky], "unit_test_user")
    assessment = result["assessments"][0]
    assert assessment["recommended_action"] == "BLOCK"
    assert assessment["trust_score"] < 0.5
    assert "HIGH_CANCELLATION_RATE" in assessment["risk_flags"]
