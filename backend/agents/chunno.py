"""Agent 3 — CHUNNO: Multi-factor provider ranking."""
from datetime import datetime
from typing import List


COMPLEXITY_SCORE = {"basic": 1.0, "intermediate": 0.85, "complex": 0.7}
URGENCY_WEIGHT = {"low": 1.0, "medium": 0.9, "high": 0.8, "critical": 0.7}


class ChunnoAgent:

    async def rank_providers(self, providers: List[dict], intent: dict) -> dict:
        start = datetime.now()

        budget_sensitivity = intent.get("budget_sensitivity", "medium")
        job_complexity = intent.get("job_complexity", "intermediate")
        urgency = intent.get("urgency", "medium")

        max_dist = max((p.get("distance_km", 1) for p in providers), default=1)
        price_list = [p.get("price_per_hour", 1000) for p in providers]
        min_price = min(price_list) if price_list else 1000
        max_price = max(price_list) if price_list else 2000

        ranked = []
        warnings = []

        for p in providers:
            dist = p.get("distance_km", 5)
            distance_score = 1.0 - (dist / max(max_dist, 1))

            rating_score = (p.get("rating", 3.0) - 1.0) / 4.0

            reliability_score = p.get("on_time_percentage", 0.8)

            recency = p.get("recent_reviews_positive", 0.8)
            review_recency_score = recency

            p_complexity = p.get("complexity_level", "basic")
            if p_complexity == job_complexity:
                specialization_score = 1.0
            elif (p_complexity == "complex" and job_complexity == "intermediate") or \
                 (p_complexity == "intermediate" and job_complexity == "basic"):
                specialization_score = 0.85
            else:
                specialization_score = 0.6

            price = p.get("price_per_hour", 1000)
            if max_price > min_price:
                price_score = 1.0 - ((price - min_price) / (max_price - min_price))
            else:
                price_score = 1.0
            if budget_sensitivity == "low":
                price_score = price_score * 0.5 + 0.5

            cancellation_risk = 1.0 - p.get("cancellation_rate", 0.05)

            workload = p.get("workload_today", 0)
            capacity_score = max(0.0, 1.0 - (workload / 8))

            trust_score = float(p.get("trust_score", 0.8) or 0.8)

            score = (
                distance_score * 0.18 +
                rating_score * 0.18 +
                reliability_score * 0.14 +
                review_recency_score * 0.10 +
                specialization_score * 0.14 +
                price_score * 0.10 +
                cancellation_risk * 0.05 +
                capacity_score * 0.05 +
                trust_score * 0.06
            )

            provider_warnings = []
            if p.get("rating", 5) >= 4.5 and p.get("recent_reviews_positive", 1) < 0.7:
                w = f"⚠️ {p['name']} ki rating achhi hai lekin recent reviews negative hain"
                provider_warnings.append(w)
                warnings.append(w)
            if p.get("cancellation_rate", 0) > 0.20:
                w = f"⚠️ {p['name']} ka cancellation rate zyada hai ({int(p['cancellation_rate']*100)}%)"
                provider_warnings.append(w)
                warnings.append(w)
            if not p.get("verified"):
                w = f"ℹ️ {p['name']} abhi tak verified nahi hai"
                provider_warnings.append(w)

            dist_display = f"{dist:.1f} km"
            area = p.get("area", "")
            reason_urdu = (
                f"{p['name']} ko isliye recommend kiya: {area} se sirf {dist_display} door, "
                f"{p.get('rating', 0):.1f} ⭐ rating, {p.get('service', 'service')} mein "
                f"{'specialist' if specialization_score >= 0.85 else 'experience'}, "
                f"aur estimate budget ke {'andar' if price_score >= 0.5 else 'bahar'}."
            )
            reason_english = (
                f"Recommended {p['name']}: {dist_display} away in {area}, "
                f"rating {p.get('rating', 0):.1f}/5, "
                f"{'specialist' if specialization_score >= 0.85 else 'experienced'} in {p.get('service')}, "
                f"price {'within' if price_score >= 0.5 else 'slightly above'} budget."
            )

            ranked.append({
                **p,
                "ranking_score": round(score, 4),
                "ranking_reason_urdu": reason_urdu,
                "ranking_reason_english": reason_english,
                "warnings": provider_warnings,
            })

        ranked.sort(key=lambda x: x["ranking_score"], reverse=True)

        end = datetime.now()
        elapsed = round((end - start).total_seconds(), 3)

        return {
            "ranked_providers": ranked,
            "global_warnings": warnings,
            "_log": {
                "agent_name": "CHUNNO",
                "agent_name_urdu": "چُنّو",
                "start_time": start.isoformat(),
                "end_time": end.isoformat(),
                "input_summary": f"Ranking {len(providers)} providers for {intent.get('service_type')}",
                "output_summary": (
                    f"Top provider: {ranked[0]['name']} (score={ranked[0]['ranking_score']:.3f})"
                    if ranked else "No providers to rank"
                ),
                "decision_made": f"8-factor weighted scoring applied. {len(warnings)} warning(s) generated.",
                "confidence": 0.95,
                "fallback_used": False,
                "time_seconds": elapsed,
            },
        }
