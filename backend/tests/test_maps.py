"""Tests for services/maps.py — Geocoding API + fallback logic."""
import json
import sys
from pathlib import Path
from unittest.mock import patch

import pytest

# Allow `python tests/test_maps.py` or `py -m tests.test_maps` when cwd is not backend
_BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

from services.maps import get_user_coordinates, haversine, CITY_FALLBACK_COORDS


class TestHaversine:
    def test_same_point_is_zero(self):
        assert haversine(33.72, 73.04, 33.72, 73.04) == 0.0

    def test_karachi_to_islamabad_approx(self):
        dist = haversine(24.86, 67.01, 33.68, 73.05)
        assert 1100 < dist < 1400

    def test_returns_float(self):
        result = haversine(24.86, 67.01, 31.52, 74.36)
        assert isinstance(result, float)


class TestCityFallback:
    def test_all_major_cities_present(self):
        for city in ["karachi", "lahore", "islamabad", "peshawar", "quetta"]:
            assert city in CITY_FALLBACK_COORDS

    def test_fallback_used_when_no_api_key(self):
        with patch("services.maps.GOOGLE_MAPS_API_KEY", ""):
            result = get_user_coordinates("DHA Phase 6", "Karachi")
        assert result["lat"] == CITY_FALLBACK_COORDS["karachi"]["lat"]
        assert result["fallback"] is True
        assert result["source"] == "no_api_key"

    def test_unknown_city_defaults_to_islamabad(self):
        with patch("services.maps.GOOGLE_MAPS_API_KEY", ""):
            result = get_user_coordinates("", "MadeUpCity")
        assert result["lat"] == CITY_FALLBACK_COORDS["islamabad"]["lat"]


class TestGeocodingAPI:
    def _fake_context(self, payload_bytes: bytes):
        class _Resp:
            def __enter__(self_inner):
                return self_inner

            def __exit__(self_inner, *args):
                return False

            def read(self_inner):
                return payload_bytes

        return _Resp()

    def test_successful_api_call(self):
        body = json.dumps(
            {
                "status": "OK",
                "results": [
                    {
                        "geometry": {"location": {"lat": 24.79, "lng": 67.07}},
                        "formatted_address": "DHA Phase 6, Karachi, Pakistan",
                    }
                ],
            }
        ).encode()

        with patch("services.maps.GOOGLE_MAPS_API_KEY", "fake_key"), patch(
            "services.maps.urllib.request.urlopen", return_value=self._fake_context(body)
        ):
            import services.maps as maps_mod

            maps_mod._geocode_cache.clear()
            result = get_user_coordinates("DHA Phase 6", "Karachi")
        assert result["lat"] == 24.79
        assert result["lng"] == 67.07
        assert result["source"] == "geocoding_api"
        assert result.get("fallback") is None

    def test_zero_results_falls_back(self):
        body = json.dumps({"status": "ZERO_RESULTS", "results": []}).encode()
        with patch("services.maps.GOOGLE_MAPS_API_KEY", "fake_key"), patch(
            "services.maps.urllib.request.urlopen", return_value=self._fake_context(body)
        ):
            import services.maps as maps_mod

            maps_mod._geocode_cache.clear()
            result = get_user_coordinates("Kuch bhi gali", "Lahore")
        assert result["fallback"] is True
        assert result["lat"] == CITY_FALLBACK_COORDS["lahore"]["lat"]

    def test_network_exception_falls_back(self):
        with patch("services.maps.GOOGLE_MAPS_API_KEY", "fake_key"), patch(
            "services.maps.urllib.request.urlopen", side_effect=Exception("timeout")
        ):
            import services.maps as maps_mod

            maps_mod._geocode_cache.clear()
            result = get_user_coordinates("F-7", "Islamabad")
        assert result["fallback"] is True
        assert result["source"] == "api_exception"

    def test_cache_prevents_second_api_call(self):
        call_count = {"n": 0}
        body = json.dumps(
            {
                "status": "OK",
                "results": [
                    {
                        "geometry": {"location": {"lat": 33.7, "lng": 73.0}},
                        "formatted_address": "Islamabad",
                    }
                ],
            }
        ).encode()

        def fake_urlopen(*args, **kwargs):
            call_count["n"] += 1
            return TestGeocodingAPI()._fake_context(body)

        with patch("services.maps.GOOGLE_MAPS_API_KEY", "fake_key"), patch(
            "services.maps.urllib.request.urlopen", side_effect=fake_urlopen
        ):
            import services.maps as maps_mod

            maps_mod._geocode_cache.clear()
            get_user_coordinates("F-7", "Islamabad")
            get_user_coordinates("F-7", "Islamabad")

        assert call_count["n"] == 1


class TestReturnShape:
    def test_result_always_has_required_keys(self):
        with patch("services.maps.GOOGLE_MAPS_API_KEY", ""):
            result = get_user_coordinates("Gulberg", "Lahore")
        for key in ["lat", "lng", "formatted_address", "source", "query"]:
            assert key in result, f"Missing key: {key}"

    def test_lat_lng_are_floats(self):
        with patch("services.maps.GOOGLE_MAPS_API_KEY", ""):
            result = get_user_coordinates("Saddar", "Karachi")
        assert isinstance(result["lat"], float)
        assert isinstance(result["lng"], float)


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
