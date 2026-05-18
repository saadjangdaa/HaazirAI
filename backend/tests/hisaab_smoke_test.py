"""Run manually: py -m tests.hisaab_smoke_test"""
import asyncio
import sys
from pathlib import Path

_BACKEND = Path(__file__).resolve().parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from agents.hisaab import HisaabAgent

PROVIDER_PRIMARY = {
    "id": "p001",
    "name": "Ustad Ali AC Services",
    "rating": 4.8,
    "distance_km": 3.0,
    "price_per_hour": 600,
    "estimated_hours": 2.0,
    "phone": "03001234567",
}
PROVIDER_BUDGET = {
    "id": "p002",
    "name": "Budget AC Wala",
    "rating": 4.0,
    "distance_km": 7.0,
    "price_per_hour": 380,
    "phone": "03009876543",
}
ALL_PROVIDERS = [PROVIDER_PRIMARY, PROVIDER_BUDGET]

CASES = [
    {
        "label": "Normal AC repair — medium urgency, no surge (11am)",
        "intent": {
            "service_type": "AC repair",
            "urgency": "medium",
            "job_complexity": "intermediate",
            "budget_sensitivity": "medium",
            "emergency": False,
            "detected_language": "roman_urdu",
        },
        "repeat": False,
        "hour": 11,
        "expect_surge": False,
        "expect_loyalty": False,
    },
    {
        "label": "Emergency electrician — critical urgency, peak hour (6pm)",
        "intent": {
            "service_type": "electrician",
            "urgency": "high",
            "job_complexity": "complex",
            "budget_sensitivity": "low",
            "emergency": True,
            "detected_language": "roman_urdu",
        },
        "repeat": False,
        "hour": 18,
        "expect_surge": True,
        "expect_loyalty": False,
    },
    {
        "label": "Repeat customer — 10% loyalty discount",
        "intent": {
            "service_type": "plumber",
            "urgency": "low",
            "job_complexity": "basic",
            "budget_sensitivity": "medium",
            "emergency": False,
            "detected_language": "roman_urdu",
        },
        "repeat": True,
        "hour": 12,
        "expect_surge": False,
        "expect_loyalty": True,
    },
    {
        "label": "Budget sensitive — should get cheaper alternative",
        "intent": {
            "service_type": "AC repair",
            "urgency": "medium",
            "job_complexity": "intermediate",
            "budget_sensitivity": "high",
            "emergency": False,
            "detected_language": "roman_urdu",
        },
        "repeat": False,
        "hour": 11,
        "expect_budget_alt": True,
    },
    {
        "label": "Urdu language — fairness note in Urdu script",
        "intent": {
            "service_type": "AC repair",
            "urgency": "medium",
            "job_complexity": "intermediate",
            "budget_sensitivity": "medium",
            "emergency": False,
            "detected_language": "urdu",
        },
        "repeat": False,
        "hour": 11,
        "expect_surge": False,
    },
]


async def run():
    agent = HisaabAgent()
    all_passed = True

    for case in CASES:
        result = await agent.calculate_price(
            case["intent"],
            PROVIDER_PRIMARY,
            providers_list=ALL_PROVIDERS,
            is_repeat_customer=case.get("repeat", False),
            override_hour=case.get("hour", 11),
        )

        checks = []

        if case.get("expect_surge"):
            checks.append(("surge_pricing > 0", result["surge_pricing"] > 0))
        if case.get("expect_loyalty"):
            checks.append(("loyalty_discount < 0", result["loyalty_discount"] < 0))
        if case.get("expect_budget_alt"):
            checks.append(
                ("budget_alternative present", result["budget_alternative"] is not None)
            )
        checks.append(("total > 0", result["total"] > 0))
        checks.append(
            (
                "total = sum of parts",
                result["total"]
                == (
                    result["base_price"]
                    + result["distance_cost"]
                    + result["urgency_adjustment"]
                    + result["complexity_fee"]
                    + result["surge_pricing"]
                    + result["loyalty_discount"]
                ),
            )
        )

        passed = all(ok for _, ok in checks)
        if not passed:
            all_passed = False

        icon = "PASS" if passed else "FAIL"
        print(f"\n{icon} {case['label']}")
        print(f"   Quote ID        : {result['quote_id']}")
        print(f"   Base price      : Rs. {result['base_price']:,}")
        print(f"   Distance cost   : Rs. {result['distance_cost']:,}")
        print(
            f"   Urgency adj     : Rs. {result['urgency_adjustment']:,} "
            f"(x{result['urgency_multiplier']})"
        )
        print(
            f"   Complexity fee  : Rs. {result['complexity_fee']:,} "
            f"(x{result['complexity_multiplier']})"
        )
        print(
            f"   Surge pricing   : Rs. {result['surge_pricing']:,} "
            f"(x{result['surge_multiplier']})"
        )
        print(f"   Loyalty disc    : Rs. {result['loyalty_discount']:,}")
        print("   -----------------------------")
        print(f"   TOTAL           : Rs. {result['total']:,}")
        fn = result["fairness_note"][:70].encode("ascii", errors="replace").decode()
        print(f"   Fairness note   : {fn}")
        vv = result["value_verdict"].encode("ascii", errors="replace").decode()
        print(f"   Value verdict   : {vv}")
        if result.get("surge_warning"):
            sw = result["surge_warning"][:80].encode("ascii", errors="replace").decode()
            print(f"   Surge warning   : {sw}")
        if result.get("budget_alternative"):
            alt = result["budget_alternative"]
            alt_line = (
                f"   Budget alt      : {alt['provider_name']} — "
                f"Rs. {alt['total']:,} | {alt['tradeoff']}"
            )
            print(alt_line.encode("ascii", errors="replace").decode())
        pe = result["price_explanation"][:80].encode("ascii", errors="replace").decode()
        print(f"   Explanation     : {pe}")
        print(f"   Time taken      : {result['_log']['time_seconds']}s")

        for check_name, ok in checks:
            if not ok:
                print(f"   FAIL: {check_name}")

    print(f"\n{'=' * 60}")
    print("ALL HISAAB TESTS PASSED" if all_passed else "SOME TESTS FAILED")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(run())
