"""Agent 2 — DHUNDHO: Provider discovery from mock DB + Maps geocode + Firestore availability."""
import json
import os
from collections import Counter
from datetime import datetime, timedelta
from typing import List, Optional, Tuple

from services.firebase import check_slot_conflict
from services.maps import haversine, get_user_coordinates
from services.scheduling import scheduled_time_from_intent

_PROVIDERS_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "providers.json")
_providers_cache: Optional[List[dict]] = None
_cache_loaded_at: Optional[datetime] = None
_CACHE_TTL_SECONDS = 300  # 5 minutes

TOP_N = 10

COMPLEXITY_MAP = {
    "basic": ["basic", "intermediate", "complex"],
    "intermediate": ["intermediate", "complex"],
    "complex": ["complex"],
}


def _load_providers() -> List[dict]:
    global _providers_cache, _cache_loaded_at
    now = datetime.now()
    if _providers_cache is None or (
        _cache_loaded_at is not None
        and (now - _cache_loaded_at).total_seconds() > _CACHE_TTL_SECONDS
    ):
        with open(_PROVIDERS_PATH, encoding="utf-8") as f:
            _providers_cache = json.load(f)
        _cache_loaded_at = now
    return _providers_cache


def _service_matches(intent_service: str, provider: dict) -> bool:
    """Strict category match (legacy name kept for tests)."""
    from services.service_categories import (
        intent_category,
        provider_matches_category,
    )

    category = intent_category({"service_type": intent_service})
    return provider_matches_category(provider, category)


async def _resolve_availability(
    provider: dict, scheduled_time: str
) -> Tuple[bool, Optional[str], bool]:
    """
    Firestore-backed slot check aligned with Pakka (same scheduled_time string).
    Returns (eligible, suggested_slot_or_none, used_fallback_slot).
    """
    pid = provider.get("id")
    if not pid:
        return False, None, False

    if not await check_slot_conflict(pid, scheduled_time):
        return True, scheduled_time, False

    date_part = scheduled_time[:10]
    try:
        base = datetime.strptime(scheduled_time, "%Y-%m-%d %H:%M")
    except ValueError:
        return True, scheduled_time, False

    for slot in provider.get("available_slots") or []:
        cand = f"{date_part} {slot}"
        if cand == scheduled_time:
            continue
        if not await check_slot_conflict(pid, cand):
            return True, cand, True

    next_day = (base + timedelta(days=1)).strftime("%Y-%m-%d")
    for slot in provider.get("available_slots") or []:
        cand = f"{next_day} {slot}"
        if not await check_slot_conflict(pid, cand):
            return True, cand, True

    return False, None, False


def _aggregate_next_slot_hint(providers_same_city: List[dict]) -> str:
    slots: List[str] = []
    for p in providers_same_city[:8]:
        for s in p.get("available_slots") or []:
            slots.append(s)
    if not slots:
        return "Kal subah 10:00 bajay (standard window) — waitlist par naam likhwayein"
    top = Counter(slots).most_common(1)[0][0]
    tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
    return f"Agla mashwara: {tomorrow} {top} (ya waitlist — hum aap ko notify karenge)"


