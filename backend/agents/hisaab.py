"""Agent 7 — HISAAB: Dynamic Pricing Engine."""
from datetime import datetime
from typing import Optional


URGENCY_MULTIPLIER = {"low": 1.0, "medium": 1.0, "high": 1.2, "critical": 2.0}
COMPLEXITY_MULTIPLIER = {"basic": 1.0, "intermediate": 1.3, "complex": 1.6}
ESTIMATED_HOURS = {"basic": 1, "intermediate": 2, "complex": 3}
PLATFORM_FEE_RATE = 0.10


class HisaabAgent:

    async def calculate_price(
        self, intent: dict, provider: dict, is_repeat_customer: bool = False
    ) -> dict:
        start = datetime.now()

        urgency = intent.get("urgency", "medium")
        complexity = intent.get("job_complexity", "intermediate")
        budget_sensitivity = intent.get("budget_sensitivity", "medium")

        price_per_hour = provider.get("price_per_hour", 800)
        distance_km = provider.get("distance_km", 3.0)
        hours = ESTIMATED_HOURS.get(complexity, 2)

        base_price = price_per_hour * hours
        distance_cost = int(distance_km * 20)
        urgency_adj = int(base_price * (URGENCY_MULTIPLIER.get(urgency, 1.0) - 1.0))
        complexity_fee = int(base_price * (COMPLEXITY_MULTIPLIER.get(complexity, 1.0) - 1.0))

        area = provider.get("area", "")
        city = provider.get("city", "")
        surge = self._get_surge_factor(intent.get("service_type", ""), city, urgency)
        surge_pricing = int(base_price * (surge - 1.0))

        loyalty_discount = -int((base_price + urgency_adj + complexity_fee) * 0.10) if is_repeat_customer else 0

        total = base_price + distance_cost + urgency_adj + complexity_fee + surge_pricing + loyalty_discount
        total = max(total, 300)

        platform_fee = int(total * PLATFORM_FEE_RATE)
        provider_earnings = total - platform_fee

        budget_alternative = None
        if budget_sensitivity == "high" and total > 1000:
            alt_price = int(total * 0.75)
            budget_alternative = {
                "provider": "Budget Option",
                "total": alt_price,
                "tradeoff": "15-20 min longer ETA, slightly lower rating (4.2-4.4 ⭐)",
            }

        fairness_note = f"Provider earns Rs {provider_earnings:,} (Rs {platform_fee:,} platform fee deducted)"

        end = datetime.now()
        elapsed = round((end - start).total_seconds(), 3)

        return {
            "base_price": base_price,
            "distance_cost": distance_cost,
            "urgency_adjustment": urgency_adj,
            "complexity_fee": complexity_fee,
            "surge_pricing": surge_pricing,
            "loyalty_discount": loyalty_discount,
            "total": total,
            "estimated_hours": hours,
            "budget_alternative": budget_alternative,
            "fairness_note": fairness_note,
            "_log": {
                "agent_name": "HISAAB",
                "agent_name_urdu": "حساب",
                "start_time": start.isoformat(),
                "end_time": end.isoformat(),
                "input_summary": f"Pricing for {provider.get('name')} | {complexity} job | {urgency} urgency | {distance_km:.1f}km",
                "output_summary": f"Total: Rs {total:,} | Base: Rs {base_price} | Provider earns: Rs {provider_earnings:,}",
                "decision_made": f"Surge factor {surge:.1f}x | {'Loyalty discount applied' if loyalty_discount else 'No loyalty discount'} | {'Budget alternative suggested' if budget_alternative else 'No budget alternative'}",
                "confidence": 0.98,
                "fallback_used": False,
                "time_seconds": elapsed,
            },
        }

    def _get_surge_factor(self, service_type: str, city: str, urgency: str) -> float:
        if urgency == "critical":
            return 1.4
        ac_cities_surge = {"Karachi", "Lahore", "Islamabad"}
        if "AC" in service_type and city in ac_cities_surge:
            return 1.2
        return 1.0
