"""
Run manually: python -m tests.smoke_test
Verifies full Dhundho pipeline with mocked Firebase + Maps.
"""
import asyncio
from unittest.mock import AsyncMock, patch

from agents.dhundho import DhundhoAgent

MOCK_COORDS = {"lat": 33.7215, "lng": 73.0433, "formatted_address": "Test Area"}

CASES = [
    {
        "label": "AC repair Islamabad — standard booking",
        "intent": {
            "service_type": "AC repair",
            "city": "Islamabad",
            "location": "DHA Phase 2",
            "job_complexity": "intermediate",
            "emergency": False,
            "time_preference": "tomorrow_morning",
        },
    },
    {
        "label": "Emergency plumber Karachi",
        "intent": {
            "service_type": "plumber",
            "city": "Karachi",
            "location": "Clifton",
            "job_complexity": "basic",
            "emergency": True,
        },
    },
    {
        "label": "Complex electrician Lahore — all slots busy",
        "intent": {
            "service_type": "electrician",
            "city": "Lahore",
            "location": "Gulberg",
            "job_complexity": "complex",
            "emergency": False,
            "time_preference": "today",
        },
        "mock_conflict": True,
    },
    {
        "label": "now time preference — must return real datetime not ASAP",
        "intent": {
            "service_type": "plumber",
            "city": "Islamabad",
            "location": "F-7",
            "job_complexity": "basic",
            "emergency": False,
            "time_preference": "now",
        },
    },
    {
        "label": "Real geocode path — Karachi DHA (API mocked accurately)",
        "intent": {
            "service_type": "AC repair",
            "city": "Karachi",
            "location": "DHA Phase 6",
            "job_complexity": "intermediate",
            "emergency": False,
            "time_preference": "tomorrow_morning",
        },
        "mock_coords": {
            "lat": 24.7920,
            "lng": 67.0686,
            "formatted_address": "DHA Phase 6, Karachi, Pakistan",
            "source": "geocoding_api",
        },
    },
]


async def run():
    agent = DhundhoAgent()
    all_passed = True

    for case in CASES:
        conflict_val = case.get("mock_conflict", False)
        coords = case.get("mock_coords", MOCK_COORDS)
        with patch(
            "agents.dhundho.check_slot_conflict", new_callable=AsyncMock, return_value=conflict_val
        ), patch("agents.dhundho.get_user_coordinates", return_value=coords):

            result = await agent.find_providers(case["intent"])
            st = result["scheduled_time_checked"]
            asap_leaked = st == "ASAP"
            passed = not asap_leaked

            print(f"\n{'[OK]' if passed else '[FAIL]'} {case['label']}")
            print(f"   Providers found : {result['total_found']}")
            print(f"   Fallback        : {result['fallback_triggered']}")
            print(f"   Scheduled time  : {st}")
            print(f"   Filter trace    : {result['filter_trace']}")
            if result["providers"]:
                top = result["providers"][0]
                print(f"   Top provider    : {top.get('name', '?')} — {top.get('distance_km', 0):.1f}km")
            if result["fallback_triggered"]:
                print(f"   Hint            : {result['next_available_slot_hint']}")
            if asap_leaked:
                print("   FAIL: scheduled_time is still 'ASAP' string — Fix 1 not applied")
                all_passed = False

    print(f"\n{'All smoke tests passed' if all_passed else 'Some tests failed — see above'}")


if __name__ == "__main__":
    asyncio.run(run())
