"""
Haazir AI — route registration entry for uvicorn.

Run from repo root ONLY:
  python -m uvicorn backend.main:app --host 0.0.0.0 --port 8080
"""
import json
import os
import sys
import uuid
from datetime import datetime
from pathlib import Path

_BACKEND_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _BACKEND_DIR.parent

for _path in (_REPO_ROOT, _BACKEND_DIR):
    if str(_path) not in sys.path:
        sys.path.insert(0, str(_path))

from fastapi import HTTPException

from backend.app import APP_INSTANCE_ID, app

from models.request import (
    ServiceRequest,
    BidRequest,
    BookingRequest,
    DisputeRequest,
    FeedbackRequest,
    VoiceRequest,
    TTSRequest,
    ConversationRequest,
    UserSyncRequest,
    BookingStatusUpdate,
)
from agents.orchestrator import run_full_orchestration, run_bidding, run_provider_report
from agents.pakka import PakkaAgent
from services.firestore_schema import FORBIDDEN_USER_IDS
from services.firebase import (
    save_review,
    get_booking,
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
    cleanup_bookings_with_invalid_user_id,
    verify_providers_integrity,
    get_provider,
)
from services.users_integrity import normalize_role
from services.worker_service import get_worker_bookings, resolve_worker_provider_id, summarize_worker_earnings
from services.booking_service import set_booking_status, _enrich_booking
from services.dispute_service import file_dispute
from services.push_notify import (
    notify_booking_created,
    notify_feedback_received,
    process_pending_notifications,
)
from services.user_validation import (
    is_profile_complete,
    mirror_profile_root_fields,
    normalize_username,
    profile_completion_issues,
    sanitize_worker_data,
)

_PROVIDERS_PATH = _BACKEND_DIR / "data" / "providers.json"

# In-memory store for quick lookups during demo
_request_store: dict = {}
_providers_cache: list = []

pakka_agent = PakkaAgent()


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


@app.post("/api/voice/transcribe")
async def transcribe_voice(body: VoiceRequest):
    """Transcribe audio using Gemini 2.0 Flash. Supports Urdu, Roman Urdu, English, Sindhi."""
    from services.voice import transcribe_audio
    result = await transcribe_audio(body.audio_base64, body.mime_type)
    return result


@app.post("/api/voice/tts")
async def voice_tts(body: TTSRequest):
    """Convert text to Urdu speech using Uplift AI. Auto-translates Roman Urdu/English to Urdu script."""
    from services.uplift_tts import text_to_speech
    result = await text_to_speech(body.text, body.voice_id, body.translate)
    return result


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "timestamp": datetime.now().isoformat(),
        "service": "Haazir AI",
        "instance_id": APP_INSTANCE_ID,
        "features": {
            "dispute_repeat_allowed": True,
            "agent_logs_on_request": True,
            "fcm_pipeline": True,
            "notification_dedupe_seconds": 90,
        },
    }


@app.post("/api/request")
async def handle_service_request(body: ServiceRequest):
    """Full Antigravity orchestration: Samajh → Dhundho → Chunno → Hifazat → Hisaab → Pakka."""
    uid = _require_firebase_uid(body.user_id)
    await _require_complete_profile(uid)
    result = await run_full_orchestration(
        user_input=body.user_input,
        user_location=body.user_location,
        user_id=uid,
    )
    request_id = (result.get("request_id") or "").strip()
    if not request_id:
        raise HTTPException(status_code=500, detail="Orchestration did not return request_id")
    logs = result.get("agent_logs") or []

    await save_agent_logs(request_id, body.user_input, logs, user_id=uid)

    # Cache providers for subsequent /api/bid calls
    _request_store[request_id] = {
        "providers": result.get("providers_ranked", []),
        "intent": result.get("extracted_intent", {}),
        "user_id": uid,
        "user_input": body.user_input,
        "logs": logs,
    }

    booking = result.get("booking") or {}
    booking_id = booking.get("booking_id")
    if booking_id and uid:
        await append_user_booking(uid, booking_id)
        reminder_times = booking.get("reminder_times") or []
        if reminder_times:
            await schedule_booking_reminders(
                booking_id,
                uid,
                reminder_times,
                "Haazir AI reminder: booking {booking_id} is coming up soon.",
            )
        stored = await get_booking(booking_id)
        if stored:
            await notify_booking_created(stored)

    return result


