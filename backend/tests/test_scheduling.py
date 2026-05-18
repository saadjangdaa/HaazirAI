"""Tests for services/scheduling.py — no mocks needed, pure logic."""
from datetime import datetime, timedelta
from services.scheduling import scheduled_time_from_intent

FMT = "%Y-%m-%d %H:%M"


def _parse(s: str) -> datetime:
    return datetime.strptime(s, FMT)


class TestEmergency:
    def test_emergency_returns_real_datetime(self):
        result = scheduled_time_from_intent({"emergency": True})
        dt = _parse(result)  # must not raise
        assert dt > datetime.now()

    def test_emergency_within_2_hours(self):
        result = scheduled_time_from_intent({"emergency": True})
        dt = _parse(result)
        assert (dt - datetime.now()).total_seconds() < 7200

    def test_emergency_overrides_time_preference(self):
        # emergency=True should win even if time_preference says tomorrow
        result = scheduled_time_from_intent({"emergency": True, "time_preference": "tomorrow_morning"})
        dt = _parse(result)
        assert (dt - datetime.now()).total_seconds() < 7200


class TestNow:
    def test_now_returns_real_datetime_not_asap(self):
        result = scheduled_time_from_intent({"time_preference": "now"})
        assert result != "ASAP"
        dt = _parse(result)  # must parse without raising
        assert dt > datetime.now()

    def test_now_is_within_1_hour(self):
        result = scheduled_time_from_intent({"time_preference": "now"})
        dt = _parse(result)
        assert (dt - datetime.now()).total_seconds() < 3600


class TestStandardPreferences:
    def test_today_returns_today_at_1500(self):
        result = scheduled_time_from_intent({"time_preference": "today"})
        assert "15:00" in result
        assert datetime.now().strftime("%Y-%m-%d") in result

    def test_tomorrow_morning_is_10am(self):
        result = scheduled_time_from_intent({"time_preference": "tomorrow_morning"})
        assert "10:00" in result
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        assert tomorrow in result

    def test_tomorrow_afternoon_is_2pm(self):
        result = scheduled_time_from_intent({"time_preference": "tomorrow_afternoon"})
        assert "14:00" in result

    def test_this_week_is_day_after_tomorrow(self):
        result = scheduled_time_from_intent({"time_preference": "this_week"})
        expected_date = (datetime.now() + timedelta(days=2)).strftime("%Y-%m-%d")
        assert expected_date in result

    def test_flexible_defaults_to_tomorrow_morning(self):
        result = scheduled_time_from_intent({"time_preference": "flexible"})
        assert "10:00" in result

    def test_unknown_preference_defaults_to_tomorrow_morning(self):
        result = scheduled_time_from_intent({"time_preference": "gibberish_xyz"})
        assert "10:00" in result

    def test_empty_intent_returns_valid_datetime(self):
        result = scheduled_time_from_intent({})
        _parse(result)  # must not raise


class TestSpecificTime:
    def test_valid_future_specific_time(self):
        future = (datetime.now() + timedelta(days=3)).strftime(FMT)
        result = scheduled_time_from_intent({"time_preference": "specific_time", "specific_datetime": future})
        assert result == future

    def test_past_specific_time_falls_back_to_default(self):
        past = "2020-01-01 10:00"
        result = scheduled_time_from_intent({"time_preference": "specific_time", "specific_datetime": past})
        assert result != past
        _parse(result)  # still a valid datetime

    def test_malformed_specific_time_falls_back(self):
        result = scheduled_time_from_intent({"time_preference": "specific_time", "specific_datetime": "not-a-date"})
        _parse(result)  # must still return a valid datetime
