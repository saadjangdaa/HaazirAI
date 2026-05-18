"""Integration tests: Samajh → Dhundho → Chunno on POST /api/request."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

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


def test_chunno_returns_ranked_providers(ac_repair_response):
    data = ac_repair_response.json()
    assert data.get("clarification_needed") is not True
    ranked = data.get("providers_ranked") or []
    if not ranked:
        pytest.skip("No providers from Dhundho for this fixture input")
    for p in ranked:
        assert "ranking_score" in p
        assert "ranking_reason_urdu" in p
    scores = [p["ranking_score"] for p in ranked]
    assert scores == sorted(scores, reverse=True)


def test_best_provider_from_ranked_list(ac_repair_response):
    data = ac_repair_response.json()
    ranked = data.get("providers_ranked") or []
    best = data.get("best_provider")
    if not ranked or not best:
        pytest.skip("No ranked providers")
    ranked_ids = {p.get("id") for p in ranked}
    assert best.get("id") in ranked_ids


def test_chunno_warnings_field(ac_repair_response):
    data = ac_repair_response.json()
    assert "chunno_warnings" in data
    assert isinstance(data["chunno_warnings"], list)


def test_agent_logs_include_samajh_dhundho_chunno(ac_repair_response):
    data = ac_repair_response.json()
    names = {log.get("agent_name") for log in data.get("agent_logs") or []}
    assert "SAMAJH" in names
    if data.get("providers_ranked"):
        assert "DHUNDHO" in names
        assert "CHUNNO" in names
