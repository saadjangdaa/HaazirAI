"""Agent 7 — HISAAB: Dynamic Pricing Engine with Transparency."""
import uuid
from datetime import datetime
from typing import Optional

# ── Multiplier tables ──────────────────────────────────────────────────────
URGENCY_MULTIPLIERS = {
    "low": 1.0,
    "medium": 1.2,
    "high": 1.5,
    "critical": 2.0,
}

COMPLEXITY_MULTIPLIERS = {
    "basic": 1.0,
    "intermediate": 1.3,
    "complex": 1.6,
}

# Surge: based on time of day + area demand (simulated)
SURGE_SCHEDULE = {
    8: 1.2,
    9: 1.3,
    10: 1.1,
    11: 1.0,
    12: 1.0,
    13: 1.0,
    14: 1.1,
    15: 1.1,
    16: 1.2,
    17: 1.3,
    18: 1.4,
    19: 1.3,
    20: 1.2,
    21: 1.1,
}
DEFAULT_SURGE = 1.0

DISTANCE_RATE_PER_KM = 20
LOYALTY_DISCOUNT_RATE = 0.10
PLATFORM_FEE_RATE = 0.12
BUDGET_ALTERNATIVE_RATIO = 0.75

SERVICE_HOURS_DEFAULT = {
    "AC repair": 2.0,
    "AC installation": 3.0,
    "plumber": 1.5,
    "electrician": 2.0,
    "tutor": 1.5,
    "beautician": 1.5,
    "carpenter": 3.0,
    "painter": 4.0,
}
DEFAULT_HOURS = 2.0

SERVICE_BASE_RATES = {
    "AC repair": 600,
    "AC installation": 700,
    "plumber": 500,
    "electrician": 550,
    "tutor": 400,
    "beautician": 450,
    "carpenter": 500,
    "painter": 400,
}
DEFAULT_RATE = 500


def _get_surge_multiplier(hour: Optional[int] = None) -> float:
    """Get surge multiplier based on current hour. Uses live clock if hour not provided."""
    if hour is None:
        hour = datetime.now().hour
    return SURGE_SCHEDULE.get(hour, DEFAULT_SURGE)


def _get_estimated_hours(intent: dict, provider: dict) -> float:
    """Resolve estimated job duration in hours."""
    if provider.get("estimated_hours"):
        return float(provider["estimated_hours"])
    service = intent.get("service_type", "")
    return SERVICE_HOURS_DEFAULT.get(service, DEFAULT_HOURS)


def _get_price_per_hour(intent: dict, provider: dict) -> float:
    """Resolve provider's hourly rate."""
    if provider.get("price_per_hour"):
        return float(provider["price_per_hour"])
    service = intent.get("service_type", "")
    return SERVICE_BASE_RATES.get(service, DEFAULT_RATE)


def _find_budget_alternative(
    providers: list[dict],
    primary_provider_id: str,
    intent: dict,
    primary_total: float,
) -> Optional[dict]:
    """
    Find a cheaper alternative provider for budget-sensitive customers.
    Returns None if no suitable alternative found.
    """
    service = intent.get("service_type", "")
    alternatives = [p for p in providers if p.get("id") != primary_provider_id]
    if not alternatives:
        return None

    alternatives_sorted = sorted(
        alternatives,
        key=lambda p: p.get("price_per_hour", SERVICE_BASE_RATES.get(service, DEFAULT_RATE)),
    )
    alt = alternatives_sorted[0]
    alt_price_per_hour = _get_price_per_hour(intent, alt)
    alt_hours = _get_estimated_hours(intent, alt)
    alt_total = round(alt_price_per_hour * alt_hours * BUDGET_ALTERNATIVE_RATIO / 100) * 100
    alt_total = max(alt_total, primary_total * 0.70)

    alt_rating = alt.get("rating", 4.0)
    primary_rating = 4.5
    rating_diff = round(primary_rating - alt_rating, 1)

    alt_distance = alt.get("distance_km", 5.0)
    primary_distance = next(
        (p.get("distance_km", 5.0) for p in providers if p.get("id") == primary_provider_id),
        5.0,
    )
    eta_diff = int((alt_distance - primary_distance) * 4)

    tradeoff_parts = []
    if eta_diff > 0:
        tradeoff_parts.append(f"{eta_diff} min longer ETA")
    if rating_diff > 0:
        tradeoff_parts.append(f"{rating_diff}★ lower rating")
    tradeoff = ", ".join(tradeoff_parts) if tradeoff_parts else "Similar quality"

    return {
        "provider_id": alt.get("id"),
        "provider_name": alt.get("name", "Budget Provider"),
        "total": int(alt_total),
        "price_per_hour": int(alt_price_per_hour),
        "tradeoff": tradeoff,
        "rating": alt_rating,
        "distance_km": alt_distance,
    }


