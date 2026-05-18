"""Agent 6 — HIFAZAT (حفاظت): Trust scoring, fraud detection, feedback justice."""
from __future__ import annotations

from datetime import datetime
from typing import Any


def _now() -> datetime:
    return datetime.now()


def _elapsed(start: datetime) -> float:
    return round((_now() - start).total_seconds(), 3)


def _make_log(
    *,
    start: datetime,
    input_summary: str,
    output_summary: str,
    decision_made: str,
    confidence: float,
) -> dict[str, Any]:
    end = _now()
    return {
        "agent_name": "HIFAZAT",
        "agent_name_urdu": "حفاظت",
        "start_time": start.isoformat(),
        "end_time": end.isoformat(),
        "input_summary": input_summary,
        "output_summary": output_summary,
        "decision_made": decision_made,
        "confidence": round(confidence, 4),
        "fallback_used": False,
        "time_seconds": _elapsed(start),
    }


def _action_from_risk(score: float) -> str:
    if score <= 0.25:
        return "APPROVE"
    if score <= 0.50:
        return "APPROVE_WITH_WARNING"
    if score <= 0.75:
        return "MANUAL_REVIEW"
    return "BLOCK"


def _provider_warning(action: str) -> str | None:
    if action == "APPROVE_WITH_WARNING":
        return "Ye provider naya hai — kaam ka jaiza lein"
    if action == "MANUAL_REVIEW":
        return "Is provider ki history mein kuch masail hain"
    if action == "BLOCK":
        return "Ye provider abhi available nahi — doosra chunein"
    return None


def _customer_action_from_risk(score: float) -> str:
    if score <= 0.30:
        return "APPROVE"
    if score <= 0.60:
        return "REQUIRE_UPFRONT_PAYMENT"
    return "BLOCK_CUSTOMER"


