"""Run manually: py -m tests.pakka_smoke_test"""
import asyncio
import sys
from pathlib import Path
from unittest.mock import AsyncMock, patch

_BACKEND = Path(__file__).resolve().parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from agents.pakka import PakkaAgent

PROVIDER = {
    "id": "p001", "name": "Hamza AC Services", "phone": "03001234567",
    "service": "AC technician", "city": "Karachi",
    "lat": 24.790, "lng": 67.068, "rating": 4.7,
    "available_slots": ["09:00", "10:00", "14:00", "16:00"],
}
PRICING = {"total": 3500, "labor": 2000, "parts": 1500}

CASES = [
    {
        "label": "Normal booking — slot free",
        "intent": {"service_type": "AC repair", "location": "DHA Phase 6",
                   "city": "Karachi", "time_preference": "tomorrow_morning",
                   "urgency": "medium", "job_complexity": "intermediate",
                   "emergency": False},
        "conflict": False,
        "expect_status": "confirmed",
    },
    {
        "label": "Conflict — alternate slot found",
        "intent": {"service_type": "AC repair", "location": "DHA Phase 6",
                   "city": "Karachi", "time_preference": "tomorrow_morning",
                   "urgency": "medium", "job_complexity": "intermediate",
                   "emergency": False},
        "conflict_sequence": [True, True, True, False, False, False, False, False],
        "expect_status": "confirmed",
    },
    {
        "label": "All slots busy — waitlist",
        "intent": {"service_type": "plumber", "location": "Gulberg",
                   "city": "Lahore", "time_preference": "today",
                   "urgency": "high", "job_complexity": "basic",
                   "emergency": False},
        "conflict": True,
        "expect_status": "waitlisted",
    },
    {
        "label": "Emergency — first free slot within 2 hours",
        "intent": {"service_type": "electrician", "location": "F-7",
                   "city": "Islamabad", "time_preference": "now",
                   "urgency": "critical", "job_complexity": "complex",
                   "emergency": True},
        "conflict": False,
        "expect_status": "confirmed",
    },
]


async def run():
    agent = PakkaAgent()
    all_passed = True

    for case in CASES:
        if "conflict_sequence" in case:
            mock_patch = patch("agents.pakka.check_slot_conflict",
                               new_callable=AsyncMock,
                               side_effect=case["conflict_sequence"])
        else:
            mock_patch = patch("agents.pakka.check_slot_conflict",
                               new_callable=AsyncMock,
                               return_value=case["conflict"])

        with mock_patch, \
             patch("agents.pakka.save_booking", new_callable=AsyncMock, return_value=True):
            result = await agent.create_booking(case["intent"], PROVIDER, PRICING)

        expected = case["expect_status"]
        actual = result["status"]
        passed = actual == expected
        if not passed:
            all_passed = False

        icon = "PASS" if passed else "FAIL"
        print(f"\n{icon} {case['label']}")
        print(f"   Status          : {actual} (expected: {expected})")
        print(f"   Booking ID      : {result['booking_id']}")
        print(f"   Scheduled time  : {result['scheduled_time']}")
        print(f"   Waitlisted      : {result['waitlisted']}")
        print(f"   Alternate slots : {result['alternate_slots']}")
        print(f"   Notification    : {result['notification']['type']}")
        print(f"   Reminders       : {len(result['reminder_times'])} set")
        conf = result["confirmation_message"][:80].encode("ascii", errors="replace").decode()
        print(f"   Confirmation    : {conf}")
        if result.get("confirmation_message_urdu"):
            urdu = result["confirmation_message_urdu"][:60].encode("ascii", errors="replace").decode()
            print(f"   Urdu msg        : {urdu}")
        if result.get("waitlist_entry"):
            print(f"   Waitlist ID     : {result['waitlist_entry']['waitlist_id']}")
        log = result["_log"]
        print(f"   Time taken      : {log['time_seconds']}s")
        if not passed:
            print(f"   FAIL: got '{actual}', expected '{expected}'")

    print(f"\n{'=' * 55}")
    print("ALL PAKKA TESTS PASSED" if all_passed else "SOME TESTS FAILED")
    print("=" * 55)


if __name__ == "__main__":
    asyncio.run(run())