@app.post("/api/bid")
async def trigger_bidding(body: BidRequest):
    """Trigger MOLTOL negotiation agent for a prior request."""
    cached = _request_store.get(body.request_id)
    if not cached:
        # Fallback: use all providers
        providers = _load_providers()[:5]
        intent = {"service_type": "service", "job_complexity": "intermediate", "urgency": "medium"}
    else:
        providers = cached["providers"]
        intent = cached["intent"]

    result = await run_bidding(body.request_id, providers, intent)
    return result


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
            booking_id,
            uid,
            result["reminder_times"],
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
    """JHAGRA agent resolves a dispute; new disputes/{id} every submit (repeats allowed)."""
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


@app.get("/api/booking/{booking_id}")
async def get_booking_status(booking_id: str):
    """Fetch booking status + lifecycle tracking steps."""
    booking = await get_booking(booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail=f"Booking {booking_id} not found")
    enriched = await _enrich_booking(booking)
    return enriched


@app.get("/api/bookings/user/{user_id}")
async def list_user_bookings(user_id: str):
    """All bookings for Firebase Auth UID."""
    uid = _require_firebase_uid(user_id)
    rows = await list_bookings(user_id=uid)
    rows.sort(key=lambda b: b.get("created_at", ""), reverse=True)
    out = []
    for b in rows:
        out.append(await _enrich_booking(b))
    return {"bookings": out, "count": len(out)}


@app.get("/api/bookings/provider/{provider_id}")
async def list_provider_bookings(provider_id: str, status: str = None):
    """All bookings assigned to a provider (worker dashboard)."""
    rows = await list_bookings(provider_id=provider_id, status=status)
    rows.sort(key=lambda b: b.get("created_at", ""), reverse=True)
    out = []
    for b in rows:
        out.append(await _enrich_booking(b))
    return {"bookings": out, "count": len(out)}


@app.get("/api/bookings/worker/{user_id}")
async def list_worker_bookings(user_id: str, status: str = None):
    """Worker dashboard: bookings for users/{uid} linked provider_id."""
    uid = _require_firebase_uid(user_id)
    return await get_worker_bookings(uid, status=status)


@app.get("/api/workers/{user_id}/earnings")
async def worker_earnings(user_id: str):
    """Earnings summary from completed bookings for worker's provider."""
    uid = _require_firebase_uid(user_id)
    data = await get_worker_bookings(uid)
    summary = summarize_worker_earnings(data.get("bookings") or [])
    return {**summary, "provider_id": data.get("provider_id"), "user_id": uid}


@app.patch("/api/booking/{booking_id}/status")
async def patch_booking_status(booking_id: str, body: BookingStatusUpdate):
    """Update booking lifecycle state (triggers push on real change)."""
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
    # Persist fix if legacy doc had identity only in worker_data
    if normalized.get("phone") and not (doc.get("phone") or "").strip():
        await sync_user_profile(uid, normalized)
    return {**normalized, "profile_complete": is_profile_complete(normalized)}


@app.get("/api/logs/{request_id}")
async def get_agent_logs(request_id: str):
    """Return agent trace logs from Firestore or in-memory cache."""
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


@app.get("/api/provider/report/{provider_id}")
async def get_provider_report(provider_id: str):
    """REPORT agent generates daily income report for a provider."""
    all_providers = _load_providers()
    provider = next((p for p in all_providers if p["id"] == provider_id), None)
    if not provider:
        raise HTTPException(status_code=404, detail=f"Provider {provider_id} not found")
    result = await run_provider_report(provider_id, provider)
    return result


@app.get("/api/providers")
async def list_providers(city: str = None, service: str = None):
    """List providers from Firestore, falling back to local JSON."""
    from services.providers_integrity import format_provider_record

    providers = await firestore_list_providers(city=city, service=service)
    if not providers:
        providers = [
            format_provider_record(p, p.get("id"))
            for p in _load_providers()
        ]
        if city:
            providers = [p for p in providers if p["city"].lower() == city.lower()]
        if service:
            providers = [
                p
                for p in providers
                if service.lower() in (p.get("service") or "").lower()
                or any(
                    service.lower() in s.lower()
                    for s in (p.get("specialization") or [])
                )
            ]
    return {"providers": providers, "count": len(providers)}


@app.post("/api/admin/seed-providers")
async def seed_providers():
    """Seed Firestore providers collection from backend/data/providers.json."""
    if os.getenv("ENVIRONMENT", "development") != "development":
        raise HTTPException(status_code=403, detail="Seed only allowed in development")
    count = await seed_providers_from_json(str(_PROVIDERS_PATH))
    return {
        "seeded": count,
        "mock_mode": is_mock_mode(),
        "message": "Providers written to Firestore (or mock DB)",
    }


