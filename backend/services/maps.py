"""Google Geocoding + Pakistani city fallbacks for Haazir (DHUNDHO distance sorting)."""
import json
import logging
import math
import os
import time
import urllib.parse
import urllib.request
from typing import Optional

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY", "")

CITY_FALLBACK_COORDS = {
    "karachi": {"lat": 24.8607, "lng": 67.0011},
    "lahore": {"lat": 31.5204, "lng": 74.3587},
    "islamabad": {"lat": 33.6844, "lng": 73.0479},
    "rawalpindi": {"lat": 33.5651, "lng": 73.0169},
    "faisalabad": {"lat": 31.4504, "lng": 73.1350},
    "peshawar": {"lat": 34.0151, "lng": 71.5249},
    "quetta": {"lat": 30.1798, "lng": 66.9750},
    "multan": {"lat": 30.1575, "lng": 71.5249},
    "hyderabad": {"lat": 25.3960, "lng": 68.3578},
    "gujranwala": {"lat": 32.1877, "lng": 74.1945},
    "sialkot": {"lat": 32.4945, "lng": 74.5229},
    "abbottabad": {"lat": 34.1688, "lng": 73.2215},
    "bahawalpur": {"lat": 29.3956, "lng": 71.6836},
    "sargodha": {"lat": 32.0836, "lng": 72.6711},
    "sukkur": {"lat": 27.7052, "lng": 68.8574},
}

_geocode_cache: dict = {}
_CACHE_TTL = 3600


def _cache_get(key: str) -> Optional[dict]:
    entry = _geocode_cache.get(key)
    if entry and (time.time() - entry[1]) < _CACHE_TTL:
        return {**entry[0]}
    return None


def _cache_set(key: str, value: dict) -> None:
    _geocode_cache[key] = ({**value}, time.time())


def haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Straight-line distance in km between two coordinates."""
    R = 6371.0
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(d_lng / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _fallback(city: str, query: str, source: str) -> dict:
    """Return city-level fallback coords. Never raises."""
    city_key = (city or "").lower().strip()
    coords = CITY_FALLBACK_COORDS.get(city_key, CITY_FALLBACK_COORDS["islamabad"])
    result = {
        "lat": coords["lat"],
        "lng": coords["lng"],
        "formatted_address": f"{city}, Pakistan (approximate)",
        "source": source,
        "query": query,
        "fallback": True,
    }
    logger.info("[Maps] Fallback used for '%s' → %s, %s", city, coords["lat"], coords["lng"])
    return result


def get_user_coordinates(location: str = "", city: str = "Islamabad") -> dict:
    """
    Resolve user's area/city to lat/lng using Google Geocoding API.
    Falls back gracefully: API → city dict → Islamabad default.
    Never raises — always returns a valid coords dict.
    """
    query_parts = [p for p in [(location or "").strip(), (city or "").strip(), "Pakistan"] if p]
    query = ", ".join(query_parts)
    cache_key = query.lower()

    cached = _cache_get(cache_key)
    if cached:
        logger.debug("[Maps] Cache hit: %s", cache_key)
        return cached

    if not GOOGLE_MAPS_API_KEY:
        logger.warning("[Maps] No GOOGLE_MAPS_API_KEY — using city fallback")
        return _fallback(city, query, source="no_api_key")

    try:
        encoded_query = urllib.parse.quote(query)
        url = (
            f"https://maps.googleapis.com/maps/api/geocode/json"
            f"?address={encoded_query}"
            f"&region=pk"
            f"&key={GOOGLE_MAPS_API_KEY}"
        )
        with urllib.request.urlopen(url, timeout=5) as resp:
            data = json.loads(resp.read().decode())

        status = data.get("status")
        if status == "OK" and data.get("results"):
            loc = data["results"][0]["geometry"]["location"]
            formatted = data["results"][0].get("formatted_address", query)
            result = {
                "lat": loc["lat"],
                "lng": loc["lng"],
                "formatted_address": formatted,
                "source": "geocoding_api",
                "query": query,
            }
            _cache_set(cache_key, result)
            logger.info("[Maps] Geocoded '%s' → %.4f, %.4f", query, loc["lat"], loc["lng"])
            return {**result}

        logger.warning("[Maps] Geocoding status=%s for '%s' — using fallback", status, query)
        return _fallback(city, query, source=f"api_status_{status}")

    except Exception as e:
        logger.error("[Maps] Geocoding API error for '%s': %s", query, e)
        return _fallback(city, query, source="api_exception")


def reverse_geocode(lat: float, lng: float) -> str:
    """Convert coordinates back to human-readable address. Returns empty string on failure."""
    if not GOOGLE_MAPS_API_KEY:
        return ""
    try:
        url = (
            f"https://maps.googleapis.com/maps/api/geocode/json"
            f"?latlng={lat},{lng}"
            f"&key={GOOGLE_MAPS_API_KEY}"
        )
        with urllib.request.urlopen(url, timeout=5) as resp:
            data = json.loads(resp.read().decode())
        if data.get("status") == "OK" and data.get("results"):
            return data["results"][0].get("formatted_address", "")
    except Exception:
        pass
    return ""
