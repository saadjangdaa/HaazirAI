"""Master Orchestrator — runs all Haazir AI agents in sequence."""
import uuid
from datetime import datetime
from typing import Any, Dict, Optional

from agents.samajh import SamajhAgent
from agents.dhundho import DhundhoAgent
from agents.chunno import ChunnoAgent
from agents.pakka import PakkaAgent
from agents.moltol import MoltolAgent
from agents.hifazat import HifazatAgent
from agents.hisaab import HisaabAgent
from agents.jhagra import JhagraAgent
from agents.report import ReportAgent
from orchestration.tracer import Tracer

samajh = SamajhAgent()
dhundho = DhundhoAgent()
chunno = ChunnoAgent()
pakka = PakkaAgent()
moltol = MoltolAgent()
hifazat = HifazatAgent()
hisaab = HisaabAgent()
jhagra = JhagraAgent()
report = ReportAgent()


def _extract_log(obj: dict) -> Optional[dict]:
    return obj.pop("_log", None)


def _sanitize_for_trace(payload: Any) -> Any:
    if isinstance(payload, (str, int, float, bool)) or payload is None:
        return payload
    if isinstance(payload, list):
        return [_sanitize_for_trace(item) for item in payload[:20]]
    if isinstance(payload, dict):
        return {k: _sanitize_for_trace(v) for k, v in payload.items() if not k.startswith("_")}
    return str(payload)


def _result_with_trace(tracer: Tracer, result: Dict[str, Any]) -> Dict[str, Any]:
    result["trace"] = tracer.to_dict(final_output=_sanitize_for_trace(result))
    return result


async def run_full_orchestration(
    user_input: str, user_location: str, user_id: str
) -> dict:
    request_id = f"REQ-{datetime.now().strftime('%Y%m%d%H%M%S')}-{str(uuid.uuid4())[:6].upper()}"
    tracer = Tracer(request_id=request_id, user_id=user_id, user_input=user_input)
    logs = []

    # ── Step 1: SAMAJH — understand intent ──────────────────────────────
    tracer.log_decision("Starting SAMAJH agent (intent extraction)")
    with tracer.start_agent("SAMAJH") as step:
        step.log_step("Extracting intent from user input")
        step.log_api_call("Gemini", {"task": "extract_intent"})
        intent_raw = await samajh.extract_intent(user_input)
        log = _extract_log(intent_raw)
        if log:
            logs.append(log)
        step.finalize(
            input_data={"user_input": user_input},
            output_data={"clarification_needed": intent_raw.get("clarification_needed")},
        )

    if intent_raw.get("clarification_needed") and not intent_raw.get("emergency"):
        tracer.log_decision("SAMAJH requested clarification")
        return _result_with_trace(tracer, {
            "request_id": request_id,
            "clarification_needed": True,
            "clarification_question": intent_raw.get("clarification_question"),
            "agent_logs": logs,
        })

    if intent_raw.get("emergency"):
        tracer.log_decision("Emergency flow triggered")
        emergency = await _emergency_fast_track(request_id, intent_raw, user_id, user_location, logs)
        return _result_with_trace(tracer, emergency)

    # ── Step 2: DHUNDHO — find providers ────────────────────────────────
    tracer.log_decision("Starting DHUNDHO agent (provider discovery)")
    with tracer.start_agent("DHUNDHO") as step:
        step.log_step("Finding providers for extracted intent")
        dhundho_result = await dhundho.find_providers(intent_raw)
        log = _extract_log(dhundho_result)
        if log:
            logs.append(log)
        step.finalize(
            input_data={"service_type": intent_raw.get("service_type")},
            output_data={"provider_count": len(dhundho_result.get("providers", []))},
        )

    providers_raw = dhundho_result.get("providers", [])

    if not providers_raw:
        tracer.log_decision("No providers found")
        return _result_with_trace(tracer, {
            "request_id": request_id,
            "clarification_needed": False,
            "extracted_intent": intent_raw,
            "providers_ranked": [],
            "fallback": dhundho_result.get("fallback_message"),
            "agent_logs": logs,
        })

    # ── Step 3: CHUNNO — rank providers ─────────────────────────────────
    tracer.log_decision("Starting CHUNNO agent (ranking)")
    with tracer.start_agent("CHUNNO") as step:
        step.log_step(f"Ranking {len(providers_raw)} providers")
        chunno_result = await chunno.rank_providers(providers_raw, intent_raw)
        log = _extract_log(chunno_result)
        if log:
            logs.append(log)
        step.finalize(
            input_data={"provider_count": len(providers_raw)},
            output_data={"ranked_count": len(chunno_result.get("ranked_providers", []))},
        )
    ranked = chunno_result.get("ranked_providers", providers_raw)

    # ── Step 4: HIFAZAT — trust check ───────────────────────────────────
    tracer.log_decision("Starting HIFAZAT agent (trust filtering)")
    with tracer.start_agent("HIFAZAT") as step:
        step.log_step(f"Assessing trust for {len(ranked)} providers")
        trust_result = await hifazat.assess_trust(ranked, user_id, intent=intent_raw)
        log = _extract_log(trust_result)
        if log:
            logs.append(log)
        step.finalize(
            input_data={"ranked_count": len(ranked)},
            output_data={"assessments": len(trust_result.get("assessments", []))},
        )

    trust_map = {a["provider_id"]: a for a in trust_result.get("assessments", [])}
    approved_ranked = [
        p for p in ranked
        if trust_map.get(p["id"], {}).get("recommended_action") != "BLOCK"
    ]
    if not approved_ranked:
        approved_ranked = ranked

    best_provider = approved_ranked[0]

    # ── Step 5: HISAAB — calculate price ────────────────────────────────
    tracer.log_decision("Starting HISAAB agent (pricing)")
    with tracer.start_agent("HISAAB") as step:
        step.log_step(f"Calculating price for {best_provider.get('id')}")
        pricing_result = await hisaab.calculate_price(intent_raw, best_provider)
        log = _extract_log(pricing_result)
        if log:
            logs.append(log)
        step.finalize(
            input_data={"provider_id": best_provider.get("id")},
            output_data={"total": pricing_result.get("total")},
        )

    # ── Step 6: PAKKA — confirm booking ─────────────────────────────────
    tracer.log_decision("Starting PAKKA agent (booking)")
    with tracer.start_agent("PAKKA") as step:
        step.log_step("Creating booking for top-ranked provider")
        booking_result = await pakka.create_booking(intent_raw, best_provider, pricing_result, user_id)
        log = _extract_log(booking_result)
        if log:
            logs.append(log)
        step.finalize(
            input_data={"provider_id": best_provider.get("id")},
            output_data={"booking_id": booking_result.get("booking_id")},
        )

    tracer.log_decision("All orchestration agents completed successfully")
    return _result_with_trace(tracer, {
        "request_id": request_id,
        "clarification_needed": False,
        "extracted_intent": intent_raw,
        "providers_ranked": approved_ranked,
        "best_provider": best_provider,
        "price_breakdown": pricing_result,
        "booking": booking_result,
        "trust_scores": trust_result.get("assessments", []),
        "agent_logs": logs,
    })


