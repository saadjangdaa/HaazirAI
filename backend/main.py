"""
Haazir AI — route registration entry for uvicorn.

Run from repo root ONLY:
  python -m uvicorn backend.main:app --host 0.0.0.0 --port 8080
"""
import json
import os
import sys
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path

# Force UTF-8 on Windows so emoji log messages don't crash
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
from typing import Optional

from fastapi import FastAPI
_BACKEND_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _BACKEND_DIR.parent

for _path in (_REPO_ROOT, _BACKEND_DIR):
    if str(_path) not in sys.path:
        sys.path.insert(0, str(_path))

from fastapi import HTTPException
from fastapi.responses import JSONResponse

from backend.app import APP_INSTANCE_ID, app
from config import config
from logging_config import logger

from graph import new_request_id, run_samajh_workflow
from orchestration.reporter import ReportGenerator, zip_bytes_to_api_payload
from orchestration.storage import TraceStorage
from services.adk_runner import adk_runner
from models.request import (
    ServiceRequest,
    BidRequest,
    BookingRequest,
    DisputeRequest,
    DisputeRespondRequest,
    DisputeFinalizeRequest,
    FeedbackRequest,
    VoiceRequest,
    TTSRequest,
    ConversationRequest,
    NegotiateRequest,
    ConvDirectBookRequest,
    UserSyncRequest,
    BookingStatusUpdate,
)
from agents.orchestrator import run_full_orchestration
from agents.hisaab import HisaabAgent
from agents.moltol import MoltolAgent
from agents.orchestrator import run_bidding, run_provider_report
from agents.pakka import PakkaAgent
from services.firestore_schema import FORBIDDEN_USER_IDS
from services.firebase import (
    FirebaseService,
    get_booking,
    save_review,
    set_firebase_service,
    list_bookings,
    get_user,
    sync_user_profile,
    save_agent_logs,
    get_agent_logs_doc,
    get_dispute,
    list_disputes_for_booking,
    list_disputes_for_user,
    verify_disputes_integrity,
    verify_agent_logs_integrity,
    verify_notifications_integrity,
    list_providers as firestore_list_providers,
    seed_providers_from_json,
    is_mock_mode,
    append_user_booking,
    schedule_booking_reminders,
    verify_firestore_structure,
    migrate_reviews_to_bookings,
    verify_users_integrity,
    cleanup_invalid_user_documents,
    repair_user_profile_roots,
    verify_bookings_integrity,
    repair_all_booking_history,
    repair_all_dispute_history,
    cleanup_bookings_with_invalid_user_id,
    verify_providers_integrity,
    get_provider,
)
from services.users_integrity import normalize_role
from services.worker_service import get_worker_bookings, resolve_worker_provider_id, summarize_worker_earnings
from services.booking_service import set_booking_status, _enrich_booking
from services.dispute_config import dispute_instant_resolve_enabled
from services.dispute_service import (
    file_dispute,
    finalize_dispute,
    list_worker_disputes,
    respond_to_dispute,
)
from services.dispute_eligibility import NO_SHOW_GRACE_HOURS, assess_dispute_eligibility
from services.push_notify import (
    notify_booking_created,
    notify_feedback_received,
    process_pending_notifications,
)
@asynccontextmanager
async def lifespan(app: FastAPI):
    yield

app = FastAPI(
    title="Haazir Dost API",
    description="Pakistan's agentic home-services orchestrator",
    version="1.0.0",
    lifespan=lifespan,
)
from services.user_validation import (
    is_profile_complete,
    mirror_profile_root_fields,
    normalize_username,
    profile_completion_issues,
    sanitize_worker_data,
)

# ── Module-level initialisation ───────────────────────────────────────────────

firebase: Optional[FirebaseService] = None
_PROVIDERS_PATH = _BACKEND_DIR / "data" / "providers.json"
_request_store: dict = {}
_providers_cache: list = []
_session_search_cache: dict = {}  # session_id → {service, location, urgency, providers, intent}
pakka_agent = PakkaAgent()
hisaab_agent = HisaabAgent()
moltol_agent = MoltolAgent()

try:
    if config.validate():
        _cred_path = str(config.resolved_credentials_path())
        firebase = FirebaseService(_cred_path)
        set_firebase_service(firebase)
        logger.info("Firebase initialized mock=%s env=%s", firebase.is_mock, config.ENVIRONMENT)
    else:
        logger.warning("Config validation failed — Firebase not initialized (mock mode)")
except Exception as _fe:
    logger.error("Firebase init error: %s", _fe)

# ── Helpers ───────────────────────────────────────────────────────────────────

def _require_firebase_uid(user_id: str) -> str:
    uid = (user_id or "").strip()
    if not uid or uid in FORBIDDEN_USER_IDS:
        raise HTTPException(
            status_code=400,
            detail="Valid Firebase Auth UID required — log in on the app",
        )
    return uid


async def _require_complete_profile(user_id: str) -> None:
    doc = await get_user(user_id)
    issues = profile_completion_issues(doc)
    if issues:
        raise HTTPException(status_code=403, detail=" ".join(issues))


def _load_providers() -> list:
    global _providers_cache
    if not _providers_cache:
        with open(_PROVIDERS_PATH, encoding="utf-8") as f:
            _providers_cache = json.load(f)
    return _providers_cache


def _fallback_ranked_providers(intent: dict, limit: int = 8) -> list:
    """When Dhundho/Chunno return empty, show SAME-SERVICE providers from seed data."""
    from agents.dhundho import _service_matches
    from services.providers_integrity import format_provider_record
    from services.service_categories import filter_providers_by_category, intent_category

    intent = intent or {}
    service_type = (intent.get("service_type") or "").strip()
    city = (intent.get("city") or "").strip()
    pool = list(_load_providers())  # flat list, not wrapped

    # Always filter by service first — never show unrelated categories
    if service_type:
        matched = [p for p in pool if _service_matches(service_type, p)]
        pool = matched if matched else pool  # only fall back to all if truly no match

    # Then narrow by city
    if city:
        same_city = [p for p in pool if (p.get("city") or "").lower() == city.lower()]
        if same_city:
            pool = same_city
        # else keep the city-unfiltered set (still same-service)

    ranked = [format_provider_record(p, p.get("id")) for p in pool[:limit]]
    for i, p in enumerate(ranked):
        p.setdefault("ranking_score", 1.0 - i * 0.05)
        p.setdefault("ranking_reason_urdu", "Aapki request ke liye qareeb technician")
    return ranked