class HifazatAgent:
    """Trust scoring + fraud detection for pre-booking and post-job feedback."""

    async def assess_provider(self, provider: dict, context: dict) -> dict[str, Any]:
        start = _now()
        risk = 0.0
        flags: list[str] = []

        try:
            cancellation_rate = float(provider.get("cancellation_rate", 0.0))
        except (ValueError, TypeError):
            cancellation_rate = 0.0
        if cancellation_rate > 0.20:
            risk += 0.35
            if "HIGH_CANCELLATION_RATE" not in flags:
                flags.append("HIGH_CANCELLATION_RATE")
        elif cancellation_rate > 0.10:
            risk += 0.20
            if "HIGH_CANCELLATION_RATE" not in flags:
                flags.append("HIGH_CANCELLATION_RATE")

        if not provider.get("verified", False):
            risk += 0.25
            if "UNVERIFIED_PROFILE" not in flags:
                flags.append("UNVERIFIED_PROFILE")

        try:
            trust_score = float(provider.get("trust_score", 1.0))
        except (ValueError, TypeError):
            trust_score = 1.0
        if trust_score < 0.50:
            risk += 0.35
            if "LOW_TRUST_SCORE" not in flags:
                flags.append("LOW_TRUST_SCORE")
        elif trust_score < 0.70:
            risk += 0.20
            if "LOW_TRUST_SCORE" not in flags:
                flags.append("LOW_TRUST_SCORE")

        try:
            jobs_completed = int(provider.get("jobs_completed", 0))
        except (ValueError, TypeError):
            jobs_completed = 0
        if jobs_completed < 3:
            risk += 0.25
            if "NEW_ACCOUNT" not in flags:
                flags.append("NEW_ACCOUNT")
        elif jobs_completed < 10:
            risk += 0.15
            if "NEW_ACCOUNT" not in flags:
                flags.append("NEW_ACCOUNT")

        try:
            recent_pos = float(provider.get("recent_reviews_positive", 1.0))
        except (ValueError, TypeError):
            recent_pos = 1.0
        if recent_pos < 0.50:
            risk += 0.35
            if "NEGATIVE_REVIEWS" not in flags:
                flags.append("NEGATIVE_REVIEWS")
        elif recent_pos < 0.70:
            risk += 0.20
            if "NEGATIVE_REVIEWS" not in flags:
                flags.append("NEGATIVE_REVIEWS")

        try:
            rating = float(provider.get("rating", 0.0))
        except (ValueError, TypeError):
            rating = 0.0
        try:
            review_count = int(provider.get("review_count", 0))
        except (ValueError, TypeError):
            review_count = 0
        if rating > 4.8 and review_count < 20:
            risk += 0.15
            if "FAKE_REVIEW_PATTERN" not in flags:
                flags.append("FAKE_REVIEW_PATTERN")

        try:
            price_per_hour = float(provider.get("price_per_hour", 0.0))
        except (ValueError, TypeError):
            price_per_hour = 0.0
        try:
            city_avg = float(context.get("city_avg_price_per_hour", price_per_hour or 1.0))
        except (ValueError, TypeError):
            city_avg = price_per_hour or 1.0
        if city_avg > 0 and price_per_hour > 3 * city_avg:
            risk += 0.20
            if "PRICE_MANIPULATION" not in flags:
                flags.append("PRICE_MANIPULATION")

        try:
            workload = int(provider.get("workload_today", 0))
        except (ValueError, TypeError):
            workload = 0
        if workload >= 4:
            risk += 0.10
            if "OVERLOADED_PROVIDER" not in flags:
                flags.append("OVERLOADED_PROVIDER")

        risk_score = round(min(risk, 1.0), 4)
        action = _action_from_risk(risk_score)
        emergency_override = False

        if (
            context.get("emergency") is True
            and provider.get("verified") is True
            and risk_score < 0.60
            and action in ("MANUAL_REVIEW", "BLOCK")
        ):
            action = "APPROVE_WITH_WARNING"
            emergency_override = True

        provider_id = str(provider.get("id", "unknown"))
        warning = _provider_warning(action)

        return {
            "provider_id": provider_id,
            "provider_risk_score": risk_score,
            "risk_flags": flags,
            "recommended_action": action,
            "warning_message": warning,
            "emergency_override": emergency_override,
            "_log": _make_log(
                start=start,
                input_summary=f"Provider trust check: id={provider_id!r} verified={provider.get('verified')}",
                output_summary=f"risk={risk_score} action={action} flags={len(flags)}",
                decision_made=f"Provider {action}",
                confidence=max(0.0, 1.0 - risk_score),
            ),
        }

    async def assess_trust(
        self,
        ranked_providers: list[dict],
        user_id: str,
        intent: dict | None = None,
    ) -> dict[str, Any]:
        """
        Assess each provider; return orchestrator-compatible shape.

        Optional ``intent`` supplies emergency override for graph/orchestrator callers.
        """
        start = _now()
        intent = intent or {}
        context = {
            "emergency": bool(intent.get("emergency")),
            "city_avg_price_per_hour": 800,
        }

        assessments: list[dict[str, Any]] = []
        approved = 0
        blocked = 0
        warning_actions = 0

        for provider in ranked_providers:
            result = await self.assess_provider(provider, context)
            trust_score = round(1.0 - float(result["provider_risk_score"]), 4)

            warnings: list[str] = []
            warning_msg = result.get("warning_message")
            if warning_msg:
                warnings.append(str(warning_msg))

            action = result["recommended_action"]
            if action == "BLOCK":
                blocked += 1
            elif action == "APPROVE":
                approved += 1
            else:
                warning_actions += 1

            assessments.append(
                {
                    "provider_id": result["provider_id"],
                    "trust_score": trust_score,
                    "risk_flags": result["risk_flags"],
                    "recommended_action": action,
                    "warnings": warnings,
                }
            )

        total = len(assessments)
        batch_confidence = (
            round(sum(a["trust_score"] for a in assessments) / total, 4) if total else 1.0
        )

        return {
            "assessments": assessments,
            "_log": _make_log(
                start=start,
                input_summary=(
                    f"HIFAZAT trust batch: {total} providers user_id={user_id!r} "
                    f"emergency={context['emergency']}"
                ),
                output_summary=(
                    f"approved={approved} blocked={blocked} "
                    f"warnings_or_review={warning_actions}"
                ),
                decision_made=(
                    f"Trust screening: {approved} approve, {warning_actions} caution, "
                    f"{blocked} block"
                ),
                confidence=batch_confidence,
            ),
        }

    async def assess_customer(self, customer: dict, context: dict) -> dict[str, Any]:
        start = _now()
        risk = 0.0
        flags: list[str] = []

        try:
            payment_failures = int(customer.get("payment_failures", 0))
        except (ValueError, TypeError):
            payment_failures = 0
        if payment_failures > 2:
            risk += 0.25
            if "PAYMENT_FAILURES" not in flags:
                flags.append("PAYMENT_FAILURES")

        try:
            dispute_count = int(customer.get("dispute_count", 0))
        except (ValueError, TypeError):
            dispute_count = 0
        if dispute_count > 3:
            risk += 0.20
            if "DISPUTE_ABUSER" not in flags:
                flags.append("DISPUTE_ABUSER")

        try:
            fake_flags = int(customer.get("fake_request_flags", 0))
        except (ValueError, TypeError):
            fake_flags = 0
        if fake_flags > 1:
            risk += 0.30
            if "FAKE_REQUEST_HISTORY" not in flags:
                flags.append("FAKE_REQUEST_HISTORY")

        try:
            account_age = int(customer.get("account_age_days", 365))
        except (ValueError, TypeError):
            account_age = 365
        if account_age < 7:
            risk += 0.15
            if "NEW_ACCOUNT" not in flags:
                flags.append("NEW_ACCOUNT")

        try:
            jobs_completed = int(customer.get("jobs_completed", 0))
        except (ValueError, TypeError):
            jobs_completed = 0
        if jobs_completed == 0 and dispute_count > 0:
            risk += 0.20
            if "DISPUTE_ABUSER" not in flags:
                flags.append("DISPUTE_ABUSER")

        try:
            trust_score = float(customer.get("trust_score", 1.0))
        except (ValueError, TypeError):
            trust_score = 1.0
        if trust_score < 0.60:
            risk += 0.20
            if "LOW_TRUST_SCORE" not in flags:
                flags.append("LOW_TRUST_SCORE")

        risk_score = round(min(risk, 1.0), 4)
        action = _customer_action_from_risk(risk_score)
        customer_id = str(customer.get("id", "unknown"))
        _ = context  # reserved for future context-aware rules

        return {
            "customer_id": customer_id,
            "customer_risk_score": risk_score,
            "risk_flags": flags,
            "recommended_action": action,
            "_log": _make_log(
                start=start,
                input_summary=f"Customer trust check: id={customer_id!r} trust={trust_score}",
                output_summary=f"risk={risk_score} action={action} flags={len(flags)}",
                decision_made=f"Customer {action}",
                confidence=max(0.0, 1.0 - risk_score),
            ),
        }

    async def process_feedback(self, feedback: dict) -> dict[str, Any]:
        start = _now()
        job_id = str(feedback.get("job_id", ""))
        provider_id = str(feedback.get("provider_id", ""))
        customer_id = str(feedback.get("customer_id", ""))

        try:
            days_since = int(feedback.get("days_since_job", 0))
        except (ValueError, TypeError):
            days_since = 0
        if days_since > 30:
            return {
                "job_id": job_id,
                "provider_id": provider_id,
                "customer_id": customer_id,
                "feedback_valid": False,
                "status": "REJECTED",
                "reason": "Feedback window expired (30 days)",
                "severity": "NONE",
                "trust_point_change": 0,
                "action_taken": "REJECTED",
                "customer_message": "",
                "provider_message": "",
                "risk_flags": [],
                "refund_eligible": False,
                "refund_amount_pkr": 0.0,
                "_log": _make_log(
                    start=start,
                    input_summary=f"Feedback job={job_id} rejected (late)",
                    output_summary="REJECTED — window expired",
                    decision_made="Feedback rejected",
                    confidence=1.0,
                ),
            }

        rating = feedback.get("rating")
        if rating is None:
            return {
                "job_id": job_id,
                "provider_id": provider_id,
                "customer_id": customer_id,
                "feedback_valid": False,
                "status": "REJECTED",
                "reason": "Rating missing",
                "severity": "NONE",
                "trust_point_change": 0,
                "action_taken": "REJECTED",
                "customer_message": "",
                "provider_message": "",
                "risk_flags": [],
                "refund_eligible": False,
                "refund_amount_pkr": 0.0,
                "_log": _make_log(
                    start=start,
                    input_summary=f"Feedback job={job_id} rejected (no rating)",
                    output_summary="REJECTED — rating missing",
                    decision_made="Feedback rejected",
                    confidence=1.0,
                ),
            }

        try:
            rating = int(rating)
        except (ValueError, TypeError):
            return {
                "job_id": job_id,
                "provider_id": provider_id,
                "customer_id": customer_id,
                "feedback_valid": False,
                "status": "REJECTED",
                "reason": "Invalid rating",
                "severity": "NONE",
                "trust_point_change": 0,
                "action_taken": "REJECTED",
                "customer_message": "",
                "provider_message": "",
                "risk_flags": [],
                "refund_eligible": False,
                "refund_amount_pkr": 0.0,
                "_log": _make_log(
                    start=start,
                    input_summary=f"Feedback job={job_id} rejected (invalid rating)",
                    output_summary="REJECTED — invalid rating",
                    decision_made="Feedback rejected",
                    confidence=1.0,
                ),
            }

        complaint = feedback.get("complaint")
        complaint_type = str(feedback.get("complaint_type", "none"))
        try:
            job_value = float(feedback.get("job_value_pkr", 0.0))
        except (ValueError, TypeError):
            job_value = 0.0
        repeat_customer = bool(feedback.get("repeat_customer", False))
        risk_flags: list[str] = []

        if days_since == 0 and rating == 1:
            if "SUSPICIOUSLY_FAST_COMPLAINT" not in risk_flags:
                risk_flags.append("SUSPICIOUSLY_FAST_COMPLAINT")

        # Severity
        if rating == 1:
            severity = "CRITICAL"
        elif rating == 2:
            severity = "HIGH"
        elif rating == 3:
            severity = "MEDIUM" if complaint else "LOW"
        elif rating == 4:
            severity = "LOW"
        elif rating >= 5:
            severity = "NONE"
        else:
            severity = "LOW"

        # Trust points
        has_complaint = bool(complaint and str(complaint).strip())
        if rating == 5:
            trust_change = 5
        elif severity == "CRITICAL":
            trust_change = -15 if has_complaint else -8
        elif severity == "HIGH":
            trust_change = -10 if has_complaint else -5
        elif severity == "MEDIUM":
            trust_change = -3
        else:
            trust_change = 0

        # Fake complaint check
        if not repeat_customer and rating == 1 and days_since > 20:
            if "POSSIBLE_FAKE_COMPLAINT" not in risk_flags:
                risk_flags.append("POSSIBLE_FAKE_COMPLAINT")
            if trust_change < 0:
                trust_change = int(trust_change * 0.5)

        # Actions & messages
        customer_message = ""
        provider_message = ""
        refund_eligible = False
        refund_amount = 0.0

        if rating == 5:
            action = "REWARD_ISSUED"
            provider_message = (
                "Mubarak! Aap ne acha kaam kiya. Trust points mein izafa hua hai."
            )
            customer_message = (
                "Shukriya! Aap ki feedback se hum behtar ho rahe hain."
            )
        elif severity == "CRITICAL" and complaint_type in ("no_show", "job_incomplete"):
            action = "REFUND_INITIATED"
            refund_eligible = True
            refund_amount = round(job_value * 0.80, 2)
            customer_message = (
                "Humein aap ki takleef ka afsos hai. "
                "Aap ka refund 24-48 ghanty mein process ho ga."
            )
            provider_message = (
                "Aap ki service par complaint aayi hai. "
                "Aap ke trust points mein kami ki gayi hai."
            )
        elif severity == "CRITICAL" and complaint_type == "overcharging":
            action = "INVESTIGATION_OPENED"
            customer_message = (
                "Aap ki complaint darj ho gayi hai. "
                "Haazir team 24 ghanty mein rabita karegi."
            )
            provider_message = (
                "Aap ki service par complaint aayi hai. "
                "Aap ke trust points mein kami ki gayi hai."
            )
        elif severity == "CRITICAL" and complaint_type == "rude_behavior":
            action = "WARNING_ISSUED"
            customer_message = (
                "Aap ki complaint darj ho gayi hai. "
                "Provider ko warning di gayi hai."
            )
            provider_message = (
                "Aap ke khilaf bad-salookhi ki shikayat aayi hai. "
                "Agli baar izzat se pesh aayein — warning darj ki gayi hai."
            )
        elif severity == "CRITICAL" and complaint_type == "quality_issue":
            action = "INVESTIGATION_OPENED"
            customer_message = (
                "Aap ki complaint darj ho gayi hai. "
                "Haazir team 24 ghanty mein aap se rabita karegi."
            )
            provider_message = (
                "Aap ke kaam ki quality par complaint aayi hai. "
                "Haazir team review karegi."
            )
        elif severity == "CRITICAL":
            action = "REFUND_INITIATED"
            refund_eligible = True
            refund_amount = round(job_value * 0.80, 2)
            customer_message = (
                "Humein aap ki takleef ka afsos hai. "
                "Aap ka refund 24-48 ghanty mein process ho ga."
            )
            provider_message = (
                "Aap ki service par complaint aayi hai. "
                "Aap ke trust points mein kami ki gayi hai."
            )
        elif severity == "HIGH":
            action = "WARNING_ISSUED"
            provider_message = (
                "Aap ko warning di ja rahi hai. Agli baar behtar service dein."
            )
        elif severity == "MEDIUM":
            action = "FEEDBACK_NOTED"
        else:
            action = "FEEDBACK_NOTED"

        return {
            "job_id": job_id,
            "provider_id": provider_id,
            "customer_id": customer_id,
            "feedback_valid": True,
            "status": "FEEDBACK_PROCESSED",
            "severity": severity,
            "trust_point_change": trust_change,
            "action_taken": action,
            "customer_message": customer_message,
            "provider_message": provider_message,
            "risk_flags": risk_flags,
            "refund_eligible": refund_eligible,
            "refund_amount_pkr": refund_amount,
            "_log": _make_log(
                start=start,
                input_summary=(
                    f"Feedback job={job_id} rating={rating} type={complaint_type} "
                    f"value_pkr={job_value}"
                ),
                output_summary=(
                    f"severity={severity} action={action} trust_change={trust_change} "
                    f"refund={refund_amount}"
                ),
                decision_made=action,
                confidence=0.95,
            ),
        }

    async def run(self, mode: str, payload: dict) -> dict[str, Any]:
        start = _now()

        if mode == "pre_booking":
            provider_result = await self.assess_provider(
                payload["provider"], payload["context"]
            )
            customer_result = await self.assess_customer(
                payload["customer"], payload["context"]
            )

            p_action = provider_result["recommended_action"]
            c_action = customer_result["recommended_action"]

            if p_action == "BLOCK" or c_action == "BLOCK_CUSTOMER":
                overall = "BLOCK"
            elif "WARNING" in p_action or c_action == "REQUIRE_UPFRONT_PAYMENT":
                overall = "PROCEED_WITH_CAUTION"
            else:
                overall = "CLEAR"

            booking_allowed = overall != "BLOCK"

            p_conf = provider_result["_log"]["confidence"]
            c_conf = customer_result["_log"]["confidence"]
            combined_confidence = round((p_conf * 0.7) + (c_conf * 0.3), 4)

            return {
                "status": overall,
                "provider_assessment": provider_result,
                "customer_assessment": customer_result,
                "booking_allowed": booking_allowed,
                "_log": _make_log(
                    start=start,
                    input_summary="Pre-booking HIFAZAT: provider + customer assessment",
                    output_summary=f"overall={overall} booking_allowed={booking_allowed}",
                    decision_made=f"Pre-booking {overall}",
                    confidence=combined_confidence,
                ),
            }

        if mode == "post_feedback":
            return await self.process_feedback(payload["feedback"])

        raise ValueError(f"Unknown HIFAZAT mode: {mode!r}")
