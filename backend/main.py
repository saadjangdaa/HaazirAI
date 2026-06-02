"""
Haazir AI — route registration entry for uvicorn.

Run from repo root ONLY:
  python -m uvicorn backend.main:app --host 0.0.0.0 --port 8080
"""
import asyncio
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

from fastapi import Depends, HTTPException
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
    JobRequestCreate,
    WorkerBidCreate,
    AcceptBidRequest,
    RebookRequest,
    RebookFromChatRequest,
    WaitlistRequest,
)
from models.investigation import ComplaintCreateBody, WorkerDefenseBody
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
    get_job_request,
    list_agent_log_entries,
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
from services.investigation_service import (
    create_complaint_record,
    maybe_open_investigation_for_provider,
    submit_worker_defense,
    verify_and_update_complaint,
)
from services.dispute_eligibility import NO_SHOW_GRACE_HOURS, assess_dispute_eligibility
from services.push_notify import (
    notify_booking_created,
    notify_feedback_received,
    process_pending_notifications,
)
from services.notification_cron import (
    cron_secret_configured,
    internal_cron_enabled,
    notification_cron_loop,
    require_cron_secret,
    run_notification_cron,
)

_cron_stop: Optional[asyncio.Event] = None
_cron_task: Optional[asyncio.Task] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _cron_stop, _cron_task
    from backend.services.admin_service import ensure_dev_admin_user

    try:
        await ensure_dev_admin_user()
    except Exception as exc:
        logger.warning("Admin user seed skipped: %s", exc)
    if internal_cron_enabled():
        _cron_stop = asyncio.Event()
        _cron_task = asyncio.create_task(notification_cron_loop(_cron_stop))
    yield
    if _cron_stop is not None:
        _cron_stop.set()
    if _cron_task is not None:
        try:
            await _cron_task
        except asyncio.CancelledError:
            pass
        _cron_task = None
        _cron_stop = None

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="Haazir Dost API",
    description="Pakistan's agentic home-services orchestrator",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

from backend.routers.admin_portal import router as admin_portal_router

app.include_router(admin_portal_router)

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


_KNOWN_CITIES = {"karachi", "lahore", "islamabad", "rawalpindi", "faisalabad", "peshawar", "quetta", "multan"}

_AREA_CITY_MAP: dict[str, str] = {
    "clifton": "Karachi", "defence": "Karachi", "dha khi": "Karachi",
    "gulshan": "Karachi", "gulshan-e-iqbal": "Karachi", "gulshan iqbal": "Karachi",
    "nazimabad": "Karachi", "korangi": "Karachi", "malir": "Karachi",
    "saddar": "Karachi", "north karachi": "Karachi", "surjani": "Karachi",
    "lyari": "Karachi", "orangi": "Karachi", "federal b": "Karachi",
    "gulberg": "Lahore", "johar town": "Lahore", "model town": "Lahore",
    "dha lahore": "Lahore", "bahria town": "Lahore", "cantt": "Lahore",
    "g-13": "Islamabad", "g-11": "Islamabad", "g-10": "Islamabad",
    "f-7": "Islamabad", "f-6": "Islamabad", "f-10": "Islamabad",
    "i-8": "Islamabad", "i-10": "Islamabad", "e-7": "Islamabad",
}


