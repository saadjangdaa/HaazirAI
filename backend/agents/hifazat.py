"""Agent 6 — HIFAZAT: Trust + Fraud Detection."""
from datetime import datetime
from typing import List


class HifazatAgent:

    async def assess_trust(self, providers: List[dict], customer_id: str = "default") -> dict:
        start = datetime.now()
        assessments = []
        global_flags = []

        for p in providers:
            risk_flags = []
            trust_score = p.get("trust_score", 0.8)

            if p.get("cancellation_rate", 0) > 0.20:
                risk_flags.append("HIGH_CANCELLATION_RATE")
                trust_score -= 0.15

            if not p.get("verified"):
                risk_flags.append("UNVERIFIED_PROFILE")
                trust_score -= 0.10

            if p.get("review_count", 100) < 5 and p.get("rating", 3.0) > 4.5:
                risk_flags.append("SUSPICIOUS_RATING_SPIKE")
                trust_score -= 0.10

            if p.get("recent_reviews_positive", 1.0) < 0.6 and p.get("rating", 0) >= 4.0:
                risk_flags.append("RECENT_NEGATIVE_REVIEWS_DESPITE_HIGH_RATING")
                trust_score -= 0.08

            if p.get("experience_years", 1) < 1 and p.get("jobs_completed", 0) > 200:
                risk_flags.append("INCONSISTENT_EXPERIENCE_DATA")
                trust_score -= 0.05

            trust_score = max(0.0, min(1.0, round(trust_score, 3)))

            if trust_score < 0.5:
                action = "BLOCK"
                warn_text = f"🚫 {p['name']} ka trust score bahut kam hai — recommend nahi kiya ja sakta"
            elif trust_score < 0.7:
                action = "WARN"
                warn_text = f"⚠️ {p['name']} ke baray mein احتیاط کریں — kuch risk factors hain"
            else:
                action = "APPROVE"
                warn_text = None

            warnings = [warn_text] if warn_text else []

            if "SUSPICIOUS_RATING_SPIKE" in risk_flags:
                global_flags.append(f"Potential fake reviews detected for provider {p['id']}")

            assessments.append({
                "provider_id": p["id"],
                "trust_score": trust_score,
                "risk_flags": risk_flags,
                "recommended_action": action,
                "warnings": warnings,
            })

        customer_risk_note = None
        if customer_id and customer_id.startswith("suspicious_"):
            customer_risk_note = "HIGH_RISK_CUSTOMER"

        end = datetime.now()
        elapsed = round((end - start).total_seconds(), 3)

        blocked = [a for a in assessments if a["recommended_action"] == "BLOCK"]
        warned = [a for a in assessments if a["recommended_action"] == "WARN"]

        return {
            "assessments": assessments,
            "global_flags": global_flags,
            "customer_risk": customer_risk_note,
            "_log": {
                "agent_name": "HIFAZAT",
                "agent_name_urdu": "حفاظت",
                "start_time": start.isoformat(),
                "end_time": end.isoformat(),
                "input_summary": f"Trust-checking {len(providers)} providers for customer {customer_id}",
                "output_summary": f"{len(blocked)} blocked, {len(warned)} warned, {len(assessments)-len(blocked)-len(warned)} approved",
                "decision_made": f"Trust scores computed. {len(global_flags)} global flag(s) raised.",
                "confidence": 0.90,
                "fallback_used": False,
                "time_seconds": elapsed,
            },
        }
