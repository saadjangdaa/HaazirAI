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


def _dispute_action_from_risk(risk: float, *, serious_count: int) -> str:
    if serious_count >= 3:
        return "block_recommendation"
    if risk >= 0.75:
        return "escalate_admin"
    if risk >= 0.55:
        return "reduce_visibility"
    if risk >= 0.30:
        return "warn_worker"
    return "no_action"


_ABUSE_PHRASES = (
    "scam",
    "fraud",
    "chor",
    "fake",
    "idiot",
    "bewaqoof",
    "haram",
    "kill",
    "maro",
    "sue",
)
_EXAGGERATION_PHRASES = (
    "worst ever",
    "never again",
    "kabhi mat",
    "100% fraud",
    "pure fraud",
)


def analyze_complaint(text: str) -> dict[str, Any]:
    """
    Phase D — non-blocking complaint validity (rule-based).
    Returns complaint_verdict: valid | warning | abuse_risk
    """
    raw = (text or "").strip()
    if not raw:
        return {
            "complaint_verdict": "warning",
            "reason": "empty_complaint",
            "confidence": 0.5,
        }

    lower = raw.lower()
    if any(p in lower for p in _ABUSE_PHRASES):
        return {
            "complaint_verdict": "abuse_risk",
            "reason": "abusive_language",
            "confidence": 0.85,
        }

    if any(p in lower for p in _EXAGGERATION_PHRASES) and len(raw) < 40:
        return {
            "complaint_verdict": "warning",
            "reason": "possible_exaggeration",
            "confidence": 0.7,
        }

    if len(raw) < 12:
        return {
            "complaint_verdict": "warning",
            "reason": "too_vague",
            "confidence": 0.6,
        }

    return {
        "complaint_verdict": "valid",
        "reason": "legitimate_service_issue",
        "confidence": 0.8,
    }


# Trust delta on 0–1 scale (persisted to providers.trust_score).
_DISPUTE_TRUST_DELTA = {
    "rude_behavior": -0.03,
    "no_show": -0.10,
    "quality_complaint": -0.05,
    "price_disagreement": -0.06,
    "overrun": -0.04,
    "cancellation": -0.04,
    "refund_request": -0.05,
}

_SERIOUS_DISPUTE_TYPES = frozenset(
    {"no_show", "quality_complaint", "price_disagreement", "refund_request"}
)


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

    async def evaluate_dispute(
        self,
        *,
        booking: dict,
        dispute: dict,
        provider: dict,
        customer: dict,
        provider_serious_dispute_count: int = 0,
        customer_dispute_count: int = 0,
    ) -> dict[str, Any]:
        """
        Phase D — trust/risk after both sides submitted (worker_response expected).
        Does not decide refunds (JHAGRA / Phase E).
        """
        start = _now()
        dtype = str(dispute.get("type") or dispute.get("dispute_type") or "").strip()
        customer_msg = (
            dispute.get("customer_message") or dispute.get("description") or ""
        )
        worker_msg = ""
        wr = dispute.get("worker_response")
        if isinstance(wr, dict):
            worker_msg = str(wr.get("message") or "")

        complaint = analyze_complaint(str(customer_msg))
        verdict = complaint["complaint_verdict"]

        risk = 0.0
        flags: list[str] = []

        base_delta = _DISPUTE_TRUST_DELTA.get(dtype, -0.04)
        provider_delta = base_delta
        customer_delta = 0.0

        if dtype == "rude_behavior":
            provider_delta = -0.03
            if "RUDE_BEHAVIOR_REPORT" not in flags:
                flags.append("RUDE_BEHAVIOR_REPORT")
        elif dtype == "no_show":
            provider_delta = -0.10
            if "NO_SHOW_REPORT" not in flags:
                flags.append("NO_SHOW_REPORT")
        elif dtype in _SERIOUS_DISPUTE_TYPES:
            if "SERIOUS_SERVICE_ISSUE" not in flags:
                flags.append("SERIOUS_SERVICE_ISSUE")

        if provider_serious_dispute_count >= 3:
            risk += 0.35
            provider_delta -= 0.05
            if "REPEATED_SERIOUS_COMPLAINTS" not in flags:
                flags.append("REPEATED_SERIOUS_COMPLAINTS")

        if provider_serious_dispute_count >= 2:
            risk += 0.15

        try:
            cancellation_rate = float(provider.get("cancellation_rate", 0.0))
        except (ValueError, TypeError):
            cancellation_rate = 0.0
        if cancellation_rate > 0.15:
            risk += 0.15
            if "HIGH_CANCELLATION_RATE" not in flags:
                flags.append("HIGH_CANCELLATION_RATE")

        if verdict == "abuse_risk":
            risk += 0.25
            customer_delta = -0.05
            provider_delta = round(provider_delta * 0.5, 4)
            if "CUSTOMER_ABUSE_LANGUAGE" not in flags:
                flags.append("CUSTOMER_ABUSE_LANGUAGE")
        elif verdict == "warning":
            risk += 0.10
            if "COMPLAINT_NEEDS_REVIEW" not in flags:
                flags.append("COMPLAINT_NEEDS_REVIEW")

        if customer_dispute_count > 4:
            risk += 0.20
            customer_delta -= 0.04
            if "CUSTOMER_DISPUTE_PATTERN" not in flags:
                flags.append("CUSTOMER_DISPUTE_PATTERN")

        if not worker_msg.strip():
            risk += 0.05
            if "NO_WORKER_RESPONSE" not in flags:
                flags.append("NO_WORKER_RESPONSE")

        risk = round(min(risk, 1.0), 4)
        recommended_action = _dispute_action_from_risk(
            risk, serious_count=provider_serious_dispute_count
        )

        try:
            current_trust = float(provider.get("trust_score", 0.8))
        except (ValueError, TypeError):
            current_trust = 0.8
        new_trust = round(max(0.0, min(1.0, current_trust + provider_delta)), 4)

        provider_id = str(
            provider.get("id") or provider.get("provider_id") or dispute.get("worker_id") or ""
        )
        customer_id = str(customer.get("id") or customer.get("user_id") or dispute.get("user_id") or "")

        return {
            "trust_score": new_trust,
            "previous_trust_score": round(current_trust, 4),
            "provider_trust_delta": round(provider_delta, 4),
            "customer_trust_delta": round(customer_delta, 4),
            "risk_flags": flags,
            "risk_score": risk,
            "recommended_action": recommended_action,
            "complaint_verdict": verdict,
            "complaint_analysis": complaint,
            "non_blocking": dtype == "rude_behavior",
            "refund_recommended": False if dtype == "rude_behavior" else None,
            "provider_id": provider_id,
            "customer_id": customer_id,
            "dispute_type": dtype,
            "_log": _make_log(
                start=start,
                input_summary=(
                    f"Dispute evaluate booking={booking.get('booking_id')} "
                    f"type={dtype} verdict={verdict}"
                ),
                output_summary=(
                    f"risk={risk} action={recommended_action} "
                    f"trust={new_trust} delta={provider_delta}"
                ),
                decision_made=recommended_action,
                confidence=complaint.get("confidence", 0.75),
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

        if mode == "evaluate_dispute":
            return await self.evaluate_dispute(
                booking=payload["booking"],
                dispute=payload["dispute"],
                provider=payload["provider"],
                customer=payload["customer"],
                provider_serious_dispute_count=int(
                    payload.get("provider_serious_dispute_count", 0)
                ),
                customer_dispute_count=int(payload.get("customer_dispute_count", 0)),
            )

        raise ValueError(f"Unknown HIFAZAT mode: {mode!r}")