class DhundhoAgent:

    async def find_providers(self, intent: dict) -> dict:
        start = datetime.now()
        all_providers = _load_providers()

        from services.service_categories import intent_category

        service_type = intent.get("service_type", "")
        normalized_category = intent_category(intent)
        city = intent.get("city", "Islamabad")

        from services.firebase import list_providers as firestore_list_providers
        from services.providers_integrity import format_provider_record

        all_providers = await firestore_list_providers(city=city, service=service_type)
        if not all_providers:
            all_providers = [
                format_provider_record(p, p.get("id"))
                for p in _load_providers()
            ]

        location = intent.get("location", "")
        complexity = intent.get("job_complexity", "intermediate")
        is_emergency = intent.get("emergency", False)

        scheduled_time = scheduled_time_from_intent(intent)
        user_coords = get_user_coordinates(location, city)
        user_lat, user_lng = user_coords["lat"], user_coords["lng"]

        allowed_complexities = COMPLEXITY_MAP.get(complexity, ["basic", "intermediate", "complex"])

        filter_trace: List[str] = []
        counts: dict[str, int] = {}

        def count_stage(name: str, n: int) -> None:
            counts[name] = n
            filter_trace.append(f"{name}={n}")

        pool = list(all_providers)
        count_stage("all_db", len(pool))

        from services.service_categories import filter_providers_by_category

        after_service = filter_providers_by_category(pool, normalized_category)
        count_stage("after_service_match", len(after_service))

        after_city = [p for p in after_service if (p.get("city") or "").lower() == (city or "").lower()]
        count_stage("after_city_match", len(after_city))

        after_complexity = [
            p for p in after_city if p.get("complexity_level") in allowed_complexities
        ]
        count_stage("after_complexity_vs_job", len(after_complexity))

        if is_emergency:
            after_verified = [p for p in after_complexity if p.get("verified")]
            count_stage("after_emergency_verified", len(after_verified))
            base_candidates = after_verified
        else:
            base_candidates = after_complexity

        with_distance: List[dict] = []
        for p in base_candidates:
            dist = haversine(user_lat, user_lng, float(p["lat"]), float(p["lng"]))
            with_distance.append({**p, "distance_km": dist})
        with_distance.sort(key=lambda x: x["distance_km"])
        count_stage("with_distance_sorted", len(with_distance))

        filters_applied = [
            f"normalized_category={normalized_category!r}",
            f"service_type~match({service_type!r})",
            f"city={city}",
            f"job_complexity={complexity} → provider.complexity_level in {allowed_complexities}",
            f"user_geocode={user_coords.get('formatted_address', location)} (Maps Geocoding API when configured)",
            f"firestore_slot_check primary={scheduled_time}",
            "proximity=sort_by_haversine_km_from_user_coords",
        ]
        if is_emergency:
            filters_applied.append("emergency: verified=true")

        available_top: List[dict] = []
        slot_fallback_count = 0
        for p in with_distance:
            if len(available_top) >= TOP_N:
                break
            ok, suggested, used_fb = await _resolve_availability(p, scheduled_time)
            if not ok:
                continue
            row = {**p}
            if used_fb and suggested:
                row["dhundho_suggested_slot"] = suggested
                slot_fallback_count += 1
            available_top.append(row)

        if slot_fallback_count:
            filters_applied.append(
                f"firestore_availability: {slot_fallback_count} provider(s) moved to alternate slot "
                f"(same/next day from available_slots)"
            )

        fallback_used = False
        fallback_message = None
        waitlist_recommended = False
        next_slot_hint: Optional[str] = None

        if not available_top:
            fallback_used = True
            waitlist_recommended = True
            next_slot_hint = _aggregate_next_slot_hint(after_city if after_city else after_service)
            if not with_distance:
                fallback_message = (
                    "Abhi aap ke filters par koi provider nahi mila. "
                    "Waitlist par naam likhwayein — jaisay hi koi available ho ga hum rabita karen ge. "
                    f"{next_slot_hint}"
                )
            else:
                fallback_message = (
                    "Providers milay lekin maangay gay waqt / qareebi slot par sab busy hain. "
                    "Agla mashwara slot try karein ya waitlist join karein. "
                    f"{next_slot_hint}"
                )
            filters_applied.append("FALLBACK: no eligible provider after slot filter — waitlist + next slot")

        end = datetime.now()
        elapsed = round((end - start).total_seconds(), 3)

        total_matching = len(with_distance)
        out_providers = available_top

        log_decision = (
            f"Pool {total_matching} after service/city/complexity/distance; "
            f"Firestore+slots → {len(out_providers)} for CHUNNO (cap {TOP_N}). "
            f"Trace: {'; '.join(filter_trace)}. Fallback={'yes' if fallback_used else 'no'}"
        )

        return {
            "providers": out_providers,
            "total_found": len(out_providers),
            "total_matched_before_availability": total_matching,
            "filters_applied": filters_applied,
            "filter_trace": filter_trace,
            "counts": counts,
            "scheduled_time_checked": scheduled_time,
            "fallback_triggered": fallback_used,
            "fallback_message": fallback_message,
            "waitlist_recommended": waitlist_recommended,
            "next_available_slot_hint": next_slot_hint,
            "user_coords": user_coords,
            "_log": {
                "agent_name": "DHUNDHO",
                "agent_name_urdu": "ڈھونڈو",
                "start_time": start.isoformat(),
                "end_time": end.isoformat(),
                "input_summary": (
                    f"Discovery: service={service_type!r} city={city} area={location!r} "
                    f"complexity={complexity} emergency={is_emergency}"
                ),
                "output_summary": (
                    f"Providers returned for CHUNNO: {len(out_providers)} "
                    f"(candidates_before_slot_filter={total_matching}, cap={TOP_N}, "
                    f"alternate_slots_used={slot_fallback_count})"
                ),
                "decision_made": log_decision,
                "confidence": 1.0 if out_providers else 0.0,
                "fallback_used": fallback_used,
                "time_seconds": elapsed,
            },
        }