def _build_fairness_note(
    total: float,
    provider_name: str,
    lang: str,
) -> str:
    """Generate transparency note showing provider earnings after platform fee."""
    provider_earn = round(total * (1 - PLATFORM_FEE_RATE))
    platform_earn = round(total * PLATFORM_FEE_RATE)

    if lang == "urdu":
        return (
            f"{provider_name} کو Rs. {provider_earn:,} ملیں گے "
            f"(platform fee Rs. {platform_earn:,} کے بعد)۔ "
            f"Haazir صرف {int(PLATFORM_FEE_RATE * 100)}% لیتا ہے۔"
        )
    return (
        f"{provider_name} ko Rs. {provider_earn:,} milenge "
        f"(platform fee Rs. {platform_earn:,} ke baad). "
        f"Haazir sirf {int(PLATFORM_FEE_RATE * 100)}% leta hai."
    )


def _build_price_explanation(breakdown: dict, lang: str) -> str:
    """Human-readable price breakdown explanation."""
    _ = lang
    lines = []
    lines.append(f"Base rate: Rs. {breakdown['base_price']:,}")
    if breakdown["distance_cost"] > 0:
        lines.append(f"Travel: Rs. {breakdown['distance_cost']:,}")
    if breakdown["urgency_adjustment"] > 0:
        lines.append(f"Urgency: +Rs. {breakdown['urgency_adjustment']:,}")
    if breakdown["complexity_fee"] > 0:
        lines.append(f"Complexity: +Rs. {breakdown['complexity_fee']:,}")
    if breakdown["surge_pricing"] > 0:
        lines.append(f"Peak hour: +Rs. {breakdown['surge_pricing']:,}")
    if breakdown["loyalty_discount"] < 0:
        lines.append(f"Loyalty discount: Rs. {breakdown['loyalty_discount']:,}")
    lines.append(f"Total: Rs. {breakdown['total']:,}")
    return " | ".join(lines)


def _get_value_verdict(total: float, market_ref: float, lang: str) -> str:
    """Tell customer if quote is good, average, or expensive vs market."""
    ratio = total / market_ref if market_ref else 1.0

    if ratio <= 0.90:
        verdict = "Market se sasta — achha deal hai!"
        verdict_urdu = "مارکیٹ سے سستا — اچھا deal ہے!"
    elif ratio <= 1.10:
        verdict = "Market rate ke qareeb — fair price hai."
        verdict_urdu = "مارکیٹ rate کے قریب — fair price ہے۔"
    elif ratio <= 1.30:
        verdict = "Thoda mehngi — urgency/complexity ki wajah se."
        verdict_urdu = "تھوڑا مہنگا — urgency/complexity کی وجہ سے۔"
    else:
        verdict = "Peak hours ya emergency surcharge hai — kal book karein to sasta hoga."
        verdict_urdu = "Peak hours یا emergency surcharge — کل book کریں تو سستا ہوگا۔"

    return verdict_urdu if lang == "urdu" else verdict