async def run_bidding(
    request_id: str,
    providers: list,
    intent: dict,
    pricing: dict | None = None,
) -> dict:
    if pricing:
        result = await moltol.negotiate(intent, providers, pricing)
        result["request_id"] = request_id
    else:
        result = await moltol.run_bidding(providers, intent, request_id)
    log = _extract_log(result)
    result["agent_log"] = log
    return result


async def run_dispute(booking_id: str, dispute_type: str, description: str, evidence_url: str = None) -> dict:
    result = await jhagra.resolve_dispute(booking_id, dispute_type, description, evidence_url)
    log = _extract_log(result)
    result["agent_log"] = log
    return result


async def run_provider_report(provider_id: str, provider_data: dict) -> dict:
    result = await report.generate_daily_report(provider_id, provider_data)
    log = _extract_log(result)
    result["agent_log"] = log
    return result


async def _emergency_fast_track(
    request_id: str, intent: dict, user_id: str, user_location: str, logs: list
) -> dict:
    dhundho_result = await dhundho.find_providers({**intent, "job_complexity": "basic"})
    log = _extract_log(dhundho_result)
    if log:
        log["decision_made"] = "EMERGENCY: fast-track, verified providers only, 2hr window"
        logs.append(log)

    providers_raw = dhundho_result.get("providers", [])
    if not providers_raw:
        return {
            "request_id": request_id,
            "emergency": True,
            "error": "Koi emergency provider available nahi — 112 ya local services se rabita karein",
            "agent_logs": logs,
        }

    best = providers_raw[0]

    pricing_result = await hisaab.calculate_price(intent, best)
    log = _extract_log(pricing_result)
    if log:
        logs.append(log)

    booking_result = await pakka.create_booking(intent, best, pricing_result, user_id)
    log = _extract_log(booking_result)
    if log:
        logs.append(log)

    return {
        "request_id": request_id,
        "emergency": True,
        "clarification_needed": False,
        "extracted_intent": intent,
        "providers_ranked": providers_raw[:3],
        "best_provider": best,
        "price_breakdown": pricing_result,
        "booking": booking_result,
        "trust_scores": [],
        "agent_logs": logs,
    }
