"""Run manually: py -m tests.moltol_smoke_test"""
import asyncio
import sys
from pathlib import Path
from unittest.mock import patch

_BACKEND = Path(__file__).resolve().parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from agents.moltol import MoltolAgent

PROVIDERS = [
    {
        "id": f"p00{i}",
        "name": f"Ustad {['Ali', 'Ahmed', 'Tariq', 'Bilal', 'Hamza'][i - 1]}",
        "rating": [4.8, 4.2, 4.6, 3.9, 4.5][i - 1],
        "distance_km": [1.2, 3.5, 2.1, 4.8, 1.8][i - 1],
        "phone": f"0300000000{i}",
    }
    for i in range(1, 6)
]

BIDS = [
    {
        "provider_id": "p001",
        "provider_name": "Ustad Ali",
        "provider_rating": 4.8,
        "provider_distance_km": 1.2,
        "provider_phone": "03001",
        "bid_price": 2200,
        "eta_minutes": 20,
        "past_performance_score": 0.9,
        "bid_time": "2026-01-01T10:00:00",
        "status": "submitted",
        "message": "Kal 10 baje aaunga",
    },
    {
        "provider_id": "p002",
        "provider_name": "Ustad Ahmed",
        "provider_rating": 4.2,
        "provider_distance_km": 3.5,
        "provider_phone": "03002",
        "bid_price": 3200,
        "eta_minutes": 40,
        "past_performance_score": 0.6,
        "bid_time": "2026-01-01T10:00:01",
        "status": "submitted",
        "message": "Available hun",
    },
    {
        "provider_id": "p003",
        "provider_name": "Ustad Tariq",
        "provider_rating": 4.6,
        "provider_distance_km": 2.1,
        "provider_phone": "03003",
        "bid_price": 2500,
        "eta_minutes": 25,
        "past_performance_score": 0.85,
        "bid_time": "2026-01-01T10:00:02",
        "status": "submitted",
        "message": "Sab kuch thek kar dunga",
    },
    {
        "provider_id": "p004",
        "provider_name": "Ustad Bilal",
        "provider_rating": 3.9,
        "provider_distance_km": 4.8,
        "provider_phone": "03004",
        "bid_price": 1900,
        "eta_minutes": 55,
        "past_performance_score": 0.5,
        "bid_time": "2026-01-01T10:00:03",
        "status": "submitted",
        "message": "Sasta karonga",
    },
    {
        "provider_id": "p005",
        "provider_name": "Ustad Hamza",
        "provider_rating": 4.5,
        "provider_distance_km": 1.8,
        "provider_phone": "03005",
        "bid_price": 2800,
        "eta_minutes": 18,
        "past_performance_score": 0.88,
        "bid_time": "2026-01-01T10:00:04",
        "status": "submitted",
        "message": "Jaldi pohonch sakta hun",
    },
]

CASES = [
    {
        "label": "Normal AC repair — 5 bids, negotiation expected",
        "intent": {
            "service_type": "AC repair",
            "city": "Karachi",
            "location": "DHA Phase 6",
            "emergency": False,
            "detected_language": "roman_urdu",
        },
        "pricing": {"estimated_base": 2500},
        "mock_bids": BIDS,
        "expect_status": "bids_ready",
    },
    {
        "label": "Emergency plumber — whatsapp channel, fast ETAs",
        "intent": {
            "service_type": "plumber",
            "city": "Lahore",
            "location": "Gulberg",
            "emergency": True,
            "detected_language": "roman_urdu",
        },
        "pricing": {"estimated_base": 1800},
        "mock_bids": BIDS[:3],
        "expect_status": "bids_ready",
    },
    {
        "label": "No responses — all providers silent",
        "intent": {
            "service_type": "electrician",
            "city": "Islamabad",
            "location": "F-7",
            "emergency": False,
            "detected_language": "urdu",
        },
        "pricing": {"estimated_base": 3000},
        "mock_bids": [],
        "expect_status": "no_bids",
    },
    {
        "label": "Cancellation fallback — winner drops out",
        "intent": {
            "service_type": "AC repair",
            "city": "Karachi",
            "location": "DHA",
            "emergency": False,
            "detected_language": "roman_urdu",
        },
        "pricing": {"estimated_base": 2500},
        "mock_bids": BIDS,
        "expect_status": "bids_ready",
        "test_cancellation": True,
    },
]


async def run():
    agent = MoltolAgent()
    all_passed = True

    for case in CASES:
        bid_iter = iter(case["mock_bids"] + [None] * 10)

        async def fake_bid(*args, **kwargs):
            try:
                return next(bid_iter)
            except StopIteration:
                return None

        with patch("agents.moltol._simulate_provider_bid", side_effect=fake_bid):
            result = await agent.negotiate(case["intent"], PROVIDERS, case["pricing"])

        expected = case["expect_status"]
        actual = result["status"]
        passed = actual == expected
        if not passed:
            all_passed = False

        icon = "PASS" if passed else "FAIL"
        print(f"\n{icon} {case['label']}")
        print(f"   Status          : {actual} (expected: {expected})")
        print(f"   Session ID      : {result['session_id']}")
        print(f"   Bids received   : {result['bids_received']}/{result['broadcast_count']}")
        print(f"   Median price    : Rs. {result['median_bid_price']:,}")
        print(f"   Negotiation saves: Rs. {result['total_negotiation_savings']:,}")
        rec = result["recommendation"][:80].encode("ascii", errors="replace").decode()
        print(f"   Recommendation  : {rec}")
        if result["top_bids"]:
            for b in result["top_bids"]:
                neg = " [negotiated]" if b.get("negotiated") else ""
                print(
                    f"   Rank {b['rank']}: {b.get('provider_name')} — "
                    f"Rs.{b['bid_price']:,} | {b['eta_minutes']}min | "
                    f"score={b['composite_score']:.3f}{neg}"
                )

        if case.get("test_cancellation") and result["top_bids"]:
            winner_id = result["top_bids"][0]["provider_id"]
            cancel_result = await agent.handle_cancellation(result, winner_id)
            cancel_ok = cancel_result["status"] in ["fallback_activated", "no_fallback"]
            if not cancel_ok:
                all_passed = False
            msg = cancel_result.get("message", "")[:60].encode("ascii", errors="replace").decode()
            print(f"   Cancellation    : {cancel_result['status']} — {msg}")

        log = result["_log"]
        print(f"   Time taken      : {log['time_seconds']}s | confidence={log['confidence']:.2f}")

        if not passed:
            print(f"   FAIL: got '{actual}', expected '{expected}'")

    print(f"\n{'=' * 60}")
    print("ALL MOLTOL TESTS PASSED" if all_passed else "SOME TESTS FAILED")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(run())