@app.post("/api/conversation")
async def conversation(body: ConversationRequest):
    """BAAT-CHEET: Multi-turn voice conversation with state machine.

    Flow: intake → [SEARCH] auto-triggers orchestration → results injected →
    agent presents providers → [BOOK] triggers booking.
    """
    from agents.conversation import run_conversation
    from services.uplift_tts import text_to_speech

    result = await run_conversation(
        session_id=body.session_id,
        user_message=body.user_text,
        providers=body.providers,
        user_name=body.user_name,
    )

    # Auto-trigger orchestration when agent outputs [SEARCH: ...]
    if result.get("search_trigger"):
        trigger = result["search_trigger"]
        service = trigger.get("service", "service")
        location = trigger.get("location", "Islamabad")
        urgency = trigger.get("urgency", "medium")

        orch_result = await run_full_orchestration(
            user_input=f"Mujhe {service} chahiye, location: {location}, urgency: {urgency}",
            user_location=location,
            user_id=body.user_id,
        )
        providers = orch_result.get("providers_ranked", [])[:3]
        if not providers:
            providers = _load_providers()[:3]

        # Feed results back — agent will now present options to user
        follow_up = await run_conversation(
            session_id=body.session_id,
            user_message="[system: search complete]",
            providers=providers,
            user_name=body.user_name,
        )
        result["response_text"] = follow_up["response_text"]
        result["phase"] = follow_up["phase"]
        result["providers"] = providers
        result["request_id"] = orch_result.get("request_id")

    # Auto-confirm booking when agent outputs [BOOK: ...]
    if result.get("book_trigger"):
        trigger = result["book_trigger"]
        provider_id = trigger.get("provider_id", "")
        payment_method = trigger.get("payment", "cash")

        all_providers = _load_providers()
        provider = next((p for p in all_providers if p["id"] == provider_id), None)
        if not provider:
            provider = all_providers[0]

        booking_id = f"HAZ-{uuid.uuid4().hex[:8].upper()}"
        result["booking_result"] = {
            "booking_id": booking_id,
            "provider": provider,
            "receipt": {
                "service": provider.get("service", "Service"),
                "location": f"{provider.get('area', '')}, {provider.get('city', 'Islamabad')}",
                "scheduled_time": "2026-05-17 10:00",
                "estimated_price": f"Rs. {provider.get('base_rate', 2500):,}",
                "payment_methods": [payment_method.title()],
            },
            "confirmation_message": (
                f"{provider.get('name')} 17 May 2026, 10:00 AM pe {provider.get('city', 'Islamabad')} aayenge. "
                f"Total estimate: Rs. {provider.get('base_rate', 2500):,}. Reference: {booking_id}"
            ),
            "reminders": [],
            "payment_method": payment_method,
        }
        result["phase"] = "done"

    # Generate Uplift TTS audio for agent response
    audio_base64 = None
    if result.get("response_text"):
        try:
            tts = await text_to_speech(result["response_text"], translate=True)
            if tts.get("success"):
                audio_base64 = tts["audio_base64"]
        except Exception as e:
            print(f"[conversation] TTS error: {e}")

    result["audio_base64"] = audio_base64
    return result


@app.get("/api/admin/verify-firestore")
async def verify_firestore():
    """Step 1: audit active collections, UID rules, and document counts."""
    if os.getenv("ENVIRONMENT", "development") != "development":
        raise HTTPException(status_code=403, detail="Verify only allowed in development")
    return await verify_firestore_structure()


@app.get("/api/admin/verify-users")
async def verify_users():
    """Step 2: audit users/{uid} integrity (roles, UID mapping, no workers collection)."""
    if os.getenv("ENVIRONMENT", "development") != "development":
        raise HTTPException(status_code=403, detail="Verify only allowed in development")
    return await verify_users_integrity()


@app.post("/api/admin/repair-profile-roots")
async def repair_profile_roots():
    """Mirror identity fields from worker_data to users/{uid} root for all users."""
    if os.getenv("ENVIRONMENT", "development") != "development":
        raise HTTPException(status_code=403, detail="Repair only allowed in development")
    result = await repair_user_profile_roots()
    verify = await verify_users_integrity()
    return {**result, "verify": verify}


