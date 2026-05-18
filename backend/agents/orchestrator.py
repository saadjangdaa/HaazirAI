"""Master Orchestrator — runs all Haazir AI agents in sequence."""
import uuid
from datetime import datetime
from typing import Optional

from agents.samajh import SamajhAgent
from agents.dhundho import DhundhoAgent
from agents.chunno import ChunnoAgent
from agents.pakka import PakkaAgent
from agents.moltol import MoltolAgent
from agents.hifazat import HifazatAgent
from agents.hisaab import HisaabAgent
from agents.jhagra import JhagraAgent
from agents.report import ReportAgent

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


async def run_full_orchestration(
    user_input: str, user_location: str, user_id: str
) -> dict:
    request_id = f"REQ-{datetime.now().strftime('%Y%m%d%H%M%S')}-{str(uuid.uuid4())[:6].upper()}"
    logs = []

    # ── Step 1: SAMAJH — understand intent ──────────────────────────────
    intent_raw = await samajh.extract_intent(user_input)
    log = _extract_log(intent_raw)
    if log:
        logs.append(log)

    if intent_raw.get("clarification_needed") and not intent_raw.get("emergency"):
        return {
            "request_id": request_id,
            "clarification_needed": True,
            "clarification_question": intent_raw.get("clarification_question"),
            "agent_logs": logs,
        }

    if intent_raw.get("emergency"):
        return await _emergency_fast_track(request_id, intent_raw, user_id, user_location, logs)

    # ── Step 2: DHUNDHO — find providers ────────────────────────────────
    dhundho_result = await dhundho.find_providers(intent_raw)
    log = _extract_log(dhundho_result)
    if log:
        logs.append(log)

    providers_raw = dhundho_result.get("providers", [])

    if not providers_raw:
        return {
            "request_id": request_id,
            "clarification_needed": False,
            "extracted_intent": intent_raw,
            "providers_ranked": [],
            "fallback": dhundho_result.get("fallback_message"),
            "agent_logs": logs,
        }

    # ── Step 3: CHUNNO — rank providers ─────────────────────────────────
    chunno_result = await chunno.rank_providers(providers_raw, intent_raw)
    log = _extract_log(chunno_result)
    if log:
        logs.append(log)
    ranked = chunno_result.get("ranked_providers", providers_raw)

    # ── Step 4: HIFAZAT — trust check ───────────────────────────────────
    trust_result = await hifazat.assess_trust(ranked, user_id)
    log = _extract_log(trust_result)
    if log:
        logs.append(log)

    trust_map = {a["provider_id"]: a for a in trust_result.get("assessments", [])}
    approved_ranked = [
        p for p in ranked
        if trust_map.get(p["id"], {}).get("recommended_action") != "BLOCK"
    ]
    if not approved_ranked:
        approved_ranked = ranked

    best_provider = approved_ranked[0]

    # ── Step 5: HISAAB — calculate price ────────────────────────────────
    pricing_result = await hisaab.calculate_price(intent_raw, best_provider)
    log = _extract_log(pricing_result)
    if log:
        logs.append(log)

    # ── Step 6: PAKKA — confirm booking ─────────────────────────────────
    booking_result = await pakka.create_booking(intent_raw, best_provider, pricing_result, user_id)
    log = _extract_log(booking_result)
    if log:
        logs.append(log)

    return {
        "request_id": request_id,
        "clarification_needed": False,
        "extracted_intent": intent_raw,
        "providers_ranked": approved_ranked,
        "best_provider": best_provider,
        "price_breakdown": pricing_result,
        "booking": booking_result,
        "trust_scores": trust_result.get("assessments", []),
        "agent_logs": logs,
    }


async def run_bidding(request_id: str, providers: list, intent: dict) -> dict:
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