def _filter_providers_by_service(providers: list, intent: dict) -> list:
    """Final safeguard: strip providers that don't match the requested service.
    If filtering would leave 0 results, return original (better some than none)."""
    from agents.dhundho import _service_matches
    service_type = (intent.get("service_type") or "").strip()
    if not service_type or not providers:
        return providers
    filtered = [p for p in providers if _service_matches(service_type, p)]
    return filtered if filtered else providers


# Maps common misspellings / non-English words Gemini might use to canonical English service names
_SERVICE_ALIASES: dict[str, str] = {
    "mechanic": "mechanic", "car mechanic": "mechanic", "auto mechanic": "mechanic",
    "مکينک": "mechanic", "مکینک": "mechanic",
    "plumber": "plumber", "پلمبر": "plumber", "نلساز": "plumber",
    "electrician": "electrician", "الیکٹریشن": "electrician", "بجلی": "electrician",
    "ac repair": "AC repair", "ac": "AC repair", "اے سی": "AC repair",
    "tutor": "tutor", "ٹیوٹر": "tutor", "استاد": "tutor",
    "carpenter": "carpenter", "بڑھئی": "carpenter",
    "beautician": "beautician", "بیوٹیشن": "beautician",
}

def _normalize_service(service: str) -> str:
    """Map any service string (including non-English) to a canonical English service name."""
    s = (service or "").strip().lower()
    for alias, canonical in _SERVICE_ALIASES.items():
        if alias.lower() in s:
            return canonical
    return service  # return as-is if no alias matched


_AGENT_URDU = {
    "Samajh": "سمجھ",
    "Dhundho": "ڈھونڈو",
    "Chunno": "چُنّو",
}


def _judge_logs_to_mobile_agent_logs(logs: list) -> list:
    out = []
    for entry in logs:
        ts = entry.get("timestamp", "")
        agent = entry.get("agent", "Samajh")
        out.append({
            "agent_name": agent.upper(),
            "agent_name_urdu": _AGENT_URDU.get(agent, agent),
            "start_time": ts,
            "end_time": ts,
            "input_summary": entry.get("reasoning", ""),
            "output_summary": entry.get("decision", ""),
            "decision_made": entry.get("decision", ""),
            "confidence": float(entry.get("confidence", 0.0)),
            "fallback_used": entry.get("status") == "failure",
            "time_seconds": 0.0,
        })
    return out


# ── Routes ────────────────────────────────────────────────────────────────────

@app.post("/api/voice/transcribe")
async def transcribe_voice(body: VoiceRequest):
    """Transcribe audio using Gemini 2.0 Flash. Supports Urdu, Roman Urdu, English, Sindhi."""
    from services.voice import transcribe_audio
    return await transcribe_audio(body.audio_base64, body.mime_type)


@app.post("/api/voice/tts")
async def voice_tts(body: TTSRequest):
    """Convert text to Urdu speech using Uplift AI."""
    from services.uplift_tts import text_to_speech
    return await text_to_speech(body.text, body.voice_id, body.translate)


@app.get("/health")
async def health():
    fb = getattr(app.state, "firebase", None) or firebase
    mode = "mock" if fb is None or fb.is_mock else "connected"
    return {
        "status": "ok",
        "timestamp": datetime.now().isoformat(),
        "service": "Haazir AI",
        "instance_id": APP_INSTANCE_ID,
        "firebase": mode,
        "environment": config.ENVIRONMENT,
        "features": {
            "dispute_repeat_allowed": True,
            "dispute_two_sided": not dispute_instant_resolve_enabled(),
            "dispute_instant_resolve": dispute_instant_resolve_enabled(),
            "dispute_worker_respond": True,
            "hifazat_dispute_eval": True,
            "hifazat_feedback_trust": True,
            "dispute_finalize_jhagra": True,
            "agent_logs_on_request": True,
            "fcm_pipeline": True,
            "notification_dedupe_seconds": 90,
        },
        "firebase": mode,
        "environment": config.ENVIRONMENT,
    }