class HisaabAgent:

    async def calculate_price(
        self,
        intent: dict,
        provider: dict,
        providers_list: list[dict] | None = None,
        user_id: str = "user_001",
        is_repeat_customer: bool = False,
        override_hour: Optional[int] = None,
    ) -> dict:
        """
        Generate dynamic price quote with full transparent breakdown.
        """
        start = datetime.now()
        quote_id = f"QT-{datetime.now().strftime('%Y%m%d')}-{str(uuid.uuid4())[:6].upper()}"

        service = intent.get("service_type", "service")
        urgency = intent.get("urgency", "medium")
        complexity = intent.get("job_complexity", "intermediate")
        budget_sens = intent.get("budget_sensitivity", "medium")
        is_emergency = intent.get("emergency", False)
        lang = intent.get("detected_language", "roman_urdu")
        distance_km = float(provider.get("distance_km", 3.0))
        provider_id = provider.get("id", "unknown")
        provider_name = provider.get("name", "Provider")

        if is_emergency:
            urgency = "critical"

        price_per_hour = _get_price_per_hour(intent, provider)
        estimated_hours = _get_estimated_hours(intent, provider)
        base_price = round(price_per_hour * estimated_hours)

        distance_cost = round(distance_km * DISTANCE_RATE_PER_KM)

        urgency_mult = URGENCY_MULTIPLIERS.get(urgency, 1.2)
        urgency_adjustment = round(base_price * (urgency_mult - 1.0))

        complexity_mult = COMPLEXITY_MULTIPLIERS.get(complexity, 1.3)
        complexity_fee = round(base_price * (complexity_mult - 1.0))

        surge_mult = _get_surge_multiplier(override_hour)
        surge_pricing = round(base_price * (surge_mult - 1.0))

        subtotal_before_discount = (
            base_price + distance_cost + urgency_adjustment + complexity_fee + surge_pricing
        )
        loyalty_discount = 0
        if is_repeat_customer:
            loyalty_discount = -round(subtotal_before_discount * LOYALTY_DISCOUNT_RATE)

        total = subtotal_before_discount + loyalty_discount
        total = max(total, 300)

        budget_alternative = None
        if budget_sens == "high" and providers_list:
            budget_alternative = _find_budget_alternative(
                providers_list, provider_id, intent, float(total)
            )

        fairness_note = _build_fairness_note(float(total), provider_name, lang)

        breakdown = {
            "base_price": int(base_price),
            "distance_cost": int(distance_cost),
            "urgency_adjustment": int(urgency_adjustment),
            "complexity_fee": int(complexity_fee),
            "surge_pricing": int(surge_pricing),
            "loyalty_discount": int(loyalty_discount),
            "total": int(total),
        }
        price_explanation = _build_price_explanation(breakdown, lang)

        surge_warning = None
        if surge_mult >= 1.3:
            surge_warning = (
                "Peak hours hain — demand zyada hai. "
                "Kal subah 11 baje book karein to surge nahi hoga."
            )

        market_reference = SERVICE_BASE_RATES.get(service, DEFAULT_RATE) * DEFAULT_HOURS
        value_verdict = _get_value_verdict(float(total), float(market_reference), lang)

        end = datetime.now()
        elapsed = round((end - start).total_seconds(), 3)

        decision = (
            f"Quote for {service} with {provider_name}: "
            f"base Rs.{base_price} + distance Rs.{distance_cost} "
            f"+ urgency Rs.{urgency_adjustment} + complexity Rs.{complexity_fee} "
            f"+ surge Rs.{surge_pricing} + loyalty Rs.{loyalty_discount} "
            f"= total Rs.{total}"
        )

        return {
            "quote_id": quote_id,
            "provider_id": provider_id,
            "provider_name": provider_name,
            "service": service,
            "user_id": user_id,
            "base_price": int(base_price),
            "distance_cost": int(distance_cost),
            "urgency_adjustment": int(urgency_adjustment),
            "complexity_fee": int(complexity_fee),
            "surge_pricing": int(surge_pricing),
            "loyalty_discount": int(loyalty_discount),
            "total": int(total),
            "price_per_hour": int(price_per_hour),
            "estimated_hours": estimated_hours,
            "distance_km": distance_km,
            "urgency_multiplier": urgency_mult,
            "complexity_multiplier": complexity_mult,
            "surge_multiplier": surge_mult,
            "is_repeat_customer": is_repeat_customer,
            "budget_alternative": budget_alternative,
            "fairness_note": fairness_note,
            "price_explanation": price_explanation,
            "surge_warning": surge_warning,
            "value_verdict": value_verdict,
            "estimated_base": int(base_price + distance_cost),
            "_log": {
                "agent_name": "HISAAB",
                "agent_name_urdu": "حساب",
                "start_time": start.isoformat(),
                "end_time": end.isoformat(),
                "input_summary": (
                    f"Pricing: {service} | {provider_name} | "
                    f"urgency={urgency} complexity={complexity} "
                    f"surge_hour={override_hour if override_hour is not None else datetime.now().hour} "
                    f"repeat={is_repeat_customer}"
                ),
                "output_summary": f"Total quote: Rs. {total:,} (base Rs. {base_price:,})",
                "decision_made": decision,
                "confidence": 0.95,
                "fallback_used": False,
                "time_seconds": elapsed,
                "multipliers_used": {
                    "urgency": urgency_mult,
                    "complexity": complexity_mult,
                    "surge": surge_mult,
                    "loyalty": LOYALTY_DISCOUNT_RATE if is_repeat_customer else 0,
                },
            },
        }