@app.post("/api/admin/cleanup-invalid-users")
async def cleanup_invalid_users():
    """Remove legacy users/{fake_id} documents (e.g. user_aapka_email_com)."""
    if os.getenv("ENVIRONMENT", "development") != "development":
        raise HTTPException(status_code=403, detail="Cleanup only allowed in development")
    result = await cleanup_invalid_user_documents()
    verify = await verify_users_integrity()
    return {**result, "verify": verify}


@app.get("/api/admin/verify-bookings")
async def verify_bookings():
    """Step 3: audit bookings lifecycle, UIDs, and user booking_history linkage."""
    if os.getenv("ENVIRONMENT", "development") != "development":
        raise HTTPException(status_code=403, detail="Verify only allowed in development")
    return await verify_bookings_integrity()


@app.post("/api/admin/repair-booking-history")
async def repair_booking_history():
    """Sync users/{uid}.booking_history from all valid bookings."""
    if os.getenv("ENVIRONMENT", "development") != "development":
        raise HTTPException(status_code=403, detail="Repair only allowed in development")
    result = await repair_all_booking_history()
    verify = await verify_bookings_integrity()
    return {**result, "verify": verify}


@app.get("/api/admin/verify-providers")
async def verify_providers():
    """Step 4: audit providers collection, ids, canonical fields, booking refs."""
    if os.getenv("ENVIRONMENT", "development") != "development":
        raise HTTPException(status_code=403, detail="Verify only allowed in development")
    return await verify_providers_integrity()


@app.get("/api/admin/verify-disputes")
async def verify_disputes():
    """Step 6: audit disputes collection, booking linkage, resolution fields."""
    if os.getenv("ENVIRONMENT", "development") != "development":
        raise HTTPException(status_code=403, detail="Verify only allowed in development")
    return await verify_disputes_integrity()


@app.get("/api/admin/verify-agent-logs")
async def verify_agent_logs():
    """Step 7: audit agent_logs/{request_id} — user_input, timestamp, logs array."""
    if os.getenv("ENVIRONMENT", "development") != "development":
        raise HTTPException(status_code=403, detail="Verify only allowed in development")
    return await verify_agent_logs_integrity()


@app.get("/api/admin/verify-notifications")
async def verify_notifications():
    """Step 8: audit notifications/{notif_id} and push_token coverage."""
    if os.getenv("ENVIRONMENT", "development") != "development":
        raise HTTPException(status_code=403, detail="Verify only allowed in development")
    return await verify_notifications_integrity()


@app.post("/api/admin/process-notifications")
async def process_notifications():
    """Send due scheduled notifications (reminders)."""
    if os.getenv("ENVIRONMENT", "development") != "development":
        raise HTTPException(status_code=403, detail="Process only allowed in development")
    return await process_pending_notifications()


@app.post("/api/admin/cleanup-invalid-bookings")
async def cleanup_invalid_bookings():
    """Delete bookings with fake user_id values (legacy demo data)."""
    if os.getenv("ENVIRONMENT", "development") != "development":
        raise HTTPException(status_code=403, detail="Cleanup only allowed in development")
    result = await cleanup_bookings_with_invalid_user_id()
    repair = await repair_all_booking_history()
    verify = await verify_bookings_integrity()
    return {**result, "repair": repair, "verify": verify}


@app.post("/api/admin/migrate-reviews")
async def migrate_reviews():
    """Move legacy reviews/* into bookings/* and delete the reviews collection."""
    if os.getenv("ENVIRONMENT", "development") != "development":
        raise HTTPException(status_code=403, detail="Migrate only allowed in development")
    result = await migrate_reviews_to_bookings()
    verify = await verify_firestore_structure()
    return {**result, "verify": verify}


@app.get("/api/routes")
async def list_routes():
    """Dev helper: list mounted API routes (same app instance as /health and /docs)."""
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
    """Submit post-service rating + review."""
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
        await set_booking_status(body.booking_id, "completed")
    elif booking:
        await notify_feedback_received(booking, body.provider_id, body.rating)
    return {
        "success": True,
        "review_id": review_id,
        "message": f"Shukriya! Aapka feedback submit ho gaya. Rating: {body.rating}/5",
    }


def _assert_routes_registered() -> None:
    paths = {getattr(r, "path", None) for r in app.routes}
    required = {"/health", "/api/routes", "/docs", "/openapi.json"}
    missing = required - paths
    if missing:
        raise RuntimeError(
            f"Route registration incomplete on app {APP_INSTANCE_ID}: missing {sorted(missing)}"
        )


_assert_routes_registered()

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
