"""
Run from repo backend root:

  py -m agents.test_hifazat

Four HIFAZAT scenarios: pre-booking (safe + risky) and post-feedback (critical + reward).
"""
from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

_BACKEND = Path(__file__).resolve().parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from agents.hifazat import HifazatAgent


def _print_case(name: str, result: dict) -> None:
    print("\n" + "=" * 72)
    print(name)
    print("=" * 72)
    # ensure_ascii=True avoids Windows console UnicodeEncodeError on Urdu in _log
    print(json.dumps(result, indent=2, ensure_ascii=True, default=str))


async def _run_all() -> None:
    agent = HifazatAgent()
    normal_customer = {
        "id": "c001",
        "name": "Ali Khan",
        "payment_failures": 0,
        "dispute_count": 0,
        "fake_request_flags": 0,
        "jobs_completed": 12,
        "account_age_days": 180,
        "trust_score": 0.85,
    }
    context = {"emergency": False, "city_avg_price_per_hour": 800.0}

    # Case 1 — Safe provider + safe customer
    r1 = await agent.run(
        "pre_booking",
        {
            "provider": {
                "id": "p001",
                "name": "Safe AC Tech",
                "verified": True,
                "trust_score": 0.92,
                "cancellation_rate": 0.04,
                "jobs_completed": 340,
                "recent_reviews_positive": 0.94,
                "rating": 4.8,
                "review_count": 127,
                "price_per_hour": 800,
                "workload_today": 2,
            },
            "customer": normal_customer,
            "context": context,
        },
    )
    _print_case("Case 1 — Pre-booking: Safe provider + safe customer", r1)

    # Case 2 — Risky provider (new + unverified)
    r2 = await agent.run(
        "pre_booking",
        {
            "provider": {
                "id": "p_risk",
                "name": "New Unverified",
                "verified": False,
                "trust_score": 0.45,
                "cancellation_rate": 0.05,
                "jobs_completed": 2,
                "recent_reviews_positive": 0.55,
                "rating": 4.2,
                "review_count": 5,
                "price_per_hour": 500,
                "workload_today": 1,
            },
            "customer": normal_customer,
            "context": context,
        },
    )
    _print_case("Case 2 — Pre-booking: Risky provider (new + unverified)", r2)

    # Case 3 — Critical complaint (no_show)
    r3 = await agent.run(
        "post_feedback",
        {
            "feedback": {
                "job_id": "j100",
                "provider_id": "p001",
                "customer_id": "c001",
                "rating": 1,
                "complaint": "Provider nahi aaya",
                "complaint_type": "no_show",
                "job_value_pkr": 8000.0,
                "days_since_job": 3,
                "repeat_customer": True,
            }
        },
    )
    _print_case("Case 3 — Post-feedback: Critical complaint (no_show)", r3)

    # Case 4 — 5 star rating
    r4 = await agent.run(
        "post_feedback",
        {
            "feedback": {
                "job_id": "j101",
                "provider_id": "p001",
                "customer_id": "c001",
                "rating": 5,
                "complaint": None,
                "complaint_type": "none",
                "job_value_pkr": 5000.0,
                "days_since_job": 1,
                "repeat_customer": True,
            }
        },
    )
    _print_case("Case 4 — Post-feedback: 5 star rating", r4)


def main() -> None:
    asyncio.run(_run_all())


if __name__ == "__main__":
    main()