def _resolve_city(location: str, user_city: str = "") -> str:
    """Map a location string (area/neighbourhood/city) to a canonical city name."""
    loc_lower = (location or "").lower().strip()
    if not loc_lower:
        return user_city or "Islamabad"
    # Already a known city
    if loc_lower in _KNOWN_CITIES:
        return location.title()
    # Check area→city map
    for area, city in _AREA_CITY_MAP.items():
        if area in loc_lower:
            return city
    # "DHA" alone is ambiguous — use user_city
    if "dha" in loc_lower:
        return user_city or "Karachi"
    # Unknown area — fall back to user's registered city
    return user_city or "Islamabad"


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
        "admin_api": True,
        "hint": (
            "Replace backend/firebase-key.json with real Firebase service account (project haazir-ai) "
            "so admin portal sees the same worker data as the mobile app."
            if mode == "mock"
            else None
        ),
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
            "notification_reminder_cron": cron_secret_configured(),
            "notification_cron_internal_loop": internal_cron_enabled(),
        },
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
    for i, entry in enumerate(logs):
        ts = entry.get("timestamp", "")
        agent = entry.get("agent", "Samajh")
        # Calculate elapsed from consecutive timestamps
        time_seconds = 0.0
        if ts and i + 1 < len(logs):
            next_ts = logs[i + 1].get("timestamp", "")
            if next_ts:
                try:
                    t1 = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                    t2 = datetime.fromisoformat(next_ts.replace("Z", "+00:00"))
                    time_seconds = round(abs((t2 - t1).total_seconds()), 3)
                except Exception:
                    pass
        out.append(
            {
                "agent_name": agent.upper(),
                "agent_name_urdu": _AGENT_URDU.get(agent, agent),
                "start_time": ts,
                "end_time": logs[i + 1].get("timestamp", ts) if i + 1 < len(logs) else ts,
                "input_summary": entry.get("reasoning", ""),
                "output_summary": entry.get("decision", ""),
                "decision_made": entry.get("decision", ""),
                "confidence": float(entry.get("confidence", 0.0)),
                "fallback_used": entry.get("status") == "failure",
                "time_seconds": time_seconds,
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


async def _after_pakka_booking(
    booking_id: str,
    user_id: str,
    pakka_result: dict,
) -> dict:
    """
    EVENT 1: notify customer + worker at creation (assigned).
    Schedule reminders, then confirm (EVENT 2 confirmed push).
    """
    reminder_times = pakka_result.get("reminder_times") or []
    if reminder_times:
        await schedule_booking_reminders(
            booking_id,
            user_id,
            reminder_times,
            "Haazir AI reminder: booking {booking_id} is coming up soon.",
        )
    booking = await get_booking(booking_id)
    if booking:
        try:
            await notify_booking_created(booking)
        except Exception as e:
            logger.warning("[Push] notify_booking_created failed: %s", e)
    return await set_booking_status(booking_id, "confirmed")


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
    updated = await _after_pakka_booking(booking_id, uid, result)
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
    result = await finalize_dispute(user_id=uid, dispute_id=dispute_id)
    agent_logs = result.pop("_agent_logs", None) or []
    if agent_logs:
        req_id = f"DISP-{dispute_id[:16]}"
        await save_agent_logs(req_id, f"Dispute resolution: {dispute_id}", agent_logs, user_id=uid)
    return result


@app.post("/api/complaints")
async def file_complaint(body: ComplaintCreateBody):
    uid = _require_firebase_uid(body.user_id)
    if uid != body.user_id:
        body.user_id = uid
    return await create_complaint_record(
        booking_id=body.booking_id,
        user_id=uid,
        provider_id=body.provider_id,
        customer_statement=body.customer_statement,
        severity=body.severity,
        evidence_url=body.evidence_url,
    )


@app.patch("/api/complaints/{complaint_id}/verify")
async def verify_complaint_route(complaint_id: str, verified: bool = True):
    return await verify_and_update_complaint(complaint_id, verified)


@app.post("/api/investigations/{investigation_id}/defense")
async def submit_worker_defense_route(investigation_id: str, body: WorkerDefenseBody):
    worker_uid = _require_firebase_uid(body.worker_uid)
    return await submit_worker_defense(
        investigation_id=investigation_id,
        worker_uid=worker_uid,
        statement=body.statement,
    )


@app.post("/api/providers/{provider_id}/pakka/late-arrival")
async def pakka_late_arrival(provider_id: str, minutes_late: int):
    if minutes_late <= 20:
        return {"ok": True, "provider_id": provider_id, "minutes_late": minutes_late, "triggered": False}
    opened = await maybe_open_investigation_for_provider(provider_id, trigger="pakka_late_arrival")
    return {
        "ok": True,
        "provider_id": provider_id,
        "minutes_late": minutes_late,
        "triggered": bool(opened),
        "investigation": opened,
    }


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


@app.post("/api/booking/{booking_id}/rebook")
async def rebook_after_cancellation(booking_id: str, body: RebookRequest):
    """Cancel booking and always attempt PAKKA replacement (customer late-rebook or provider cancel)."""
    booking = await get_booking(booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail=f"Booking {booking_id} not found")

    reason = body.reason
    user_id = booking.get("user_id", "user_001")
    provider_id = (booking.get("provider_id") or "").strip()
    provider_uid = (booking.get("provider_uid") or "").strip()

    intent = {
        "service_type": booking.get("service", "Service"),
        "normalized_category": None,
        "location": booking.get("location", "").split(",")[0].strip()
        if "," in (booking.get("location") or "")
        else (booking.get("location") or ""),
        "city": booking.get("city", "Islamabad"),
        "time_preference": "now",
        "urgency": "high",
        "job_complexity": "intermediate",
        "emergency": False,
        "budget_sensitivity": "medium",
    }
    pricing = {"total": booking.get("price", 1000)}

    from agents.dhundho import DhundhoAgent
    from agents.chunno import ChunnoAgent
    from agents.pakka import PakkaAgent
    from services.booking_service import set_booking_status

    _dhundho = DhundhoAgent()
    _chunno = ChunnoAgent()
    _pakka = PakkaAgent()

    dhundho_result = await _dhundho.find_providers(intent)
    providers_raw = dhundho_result.get("providers", [])
    excluded = {provider_id, provider_uid} - {""}
    alternatives = [p for p in providers_raw if (p.get("id") or "") not in excluded]
    if not alternatives:
        alternatives = providers_raw

    if alternatives:
        chunno_result = await _chunno.rank_providers(alternatives, intent)
        alternatives = chunno_result.get("ranked_providers", alternatives)

    # Worker late / rebook — treat as provider-side issue for penalty + replacement
    cancelled_by = body.cancelled_by
    if cancelled_by == "customer" and "late" in (reason or "").lower():
        cancelled_by = "provider"

    try:
        await set_booking_status(booking_id, "cancelled")
    except Exception:
        pass

    replacement_booking = await _pakka._find_replacement(
        alternatives, intent, pricing, user_id
    )

    if replacement_booking:
        replacement_status = "replacement_found"
        pname = (replacement_booking.get("receipt") or {}).get("provider_name", "Provider")
        replacement_message = (
            f"Naya worker mil gaya: {pname}. "
            f"Reference: {replacement_booking.get('booking_id', '')}"
        )
    else:
        replacement_status = "no_replacement_found"
        replacement_message = (
            "Abhi koi provider available nahi. "
            "Aap waitlist mein hain — jaisay hi koi available ho ga hum notify karein ge."
        )

    replacement_provider = None
    if replacement_booking:
        replacement_provider = {
            "id": replacement_booking.get("provider_id"),
            "name": (replacement_booking.get("receipt") or {}).get("provider_name", "Provider"),
        }

    return {
        "ok": True,
        "cancellation_id": f"CAN-{datetime.now().strftime('%Y%m%d')}-{str(uuid.uuid4())[:6].upper()}",
        "replacement_status": replacement_status,
        "replacement_message": replacement_message,
        "replacement_booking": replacement_booking,
        "replacement_provider": replacement_provider,
        "customer_message": replacement_message,
        "penalty_applied": cancelled_by == "provider",
        "penalty_points": 10 if cancelled_by == "provider" else 0,
    }


@app.post("/api/booking/rebook-from-chat")
async def rebook_from_chat(body: RebookFromChatRequest):
    """Mobile chat bookings (Firestore-only) — seed backend doc then run agent rebook."""
    bid = (body.job_request_id or "").strip()
    if not bid:
        raise HTTPException(status_code=400, detail="job_request_id required")

    booking = await get_booking(bid)
    if not booking:
        from services.firebase import save_booking

        seed = {
            "booking_id": bid,
            "job_request_id": bid,
            "user_id": body.user_id,
            "provider_id": body.provider_id,
            "service": body.service,
            "location": body.location,
            "city": body.city,
            "price": int(body.price or 1000),
            "status": "confirmed",
        }
        await save_booking(seed)
        booking = seed

    return await rebook_after_cancellation(
        bid,
        RebookRequest(cancelled_by=body.cancelled_by, reason=body.reason),
    )


@app.post("/api/waitlist")
async def join_waitlist(body: WaitlistRequest):
    """Koi provider available nahi — customer ko waitlist mein daal do."""
    from services.firebase import save_booking
    waitlist_id = f"WL-{datetime.now().strftime('%Y%m%d')}-{str(uuid.uuid4())[:6].upper()}"
    entry = {
        "waitlist_id": waitlist_id,
        "booking_type": "waitlist",
        "user_id": body.user_id,
        "service": body.service,
        "location": body.location,
        "city": body.city,
        "requested_time": body.requested_time,
        "intent": body.intent or {},
        "added_at": datetime.now().isoformat(),
        "status": "waitlisted",
        "notify_on_slot": True,
        "message": (
            f"Abhi {body.service} ke liye koi provider {body.location} mein available nahi. "
            "Jaisay hi koi available ho ga, hum WhatsApp/SMS pe notify karein ge."
        ),
    }
    await save_booking({**entry, "booking_id": waitlist_id})
    return {
        "ok": True,
        "waitlist_id": waitlist_id,
        "message": entry["message"],
        "position": 1,
        "estimated_callback_minutes": 30,
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
    approval_status = None
    if body.role == "worker":
        from services.worker_registration import (
            ensure_worker_provider_application,
            get_worker_approval_status,
        )

        doc_after = await get_user(uid)
        if doc_after and is_profile_complete(doc_after):
            await ensure_worker_provider_application(uid)
        approval_status = await get_worker_approval_status(uid)
    doc = await get_user(uid)
    return {
        "success": True,
        "user_id": uid,
        "profile_complete": is_profile_complete(doc),
        "approval_status": approval_status,
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
    out = {**normalized, "profile_complete": is_profile_complete(normalized)}
    if normalized.get("role") == "worker":
        from services.worker_registration import get_worker_approval_status

        out["approval_status"] = await get_worker_approval_status(uid)
    return out


@app.get("/api/logs/recent")
async def get_recent_agent_logs(limit: int = 20):
    """Return the most recent N orchestration requests with their agent logs."""
    entries = await list_agent_log_entries()
    sorted_entries = sorted(
        entries,
        key=lambda x: x[1].get("timestamp", ""),
        reverse=True,
    )[:limit]
    requests = []
    for request_id, data in sorted_entries:
        requests.append({
            "request_id": request_id,
            "user_input": data.get("user_input", ""),
            "timestamp": data.get("timestamp", ""),
            "user_id": data.get("user_id", ""),
            "log_count": len(data.get("logs") or []),
            "logs": data.get("logs") or [],
        })
    return {
        "requests": requests,
        "count": len(requests),
        "source": "mock" if is_mock_mode() else "firestore",
    }


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

    try:
        result = await run_conversation(
            session_id=body.session_id,
            user_message=body.user_text,
            providers=body.providers,
            user_name=body.user_name,
            history=body.history,
            language=body.language or 'roman_urdu',
            user_city=body.user_city or '',
        )

        if result.get("search_trigger"):
            trigger = result["search_trigger"]
            service = _normalize_service(trigger.get("service", "service"))
            raw_location = trigger.get("location") or body.user_city or "Islamabad"
            # Map neighbourhood/area to canonical city (e.g. "Clifton" → "Karachi")
            city = _resolve_city(raw_location, body.user_city or "")
            location = city  # use resolved city for provider search
            urgency = trigger.get("urgency", "medium")

            orch: dict = {}
            try:
                orch = await asyncio.wait_for(
                    run_samajh_workflow(
                        user_input=f"Mujhe {service} chahiye, location: {city}, urgency: {urgency}",
                        source="text",
                        user_location=city,
                    ),
                    timeout=15.0,
                )
            except asyncio.TimeoutError:
                logger.warning("[conversation] run_samajh_workflow timed out — using fallback providers")
            except Exception as _se:
                logger.warning("[conversation] run_samajh_workflow failed: %s", _se)

            # Save agent logs from conversation orchestration
            if orch:
                conv_logs = orch.get("logs") or orch.get("agent_logs") or []
                if conv_logs:
                    conv_req_id = orch.get("request_id") or f"CONV-{body.session_id[:16]}"
                    conv_uid = (body.user_id or "").strip() or None
                    try:
                        mobile_logs = _judge_logs_to_mobile_agent_logs(conv_logs) if isinstance(conv_logs[0], dict) and "agent" in conv_logs[0] else conv_logs
                        await save_agent_logs(conv_req_id, body.user_text or "", mobile_logs, user_id=conv_uid)
                    except Exception as _le:
                        logger.warning("[conversation] log save failed: %s", _le)

            providers = list((orch.get("providers_ranked") or []))[:3]
            if not providers:
                fallback_intent = orch.get("intent") or {"service_type": service, "city": location}
                providers = _fallback_ranked_providers(fallback_intent, limit=3)

            search_intent = orch.get("intent") or {"service_type": service, "city": location}
            providers = _filter_providers_by_service(providers, search_intent)

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
                history=None,
                user_city=body.user_city or '',
            )
            result["response_text"] = follow_up["response_text"]
            result["providers"] = providers
            result["request_id"] = new_request_id()

            if follow_up.get("book_trigger"):
                logger.warning("[conversation] follow_up book_trigger ignored — search results just arrived, user hasn't picked a provider yet")
                result["phase"] = "confirming"
            else:
                result["phase"] = follow_up["phase"]

        # Safety: if both search and book triggered in the same response, ignore book.
        if result.get("search_trigger") and result.get("book_trigger"):
            logger.warning("[conversation] book_trigger ignored — appeared with search_trigger in same turn")
            result["book_trigger"] = None

        if result.get("book_trigger"):
            trigger = result["book_trigger"]
            provider_id = trigger.get("provider_id", "")
            payment_method = trigger.get("payment", "cash")
            uid = body.user_id or "anonymous"

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
                    await _after_pakka_booking(booking_id, uid, booking_res)

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
                    logger.error("[conversation] booking failed: %s", _be)
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
                tts_voice_id = body.voice_id or LANGUAGE_VOICE_MAP.get(lang, LANGUAGE_VOICE_MAP["roman_urdu"])
                tts_translate = (lang == 'roman_urdu')
                tts = await text_to_speech(result["response_text"], translate=tts_translate, voice_id=tts_voice_id)
                if tts.get("success"):
                    audio_base64 = tts.get("audio_base64")
            except Exception as e:
                logger.warning("[conversation] TTS error: %s", e)

        result["audio_base64"] = audio_base64
        return result

    except Exception as _conv_err:
        logger.error("[conversation] unhandled error: %s", _conv_err, exc_info=True)
        return {
            "session_id": body.session_id,
            "response_text": "Thoda masla hua — dobara bolein.",
            "phase": "intake",
            "audio_base64": None,
        }


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
    updated = await _after_pakka_booking(booking_id, uid, booking_res)

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
        "status": updated.get("status"),
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


@app.post(
    "/api/cron/process-notifications",
    dependencies=[Depends(require_cron_secret)],
)
@app.get(
    "/api/cron/process-notifications",
    dependencies=[Depends(require_cron_secret)],
)
async def cron_process_notifications():
    """Production: call every 5–15 min from Render Cron / external scheduler."""
    return await run_notification_cron()


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

# ── Real Marketplace Flow — Job Requests + Worker Bids ────────────────────────

@app.post("/api/job-requests")
async def create_job_request_endpoint(body: JobRequestCreate):
    """
    Real flow Step 1: Customer posts a job.
    - Saves job_request to Firestore
    - Runs SAMAJH + DHUNDHO to find matching providers
    - Sends push notifications to each matching worker
    Returns job_request_id + list of notified providers.
    """
    from services.job_request_service import create_job_request, notify_matching_workers, notify_all_workers_by_service

    uid = _require_firebase_uid(body.user_id)
    await _require_complete_profile(uid)

    user = await get_user(uid)
    customer_name = (user or {}).get("display_name") or (user or {}).get("username") or "Customer"

    # Use SAMAJH+DHUNDHO if no providers passed from frontend
    providers = body.providers or []
    estimated_price = body.estimated_price

    if not providers:
        try:
            orch = await run_samajh_workflow(
                user_input=f"{body.service} chahiye, {body.location}, {body.city}",
                source="text",
                user_location=body.location,
            )
            providers = list((orch.get("providers_ranked") or []))[:10]
            price_breakdown = orch.get("price_breakdown") or {}
            if not estimated_price and price_breakdown.get("total"):
                estimated_price = int(price_breakdown["total"])
        except Exception as _e:
            logger.warning("[job-request] orchestration failed: %s", _e)
            providers = _fallback_ranked_providers(
                {"service_type": body.service, "city": body.city}, limit=10
            )

    # Filter to matching service only
    providers = _filter_providers_by_service(
        providers, {"service_type": body.service}
    )

    job = await create_job_request(
        customer_id=uid,
        customer_name=customer_name,
        service=body.service,
        location=body.location,
        city=body.city,
        urgency=body.urgency,
        description=body.description,
        estimated_price=estimated_price or body.estimated_price,
    )

    # Notify via providers list (if available) AND scan all workers by service+city
    notified_providers = await notify_matching_workers(job, providers)
    notified_workers = await notify_all_workers_by_service(job)
    notified = list(set(notified_providers + [str(w) for w in notified_workers]))

    return {
        "job_request_id": job["request_id"],
        "status": job["status"],
        "service": job["service"],
        "location": job["location"],
        "city": job["city"],
        "estimated_price": job["estimated_price"],
        "expires_at": job["expires_at"],
        "notified_count": len(notified),
        "providers_found": len(providers),
        "message": f"{len(notified)} workers ko notify kar diya gaya — bids aa rahi hain...",
    }


@app.get("/api/job-requests/{job_request_id}")
async def get_job_request_endpoint(job_request_id: str):
    """Get job request details + current bids."""
    from services.firebase import get_job_request, list_bids_for_job
    job = await get_job_request(job_request_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job request not found")
    bids = await list_bids_for_job(job_request_id)
    return {**job, "bids": bids, "bid_count": len(bids)}


@app.get("/api/job-requests/{job_request_id}/bids")
async def get_job_bids(job_request_id: str):
    """Real-time bid list for customer polling (every 5 sec)."""
    from services.firebase import list_bids_for_job
    from agents.moltol import MoltolAgent as _Moltol
    bids = await list_bids_for_job(job_request_id)
    ranked = _Moltol().rank_real_bids(bids)
    return {"job_request_id": job_request_id, "bids": ranked, "count": len(ranked)}


@app.post("/api/job-requests/{job_request_id}/bid")
async def submit_worker_bid(job_request_id: str, body: WorkerBidCreate):
    """
    Real flow Step 2: Worker submits a bid on an open job.
    Worker must be linked to a provider_id in their user profile.
    """
    from services.job_request_service import submit_bid

    uid = _require_firebase_uid(body.worker_id)

    try:
        bid = await submit_bid(
            job_request_id=job_request_id,
            worker_id=uid,
            provider_id=body.provider_id,
            provider_name=body.provider_name,
            price=body.price,
            eta_minutes=body.eta_minutes,
            message=body.message,
            rating=body.rating,
        )
        return {"success": True, "bid": bid, "message": "Aapki bid submit ho gayi!"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/job-requests/{job_request_id}/accept-bid/{bid_id}")
async def accept_worker_bid(job_request_id: str, bid_id: str, body: AcceptBidRequest):
    """
    Real flow Step 3: Customer accepts a bid → HISAAB + PAKKA create booking.
    """
    from services.job_request_service import accept_bid
    from services.whatsapp import send_booking_whatsapp

    uid = _require_firebase_uid(body.customer_id)

    try:
        accepted = await accept_bid(
            job_request_id=job_request_id,
            bid_id=bid_id,
            customer_id=uid,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Resolve provider for PAKKA
    provider_id = accepted.get("provider_id", "")
    provider = await get_provider(provider_id)
    if not provider:
        all_json = _load_providers()
        provider = next((p for p in all_json if p.get("id") == provider_id), None)
    if not provider:
        provider = {"id": provider_id, "name": accepted.get("provider_name", "Provider"),
                    "service": "service", "city": "Islamabad", "price_per_hour": accepted.get("price", 2000)}

    job = await get_job_request(job_request_id) or {}
    intent = {
        "service_type": job.get("service", provider.get("service", "service")),
        "time_preference": "flexible",
        "urgency": job.get("urgency", "medium"),
        "job_complexity": "intermediate",
        "emergency": False,
        "location": job.get("location", ""),
        "city": job.get("city", provider.get("city", "Islamabad")),
    }
    pricing = {"total": accepted.get("price", 0)}

    booking_res = await pakka_agent.create_booking(intent, provider, pricing, uid)
    booking_res.pop("_log", None)
    booking_id = booking_res["booking_id"]

    await append_user_booking(uid, booking_id)

    # WhatsApp
    user_doc = await get_user(uid)
    user_phone = (user_doc or {}).get("phone", "")
    whatsapp_sent = False
    if user_phone:
        whatsapp_sent = await send_booking_whatsapp(
            user_phone, booking_id,
            accepted.get("provider_name", "Provider"),
            intent["service_type"],
            pricing["total"],
            booking_res.get("scheduled_time", ""),
        )

    return {
        "booking_id": booking_id,
        "bid": accepted,
        "provider": provider,
        "receipt": booking_res["receipt"],
        "confirmation_message": booking_res["confirmation_message"],
        "payment_method": body.payment_method,
        "whatsapp_sent": whatsapp_sent,
    }


@app.get("/api/job-requests/worker/{user_id}")
async def get_worker_available_jobs(user_id: str, service: str = "", city: str = ""):
    """
    Worker sees open job requests matching their service/city where they haven't bid yet.
    service and city query params are optional — if omitted, uses worker's profile.
    """
    from services.job_request_service import get_available_jobs_for_worker

    uid = _require_firebase_uid(user_id)

    # Auto-fill service/city from worker profile if not provided
    if not service or not city:
        user = await get_user(uid)
        if user:
            if not service:
                skills = user.get("skills") or []
                if skills:
                    service = skills[0]
            if not city:
                city = user.get("city") or ""

    jobs = await get_available_jobs_for_worker(uid, service=service, city=city)
    return {"jobs": jobs, "count": len(jobs), "worker_id": uid}


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
