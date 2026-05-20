"""Phase D — HIFAZAT dispute evaluation + complaint analyzer."""
import asyncio

import pytest

from agents.hifazat import HifazatAgent, analyze_complaint


class TestAnalyzeComplaint:
    def test_valid_complaint(self):
        r = analyze_complaint("Provider ne kaam adhoora chhor diya aur wire loose hai.")
        assert r["complaint_verdict"] == "valid"

    def test_abuse_risk(self):
        r = analyze_complaint("Ye scam hai tum sab fraud ho!")
        assert r["complaint_verdict"] == "abuse_risk"

    def test_rude_behavior_small_delta(self):
        agent = HifazatAgent()
        result = asyncio.run(
            agent.evaluate_dispute(
                booking={"booking_id": "B1", "status": "completed", "price": 2000},
                dispute={
                    "type": "rude_behavior",
                    "customer_message": "Kaam theek tha lekin behavior bohot rude tha",
                    "worker_response": {"message": "Main ne professional tareeqay se kaam kiya"},
                    "user_id": "cust1",
                    "worker_id": "p1",
                },
                provider={"id": "p1", "trust_score": 0.85, "cancellation_rate": 0.05},
                customer={"id": "cust1", "trust_score": 0.9, "dispute_count": 0},
                provider_serious_dispute_count=0,
            )
        )
        assert result["complaint_verdict"] == "valid"
        assert result["recommended_action"] in ("no_action", "warn_worker")
        assert result["provider_trust_delta"] == -0.03
        assert result["non_blocking"] is True
        assert result["refund_recommended"] is False

    def test_repeated_serious_complaints(self):
        agent = HifazatAgent()
        result = asyncio.run(
            agent.evaluate_dispute(
                booking={"booking_id": "B2", "status": "completed"},
                dispute={
                    "type": "no_show",
                    "customer_message": "Worker bilkul nahi aaya slot par",
                    "worker_response": {"message": "Traffic ki wajah se late ho gaya"},
                },
                provider={"id": "p2", "trust_score": 0.7},
                customer={"id": "c2"},
                provider_serious_dispute_count=3,
            )
        )
        assert result["recommended_action"] == "block_recommendation"
        assert "REPEATED_SERIOUS_COMPLAINTS" in result["risk_flags"]


def test_trust_points_to_delta():
    from services.trust_service import trust_points_to_delta

    assert trust_points_to_delta(5) == 0.05
    assert trust_points_to_delta(-10) == -0.1
