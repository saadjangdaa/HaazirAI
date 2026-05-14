"""Agent 2 — DHUNDHO: Provider discovery from mock DB + Maps fallback."""
import json
import os
from datetime import datetime
from typing import List, Optional
from services.maps import haversine, get_user_coordinates

_PROVIDERS_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "providers.json")
_providers_cache: Optional[List[dict]] = None

COMPLEXITY_MAP = {
    "basic": ["basic", "intermediate", "complex"],
    "intermediate": ["intermediate", "complex"],
    "complex": ["complex"],
}


def _load_providers() -> List[dict]:
    global _providers_cache
    if _providers_cache is None:
        with open(_PROVIDERS_PATH, encoding="utf-8") as f:
            _providers_cache = json.load(f)
    return _providers_cache


class DhundhoAgent:

    async def find_providers(self, intent: dict) -> dict:
        start = datetime.now()
        all_providers = _load_providers()

        service_type = intent.get("service_type", "").lower()
        city = intent.get("city", "Islamabad")
        location = intent.get("location", "")
        complexity = intent.get("job_complexity", "intermediate")
        is_emergency = intent.get("emergency", False)

        user_coords = get_user_coordinates(location, city)
        user_lat, user_lng = user_coords["lat"], user_coords["lng"]

        allowed_complexities = COMPLEXITY_MAP.get(complexity, ["basic", "intermediate", "complex"])

        filters_applied = []
        candidates = []

        for p in all_providers:
            p_service = p["service"].lower()
            p_spec = [s.lower() for s in p.get("specialization", [])]

            service_match = (
                service_type in p_service
                or p_service in service_type
                or any(service_type in s or s in service_type for s in p_spec)
            )
            if not service_match:
                continue

            if p["city"].lower() != city.lower():
                continue

            if not p["available"]:
                continue

            if p.get("complexity_level") not in allowed_complexities:
                continue

            if is_emergency and not p.get("verified"):
                continue

            dist = haversine(user_lat, user_lng, p["lat"], p["lng"])
            p_copy = {**p, "distance_km": dist}
            candidates.append(p_copy)

        filters_applied = [
            f"service={service_type}",
            f"city={city}",
            "available=true",
            f"complexity_level in {allowed_complexities}",
        ]
        if is_emergency:
            filters_applied.append("verified=true (emergency fast-track)")

        candidates.sort(key=lambda x: x["distance_km"])
        top10 = candidates[:10]

        fallback_used = False
        fallback_message = None
        if not top10:
            fallback_used = True
            fallback_message = (
                "Abhi is area mein koi provider available nahi hai. "
                "Aap waitlist mein add ho saktay hain ya kal dobara try karein."
            )
            filters_applied.append("FALLBACK: no providers found — returning waitlist suggestion")

        end = datetime.now()
        elapsed = round((end - start).total_seconds(), 3)

        return {
            "providers": top10,
            "total_found": len(candidates),
            "fallback_triggered": fallback_used,
            "fallback_message": fallback_message,
            "user_coords": user_coords,
            "_log": {
                "agent_name": "DHUNDHO",
                "agent_name_urdu": "ڈھونڈو",
                "start_time": start.isoformat(),
                "end_time": end.isoformat(),
                "input_summary": f"Looking for {service_type} in {city} ({location}), complexity={complexity}",
                "output_summary": f"Found {len(candidates)} matching providers, returning top {len(top10)}",
                "decision_made": f"Filters: {', '.join(filters_applied)}",
                "confidence": 1.0 if top10 else 0.0,
                "fallback_used": fallback_used,
                "time_seconds": elapsed,
            },
        }