@app.get("/test/firebase")
async def test_firebase():
    fb = getattr(app.state, "firebase", None) or firebase
    if fb is None:
        raise HTTPException(status_code=503, detail="Firebase not initialized")
    try:
        providers = fb.get_all_providers()
        return {
            "status": "success",
            "firebase": "mock" if fb.is_mock else "connected",
            "providers_count": len(providers),
        }
    except Exception as e:
        logger.error("test_firebase failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e)) from e


_AGENT_URDU = {
    "Samajh": "سمجھ",
    "Dhundho": "ڈھونڈو",
    "Chunno": "چُنّو",
    "Hifazat": "حفاظت",
    "Hisaab": "حساب",
    "Moltol": "مول تول",
    "Pakka": "پکا",
}


def _judge_logs_to_mobile_agent_logs(logs: list) -> list:
    """Map judge-facing reasoning entries to the legacy shape used by the Expo AgentLogViewer."""
    out = []
    for entry in logs:
        ts = entry.get("timestamp", "")
        agent = entry.get("agent", "Samajh")
        out.append(
            {
                "agent_name": agent.upper(),
                "agent_name_urdu": _AGENT_URDU.get(agent, agent),
                "start_time": ts,
                "end_time": ts,
                "input_summary": entry.get("reasoning", ""),
                "output_summary": entry.get("decision", ""),
                "decision_made": entry.get("decision", ""),
                "confidence": float(entry.get("confidence", 0.0)),
                "fallback_used": entry.get("status") == "failure",
                "time_seconds": 0.0,
            }
        )
    return out


@app.post("/api/request")
async def handle_service_request(body: ServiceRequest):
    """Samajh → Dhundho → Chunno via LangGraph."""
    uid = _require_firebase_uid(body.user_id)
    await _require_complete_profile(uid)
    result = await run_full_orchestration(
        user_input=body.user_input,
        user_location=body.user_location,
        user_id=uid,
    )
    if result.get("trace"):
        await TraceStorage.save_trace(
            request_id=result.get("request_id", ""),
            user_input=body.user_input,
            trace_dict=result["trace"],
            user_id=uid,
        )
    request_id = (result.get("request_id") or "").strip()
    if not request_id:
        raise HTTPException(status_code=500, detail="Orchestration did not return request_id")
    logs = result.get("agent_logs") or []

    await save_agent_logs(request_id, body.user_input, logs, user_id=uid)
    """
    Full LangGraph pipeline through Pakka (price + negotiate + book).

    ``providers_ranked`` is Chunno-ranked then Hifazat-filtered (BLOCK removed).
    Send ``user_location`` from mobile.
    """
    request_id = new_request_id()
    final_state = await run_samajh_workflow(
        user_input=body.user_input.strip(),
        source="text",
        user_location=(body.user_location or "").strip(),
        user_id=body.user_id,
        request_id=request_id,
    )

    intent = final_state.get("intent") or {}
    logs = final_state.get("logs") or []
    providers_ranked = list(final_state.get("providers_ranked") or [])
    providers_discovered = list(final_state.get("providers") or [])
    dh_meta = final_state.get("dhundho_meta") or {}
    chunno_warnings = final_state.get("chunno_warnings") or []
    trust_scores = final_state.get("trust_scores") or []
    hifazat_meta = final_state.get("hifazat_meta") or {}
    price_breakdown = final_state.get("price_breakdown") or {}
    moltol_result = final_state.get("moltol_result") or {}
    booking = final_state.get("booking") or {}
    best_provider = final_state.get("best_provider") or (
        providers_ranked[0] if providers_ranked else None
    )

    if not providers_ranked:
        providers_ranked = _fallback_ranked_providers(intent, limit=8)

    # Safeguard: remove any cross-category providers that slipped through
    providers_ranked = _filter_providers_by_service(providers_ranked, intent)
    best_provider = providers_ranked[0] if providers_ranked else None

    _request_store[request_id] = {
        "user_input": body.user_input,
        "logs": logs,
        "intent": intent,
        "user_id": uid,
        "providers": providers_ranked,
        "price_breakdown": price_breakdown,
        "moltol_result": moltol_result,
        "booking": booking,
    }

    agent_logs = _judge_logs_to_mobile_agent_logs(logs)
    await save_agent_logs(request_id, body.user_input, logs, user_id=uid)

    return {
        "request_id": request_id,
        "extracted_intent": intent,
        "logs": logs,
        "agent_logs": agent_logs,
        "clarification_needed": bool(intent.get("clarification_needed")),
        "clarification_question": intent.get("clarification_question"),
        "emergency": bool(intent.get("emergency")),
        "providers_ranked": providers_ranked,
        "best_provider": best_provider,
        "chunno_warnings": chunno_warnings,
        "fallback": dh_meta.get("fallback_message"),
        "dhundho_meta": dh_meta,
        "chunno_meta": final_state.get("chunno_meta") or {},
        "trust_scores": trust_scores,
        "hifazat_meta": hifazat_meta,
        "price_breakdown": price_breakdown,
        "hisaab_meta": final_state.get("hisaab_meta") or {},
        "moltol_result": moltol_result,
        "moltol_meta": final_state.get("moltol_meta") or {},
        "booking": booking,
        "pakka_meta": final_state.get("pakka_meta") or {},
        "providers_discovered_count": len(providers_discovered),
    }


@app.post("/api/bid")
async def trigger_bidding(body: BidRequest):
    """Trigger MOLTOL negotiation for a prior request (returns cached graph result when present)."""
    cached = _request_store.get(body.request_id)
    if cached and cached.get("moltol_result"):
        out = dict(cached["moltol_result"])
        out["request_id"] = body.request_id
        out["from_cache"] = True
        return out

    if not cached:
        providers = _load_providers()[:5]
        intent = {"service_type": "service", "job_complexity": "intermediate", "urgency": "medium"}
        pricing = {"total": 2000, "estimated_base": 2000}
    else:
        providers = cached["providers"]
        intent = cached["intent"]
        pricing = cached.get("price_breakdown") or {"total": 2000, "estimated_base": 2000}

    result = await run_bidding(body.request_id, providers, intent, pricing)
    return result
    return await run_bidding(body.request_id, providers, intent)


@app.post("/api/book")
async def confirm_booking(body: BookingRequest):
    """PAKKA agent confirms a specific booking."""
    uid = _require_firebase_uid(body.user_id)
    await _require_complete_profile(uid)

    provider = await get_provider(body.provider_id)
    if not provider:
        from services.providers_integrity import format_provider_record
        all_providers = _load_providers()
        raw = next((p for p in all_providers if p.get("id") == body.provider_id), None)
        provider = format_provider_record(raw, body.provider_id) if raw else None
    if not provider:
        raise HTTPException(status_code=404, detail=f"Provider {body.provider_id} not found")

    intent = {
        "service_type": body.service,
        "time_preference": "flexible",
        "urgency": "medium",
        "job_complexity": "intermediate",
        "emergency": False,
        "location": "",
        "city": provider.get("city", "Islamabad"),
    }
    pricing = {"total": body.price_accepted}
    result = await pakka_agent.create_booking(intent, provider, pricing, uid)
    log = result.pop("_log", None)
    booking_id = result["booking_id"]

    await append_user_booking(uid, booking_id)
    if result.get("reminder_times"):
        await schedule_booking_reminders(
            booking_id, uid, result["reminder_times"],
            "Haazir AI reminder: booking {booking_id} is coming up soon.",
        )
    updated = await set_booking_status(booking_id, "confirmed")
    return {
        "booking_id": booking_id,
        "receipt": result["receipt"],
        "confirmation_message": result["confirmation_message"],
        "reminders": result["reminder_times"],
        "agent_log": log,
        "status": updated.get("status"),
    }


@app.post("/api/dispute")
async def handle_dispute(body: DisputeRequest):
    """File a dispute (default: open two-sided lifecycle; instant JHAGRA if DISPUTE_INSTANT_RESOLVE=true)."""
    uid = _require_firebase_uid(body.user_id)
    return await file_dispute(
        user_id=uid,
        booking_id=body.booking_id,
        dispute_type=body.dispute_type,
        description=body.description,
        evidence_url=body.evidence_url,
    )


@app.get("/api/dispute/{dispute_id}")
async def get_dispute_detail(dispute_id: str):
    doc = await get_dispute(dispute_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Dispute not found")
    return doc


@app.get("/api/disputes/booking/{booking_id}")
async def list_booking_disputes(booking_id: str):
    bid = (booking_id or "").strip()
    if not bid:
        raise HTTPException(status_code=400, detail="booking_id is required")
    return {"booking_id": bid, "disputes": await list_disputes_for_booking(bid)}


@app.get("/api/disputes/user/{user_id}")
async def list_user_disputes(user_id: str):
    uid = _require_firebase_uid(user_id)
    return {"user_id": uid, "disputes": await list_disputes_for_user(uid)}


@app.get("/api/disputes/worker/{user_id}")
async def list_worker_disputes_route(user_id: str, status: Optional[str] = None):
    """Worker dashboard — disputes against linked provider (default: all statuses; use status=open)."""
    uid = _require_firebase_uid(user_id)
    return await list_worker_disputes(uid, status=status)


@app.post("/api/dispute/{dispute_id}/respond")
async def respond_to_dispute_route(dispute_id: str, body: DisputeRespondRequest):
    """Worker response — open → under_review (does not modify booking)."""
    uid = _require_firebase_uid(body.user_id)
    return await respond_to_dispute(
        worker_uid=uid,
        dispute_id=dispute_id,
        message=body.message,
    )


@app.post("/api/dispute/{dispute_id}/finalize")
async def finalize_dispute_route(dispute_id: str, body: DisputeFinalizeRequest):
    """Phase E — JHAGRA final resolution after HIFAZAT review (under_review)."""
    uid = _require_firebase_uid(body.user_id)
    return await finalize_dispute(user_id=uid, dispute_id=dispute_id)


@app.get("/api/booking/{booking_id}")
async def get_booking_status(booking_id: str):
    booking = await get_booking(booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail=f"Booking {booking_id} not found")
    return await _enrich_booking(booking)


@app.get("/api/booking/{booking_id}/dispute-eligibility")
async def get_booking_dispute_eligibility(booking_id: str):
    """Phase A — whether customer can file a dispute (read-only; no auto-cancel)."""
    bid = (booking_id or "").strip()
    if not bid:
        raise HTTPException(status_code=400, detail="booking_id is required")
    booking = await get_booking(bid)
    if not booking:
        raise HTTPException(status_code=404, detail=f"Booking {bid} not found")
    check = assess_dispute_eligibility(booking)
    return {
        "booking_id": bid,
        "eligible": check.eligible,
        "reason": check.reason,
        "message": check.message,
        "booking_status": check.booking_status,
        "would_auto_cancel": check.would_auto_cancel,
        "no_show_grace_hours": NO_SHOW_GRACE_HOURS,
    }


@app.get("/api/bookings/user/{user_id}")
async def list_user_bookings(user_id: str):
    uid = _require_firebase_uid(user_id)
    rows = await list_bookings(user_id=uid)
    rows.sort(key=lambda b: b.get("created_at", ""), reverse=True)
    return {"bookings": [await _enrich_booking(b) for b in rows], "count": len(rows)}


@app.get("/api/bookings/provider/{provider_id}")
async def list_provider_bookings(provider_id: str, status: str = None):
    rows = await list_bookings(provider_id=provider_id, status=status)
    rows.sort(key=lambda b: b.get("created_at", ""), reverse=True)
    return {"bookings": [await _enrich_booking(b) for b in rows], "count": len(rows)}


@app.get("/api/bookings/worker/{user_id}")
async def list_worker_bookings(user_id: str, status: str = None):
    uid = _require_firebase_uid(user_id)
    try:
        return await get_worker_bookings(uid, status=status)
    except HTTPException:
        raise
    except Exception as e:
        print(f"[Worker jobs] error for uid={uid}: {e}")
        return {"user_id": uid, "provider_id": None, "bookings": [], "count": 0,
                "message": f"Jobs load karne mein masla hua — {type(e).__name__}"}


@app.get("/api/workers/{user_id}/earnings")
async def worker_earnings(user_id: str):
    uid = _require_firebase_uid(user_id)
    try:
        data = await get_worker_bookings(uid)
        summary = summarize_worker_earnings(data.get("bookings") or [])
        return {**summary, "provider_id": data.get("provider_id"), "user_id": uid}
    except HTTPException:
        raise
    except Exception as e:
        print(f"[Worker earnings] error for uid={uid}: {e}")
        return {"today_total": 0, "today_jobs": 0, "week_total": 0, "week_jobs": 0,
                "week_by_day": [0]*7, "completed_count": 0, "recent_payments": [],
                "provider_id": None, "user_id": uid}


@app.patch("/api/booking/{booking_id}/status")
async def patch_booking_status(booking_id: str, body: BookingStatusUpdate):
    return await set_booking_status(booking_id, body.status)


@app.post("/api/users/sync")
async def sync_user(body: UserSyncRequest):
    """Create/update users/{firebase_uid} after sign-in or profile completion."""
    uid = _require_firebase_uid(body.user_id)
    try:
        role = normalize_role(body.role)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    username = body.username or (
        normalize_username(body.name) if body.name and body.name.strip() else None
    )
    payload: dict = {
        "email": body.email.strip(),
        "role": role,
        "city": body.city or "",
    }
    if username:
        payload["username"] = username
        payload["name"] = username
    if body.phone:
        payload["phone"] = body.phone
    if body.cnic:
        payload["cnic"] = body.cnic
    if body.push_token:
        payload["push_token"] = body.push_token
    if body.provider_id:
        payload["provider_id"] = body.provider_id
    if body.skills is not None:
        payload["skills"] = body.skills
    if body.areas is not None:
        payload["areas"] = body.areas
    if body.availability is not None:
        payload["availability"] = body.availability
    if body.rating is not None:
        payload["rating"] = body.rating
    if body.price_per_service is not None:
        payload["price_per_service"] = body.price_per_service
    if body.experience_years is not None:
        payload["experience_years"] = body.experience_years

    if body.worker_data:
        wd = body.worker_data
        if not payload.get("phone") and wd.get("phone"):
            payload["phone"] = wd.get("phone")
        if not payload.get("cnic") and wd.get("cnic"):
            payload["cnic"] = wd.get("cnic")
        if not payload.get("username") and wd.get("username"):
            payload["username"] = wd.get("username")
            payload["name"] = wd.get("username")
        payload["worker_data"] = sanitize_worker_data(wd)
        payload.setdefault("skills", payload["worker_data"].get("specializations", body.skills or []))
        payload.setdefault("areas", payload["worker_data"].get("areas", body.areas or []))

    if body.role == "worker" and body.areas and not payload.get("city"):
        payload["city"] = body.city or body.areas[0]

    payload = mirror_profile_root_fields(payload)
    await sync_user_profile(uid, payload)
    if body.role == "worker":
        await resolve_worker_provider_id(uid, persist=True)
    doc = await get_user(uid)
    return {
        "success": True,
        "user_id": uid,
        "profile_complete": is_profile_complete(doc),
    }


@app.get("/api/users/{user_id}")
async def get_user_profile(user_id: str):
    uid = _require_firebase_uid(user_id)
    doc = await get_user(uid)
    if not doc:
        raise HTTPException(status_code=404, detail="User not found")
    normalized = mirror_profile_root_fields({**doc})
    if normalized.get("phone") and not (doc.get("phone") or "").strip():
        await sync_user_profile(uid, normalized)
    return {**normalized, "profile_complete": is_profile_complete(normalized)}


@app.get("/api/logs/{request_id}")
async def get_agent_logs(request_id: str):
    rid = (request_id or "").strip()
    doc = await get_agent_logs_doc(rid)
    if doc:
        return {
            "request_id": rid,
            "user_input": doc.get("user_input"),
            "timestamp": doc.get("timestamp"),
            "user_id": doc.get("user_id"),
            "logs": doc.get("logs", []),
            "log_count": len(doc.get("logs") or []),
            "source": "firestore",
        }
    cached = _request_store.get(rid)
    if cached:
        return {
            "request_id": rid,
            "user_input": cached.get("user_input"),
            "logs": cached.get("logs", []),
            "log_count": len(cached.get("logs") or []),
            "source": "memory",
        }
    return {
        "request_id": rid,
        "logs": [],
        "log_count": 0,
        "message": "Logs not found — run /api/request first",
    }


@app.get("/api/report/{request_id}/zip")
async def download_trace_report(request_id: str):
    """Download orchestration trace package (json + markdown + per-agent logs)."""
    rid = (request_id or "").strip()
    if not rid:
        raise HTTPException(status_code=400, detail="request_id is required")
    trace = await TraceStorage.get_trace(rid)
    if not trace:
        raise HTTPException(status_code=404, detail="Trace not found for request_id")
    zip_data = ReportGenerator.generate_zip_report(rid, trace)
    payload = zip_bytes_to_api_payload(zip_data)
    return JSONResponse(content={"request_id": rid, **payload})


@app.get("/api/provider/report/{provider_id}")
async def get_provider_report(provider_id: str):
    all_providers = _load_providers()
    provider = next((p for p in all_providers if p["id"] == provider_id), None)
    if not provider:
        raise HTTPException(status_code=404, detail=f"Provider {provider_id} not found")
    return await run_provider_report(provider_id, provider)


@app.get("/api/providers")
async def list_providers(city: str = None, service: str = None):
    from services.providers_integrity import format_provider_record
    providers = await firestore_list_providers(city=city, service=service)
    if not providers:
        providers = [format_provider_record(p, p.get("id")) for p in _load_providers()]
        if city:
            providers = [p for p in providers if p["city"].lower() == city.lower()]
        if service:
            providers = [
                p for p in providers
                if service.lower() in (p.get("service") or "").lower()
                or any(service.lower() in s.lower() for s in (p.get("specialization") or []))
            ]
    return {"providers": providers, "count": len(providers)}


@app.post("/api/admin/seed-providers")
async def seed_providers():
    if os.getenv("ENVIRONMENT", "development") != "development":
        raise HTTPException(status_code=403, detail="Seed only allowed in development")
    count = await seed_providers_from_json(str(_PROVIDERS_PATH))
    return {"seeded": count, "mock_mode": is_mock_mode(), "message": "Providers written to Firestore"}


@app.post("/api/conversation")
async def conversation(body: ConversationRequest):
    """BAAT-CHEET: Multi-turn voice conversation with state machine."""
    from agents.conversation import run_conversation
    from services.uplift_tts import text_to_speech
    from services.whatsapp import send_booking_whatsapp

    result = await run_conversation(
        session_id=body.session_id,
        user_message=body.user_text,
        providers=body.providers,
        user_name=body.user_name,
        history=body.history,
        language=body.language or 'roman_urdu',
    )

    if result.get("search_trigger"):
        trigger = result["search_trigger"]
        service = _normalize_service(trigger.get("service", "service"))
        location = trigger.get("location", "Islamabad")
        urgency = trigger.get("urgency", "medium")

        orch: dict = {}
        try:
            orch = await run_samajh_workflow(
                user_input=f"Mujhe {service} chahiye, location: {location}, urgency: {urgency}",
                source="text",
                user_location=location,
            )
        except Exception as _se:
            logger.warning("[conversation] run_samajh_workflow failed: %s", _se)

        providers = list((orch.get("providers_ranked") or []))[:3]
        if not providers:
            # Use service-filtered fallback — never inject unrelated categories
            fallback_intent = orch.get("intent") or {
                "service_type": service,
                "city": location,
            }
            providers = _fallback_ranked_providers(fallback_intent, limit=3)

        # Safeguard: strip any cross-category providers before sending to frontend
        search_intent = orch.get("intent") or {"service_type": service, "city": location}
        providers = _filter_providers_by_service(providers, search_intent)

        # Cache for book_trigger + negotiate endpoint
        _session_search_cache[body.session_id] = {
            "service": service,
            "location": location,
            "urgency": urgency,
            "providers": providers,
            "intent": orch.get("intent") or {
                "service_type": service,
                "location": location,
                "urgency": urgency,
                "job_complexity": "intermediate",
            },
        }

        follow_up = await run_conversation(
            session_id=body.session_id,
            user_message="[system: search complete]",
            providers=providers,
            user_name=body.user_name,
            history=None,  # session already exists at this point
        )
        result["response_text"] = follow_up["response_text"]
        result["providers"] = providers
        result["request_id"] = new_request_id()

        # If follow_up AI prematurely generated [BOOK:] (before user picked provider),
        # ignore it and keep phase at "confirming" so user sees the provider list.
        if follow_up.get("book_trigger"):
            logger.warning("[conversation] follow_up book_trigger ignored — search results just arrived, user hasn't picked a provider yet")
            result["phase"] = "confirming"
        else:
            result["phase"] = follow_up["phase"]

    # Safety: if both search and book triggered in the same response, ignore book.
    # [BOOK: ...] can only fire AFTER [RESULTS: ...] shown in a separate turn.
    if result.get("search_trigger") and result.get("book_trigger"):
        logger.warning("[conversation] book_trigger ignored — appeared with search_trigger in same turn (premature booking prevented)")
        result["book_trigger"] = None

    if result.get("book_trigger"):
        trigger = result["book_trigger"]
        provider_id = trigger.get("provider_id", "")
        payment_method = trigger.get("payment", "cash")
        uid = body.user_id or "anonymous"

        # Resolve provider — session cache first, then Firestore, then JSON fallback
        cached = _session_search_cache.get(body.session_id, {})
        cached_providers = cached.get("providers") or []
        provider = next((p for p in cached_providers if str(p.get("id")) == str(provider_id)), None)
        if not provider:
            provider = await get_provider(provider_id)
        if not provider:
            all_json = _load_providers()
            provider = next((p for p in all_json if p.get("id") == provider_id), None)
        if not provider:
            provider = (cached_providers or _load_providers())[0]

        if is_mock_mode():
            # Mock booking — Firebase not connected
            booking_id = f"HAZ-{uuid.uuid4().hex[:8].upper()}"
            result["booking_result"] = {
                "booking_id": booking_id,
                "provider": provider,
                "receipt": {
                    "service": provider.get("service", "Service"),
                    "location": f"{provider.get('area', '')}, {provider.get('city', 'Islamabad')}",
                    "scheduled_time": "Tomorrow 10:00 AM",
                    "estimated_price": f"Rs. {provider.get('price_per_hour', provider.get('base_rate', 2500)):,}",
                    "payment_methods": [payment_method.title()],
                    "status": "confirmed",
                },
                "confirmation_message": (
                    f"✅ {provider.get('name')} kal 10:00 AM pe aayenge. "
                    f"Rs. {provider.get('price_per_hour', provider.get('base_rate', 2500)):,}. Ref: {booking_id}"
                ),
                "reminders": [],
                "payment_method": payment_method,
                "whatsapp_sent": False,
            }
        else:
            # Real booking via Hisaab + Pakka + Firebase
            intent = cached.get("intent") or {
                "service_type": cached.get("service", provider.get("service", "service")),
                "time_preference": "flexible",
                "urgency": cached.get("urgency", "medium"),
                "job_complexity": "intermediate",
                "emergency": False,
                "location": cached.get("location", ""),
                "city": provider.get("city", "Islamabad"),
            }
            intent.setdefault("city", provider.get("city", "Islamabad"))
            intent.setdefault("time_preference", "flexible")
            try:
                pricing = await hisaab_agent.calculate_price(intent, provider)
                booking_res = await pakka_agent.create_booking(intent, provider, pricing, uid)
                booking_res.pop("_log", None)
                booking_id = booking_res["booking_id"]
                await append_user_booking(uid, booking_id)

                # WhatsApp notification
                user_doc = await get_user(uid)
                user_phone = (user_doc or {}).get("phone", "")
                whatsapp_sent = False
                if user_phone:
                    whatsapp_sent = await send_booking_whatsapp(
                        user_phone, booking_id,
                        provider.get("name", "Provider"),
                        intent.get("service_type", "service"),
                        pricing["total"],
                        booking_res.get("scheduled_time", ""),
                    )

                result["booking_result"] = {
                    "booking_id": booking_id,
                    "provider": provider,
                    "receipt": booking_res["receipt"],
                    "confirmation_message": booking_res["confirmation_message"],
                    "reminders": booking_res.get("reminder_times", []),
                    "payment_method": payment_method,
                    "whatsapp_sent": whatsapp_sent,
                }
            except Exception as _be:
                logger.error("[conversation] book_trigger real booking failed: %s", _be)
                booking_id = f"HAZ-{uuid.uuid4().hex[:8].upper()}"
                result["booking_result"] = {
                    "booking_id": booking_id,
                    "provider": provider,
                    "receipt": {
                        "service": provider.get("service", "Service"),
                        "location": f"{provider.get('area', '')}, {provider.get('city', 'Islamabad')}",
                        "scheduled_time": "Tomorrow 10:00 AM",
                        "estimated_price": f"Rs. {provider.get('price_per_hour', provider.get('base_rate', 2500)):,}",
                        "payment_methods": [payment_method.title()],
                        "status": "confirmed",
                    },
                    "confirmation_message": (
                        f"✅ {provider.get('name')} kal 10:00 AM pe aayenge. "
                        f"Rs. {provider.get('price_per_hour', provider.get('base_rate', 2500)):,}. Ref: {booking_id}"
                    ),
                    "reminders": [],
                    "payment_method": payment_method,
                    "whatsapp_sent": False,
                }
        result["phase"] = "done"

    audio_base64 = None
    if result.get("response_text"):
        try:
            from services.uplift_tts import LANGUAGE_VOICE_MAP
            lang = body.language or 'roman_urdu'
            # Frontend sends voice_id; fall back to language map so server always uses correct voice
            tts_voice_id = body.voice_id or LANGUAGE_VOICE_MAP.get(lang, LANGUAGE_VOICE_MAP["roman_urdu"])
            # roman_urdu needs translation (Roman → Urdu script); all others are already in their script
            tts_translate = (lang == 'roman_urdu')
            tts_kwargs: dict = {"translate": tts_translate, "voice_id": tts_voice_id}
            tts = await text_to_speech(result["response_text"], **tts_kwargs)
            if tts.get("success"):
                audio_base64 = tts.get("audio_base64")
        except Exception as e:
            logger.warning("[conversation] TTS error: %s", e)

    result["audio_base64"] = audio_base64
    return result


@app.post("/api/conversation/negotiate")
async def conversation_negotiate(body: NegotiateRequest):
    """Run MOLTOL negotiation on providers found in a conversation session."""
    cached = _session_search_cache.get(body.session_id, {})
    # Prefer providers sent from frontend (avoids in-memory cache issues on Render)
    providers = body.providers or cached.get("providers") or _load_providers()[:5]
    service = cached.get("service", "service")
    urgency = cached.get("urgency", "medium")
    location = cached.get("location", "Islamabad")

    intent = {
        "service_type": service,
        "urgency": urgency,
        "emergency": False,
        "city": location,
        "job_complexity": "intermediate",
        "detected_language": "roman_urdu",
    }
    reference_provider = providers[0] if providers else {}
    pricing = await hisaab_agent.calculate_price(intent, reference_provider)

    moltol_result = await moltol_agent.negotiate(intent, providers, pricing)
    return {
        "session_id": body.session_id,
        "status": moltol_result["status"],
        "top_bids": moltol_result["top_bids"],
        "recommendation": moltol_result["recommendation"],
        "total_savings": moltol_result["total_negotiation_savings"],
    }


@app.post("/api/conversation/book")
async def conversation_direct_book(body: ConvDirectBookRequest):
    """Direct booking from conversation UI — calls Hisaab + Pakka, sends WhatsApp."""
    from services.whatsapp import send_booking_whatsapp
    uid = _require_firebase_uid(body.user_id)

    cached = _session_search_cache.get(body.session_id, {})

    # Resolve provider
    provider = await get_provider(body.provider_id)
    if not provider:
        cached_providers = cached.get("providers", [])
        all_json = _load_providers()
        provider = next(
            (p for p in cached_providers + all_json if p.get("id") == body.provider_id), None
        )
    if not provider:
        provider = (cached.get("providers") or _load_providers())[0]

    intent = {
        "service_type": cached.get("service", provider.get("service", "service")),
        "time_preference": "flexible",
        "urgency": cached.get("urgency", "medium"),
        "job_complexity": "intermediate",
        "emergency": False,
        "location": cached.get("location", ""),
        "city": provider.get("city", "Islamabad"),
    }

    if body.price_accepted and body.price_accepted > 0:
        pricing = {"total": body.price_accepted}
    else:
        pricing = await hisaab_agent.calculate_price(intent, provider)

    booking_res = await pakka_agent.create_booking(intent, provider, pricing, uid)
    booking_res.pop("_log", None)
    booking_id = booking_res["booking_id"]

    await append_user_booking(uid, booking_id)

    # WhatsApp notification
    user_doc = await get_user(uid)
    user_phone = (user_doc or {}).get("phone", "")
    whatsapp_sent = False
    if user_phone:
        whatsapp_sent = await send_booking_whatsapp(
            user_phone, booking_id,
            provider.get("name", "Provider"),
            intent["service_type"],
            pricing["total"],
            booking_res.get("scheduled_time", ""),
        )

    return {
        "booking_id": booking_id,
        "provider": provider,
        "receipt": booking_res["receipt"],
        "confirmation_message": booking_res["confirmation_message"],
        "reminders": booking_res.get("reminder_times", []),
        "payment_method": body.payment_method,
        "whatsapp_sent": whatsapp_sent,
    }


@app.get("/api/admin/verify-firestore")
async def verify_firestore():
    if os.getenv("ENVIRONMENT", "development") != "development":
        raise HTTPException(status_code=403, detail="Verify only allowed in development")
    return await verify_firestore_structure()


@app.get("/api/admin/verify-users")
async def verify_users():
    if os.getenv("ENVIRONMENT", "development") != "development":
        raise HTTPException(status_code=403, detail="Verify only allowed in development")
    return await verify_users_integrity()


@app.post("/api/admin/repair-profile-roots")
async def repair_profile_roots():
    if os.getenv("ENVIRONMENT", "development") != "development":
        raise HTTPException(status_code=403, detail="Repair only allowed in development")
    result = await repair_user_profile_roots()
    verify = await verify_users_integrity()
    return {**result, "verify": verify}


@app.post("/api/admin/cleanup-invalid-users")
async def cleanup_invalid_users():
    if os.getenv("ENVIRONMENT", "development") != "development":
        raise HTTPException(status_code=403, detail="Cleanup only allowed in development")
    result = await cleanup_invalid_user_documents()
    verify = await verify_users_integrity()
    return {**result, "verify": verify}


@app.get("/api/admin/verify-bookings")
async def verify_bookings():
    if os.getenv("ENVIRONMENT", "development") != "development":
        raise HTTPException(status_code=403, detail="Verify only allowed in development")
    return await verify_bookings_integrity()


@app.post("/api/admin/repair-booking-history")
async def repair_booking_history():
    if os.getenv("ENVIRONMENT", "development") != "development":
        raise HTTPException(status_code=403, detail="Repair only allowed in development")
    result = await repair_all_booking_history()
    verify = await verify_bookings_integrity()
    return {**result, "verify": verify}


@app.post("/api/admin/repair-dispute-history")
async def repair_dispute_history():
    """Backfill users/{uid}.dispute_history from disputes/* (development only)."""
    if os.getenv("ENVIRONMENT", "development") != "development":
        raise HTTPException(status_code=403, detail="Repair only allowed in development")
    result = await repair_all_dispute_history()
    verify = await verify_disputes_integrity()
    return {**result, "verify": verify}


@app.get("/api/admin/verify-providers")
async def verify_providers():
    if os.getenv("ENVIRONMENT", "development") != "development":
        raise HTTPException(status_code=403, detail="Verify only allowed in development")
    return await verify_providers_integrity()


@app.get("/api/admin/verify-disputes")
async def verify_disputes():
    if os.getenv("ENVIRONMENT", "development") != "development":
        raise HTTPException(status_code=403, detail="Verify only allowed in development")
    return await verify_disputes_integrity()


@app.get("/api/admin/verify-agent-logs")
async def verify_agent_logs():
    if os.getenv("ENVIRONMENT", "development") != "development":
        raise HTTPException(status_code=403, detail="Verify only allowed in development")
    return await verify_agent_logs_integrity()


@app.get("/api/admin/verify-notifications")
async def verify_notifications():
    if os.getenv("ENVIRONMENT", "development") != "development":
        raise HTTPException(status_code=403, detail="Verify only allowed in development")
    return await verify_notifications_integrity()


@app.post("/api/admin/process-notifications")
async def process_notifications():
    if os.getenv("ENVIRONMENT", "development") != "development":
        raise HTTPException(status_code=403, detail="Process only allowed in development")
    return await process_pending_notifications()


@app.post("/api/admin/cleanup-invalid-bookings")
async def cleanup_invalid_bookings():
    if os.getenv("ENVIRONMENT", "development") != "development":
        raise HTTPException(status_code=403, detail="Cleanup only allowed in development")
    result = await cleanup_bookings_with_invalid_user_id()
    repair = await repair_all_booking_history()
    verify = await verify_bookings_integrity()
    return {**result, "repair": repair, "verify": verify}


@app.post("/api/admin/migrate-reviews")
async def migrate_reviews():
    if os.getenv("ENVIRONMENT", "development") != "development":
        raise HTTPException(status_code=403, detail="Migrate only allowed in development")
    result = await migrate_reviews_to_bookings()
    verify = await verify_firestore_structure()
    return {**result, "verify": verify}


@app.get("/api/routes")
async def list_routes():
    routes = []
    for r in app.routes:
        if not hasattr(r, "methods") or not hasattr(r, "path"):
            continue
        if not r.path.startswith("/api") and r.path != "/health":
            continue
        routes.append({"methods": sorted(r.methods - {"HEAD"}), "path": r.path})
    return {
        "instance_id": APP_INSTANCE_ID,
        "routes": sorted(routes, key=lambda x: x["path"]),
        "count": len(routes),
    }


@app.post("/api/feedback")
async def submit_feedback(body: FeedbackRequest):
    _require_firebase_uid(body.user_id)
    if not 1 <= body.rating <= 5:
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 5")
    review_id = await save_review({
        "booking_id": body.booking_id,
        "user_id": body.user_id,
        "provider_id": body.provider_id,
        "rating": body.rating,
        "tags": body.tags,
        "review": body.review,
    })
    booking = await get_booking(body.booking_id)
    status = (booking.get("status") or "").lower() if booking else ""
    if booking and status != "completed":
        booking = await set_booking_status(body.booking_id, "completed")
    elif booking:
        await notify_feedback_received(booking, body.provider_id, body.rating)

    hifazat_result: dict = {}
    trust_applied: dict = {}
    try:
        from agents.hifazat import HifazatAgent
        from services.trust_service import apply_feedback_trust, build_feedback_payload

        booking = booking or await get_booking(body.booking_id) or {}
        payload = await build_feedback_payload(
            booking=booking,
            rating=body.rating,
            review=body.review,
            tags=body.tags or [],
        )
        hifazat_result = await HifazatAgent().process_feedback(payload)
        trust_applied = await apply_feedback_trust(
            hifazat_result,
            provider_id=body.provider_id,
            customer_id=body.user_id,
        )
    except Exception as exc:
        print(f"[HIFAZAT] feedback trust failed: {exc}")

    msg = f"Shukriya! Aapka feedback submit ho gaya. Rating: {body.rating}/5"
    if hifazat_result.get("provider_message"):
        msg = str(hifazat_result["provider_message"])

    return {
        "success": True,
        "review_id": review_id,
        "message": msg,
        "hifazat": {
            "severity": hifazat_result.get("severity"),
            "action_taken": hifazat_result.get("action_taken"),
            "trust_point_change": hifazat_result.get("trust_point_change"),
        },
        "trust_applied": trust_applied,
    }


# ── Sanity check ──────────────────────────────────────────────────────────────

def _assert_routes_registered() -> None:
    paths = {getattr(r, "path", None) for r in app.routes}
    required = {"/health", "/api/routes", "/docs", "/openapi.json"}
    missing = required - paths
    if missing:
        raise RuntimeError(
            f"Route registration incomplete on app {APP_INSTANCE_ID}: missing {sorted(missing)}"
        )


_assert_routes_registered()

@app.post("/api/adk/request")
async def adk_request(request: ServiceRequest):
    """
    ADK Pipeline Endpoint - Google ADK orchestration for HaazirAI
    Same as /api/request but uses Google ADK as orchestrator
    """
    
    # Auth checks (same as /api/request)
    user_id = _require_firebase_uid(request.user_id)
    await _require_complete_profile(user_id)
    
    try:
        # Run ADK pipeline
        result = await adk_runner.run_adk_pipeline(
            user_input=request.user_input,
            user_location=request.user_location,
            user_id=user_id,
            auto_book=True
        )
        
        return result
    
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "orchestrator": "google-adk"
        }

if __name__ == "__main__":
    print(
        "Use from repo root: python -m uvicorn backend.main:app --host 0.0.0.0 --port 8080",
        file=sys.stderr,
    )
    import uvicorn
    uvicorn.run(
        "backend.main:app",
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", "8080")),
        reload=False,
    )
