"""Haazir AI — FastAPI backend entry point."""
from __future__ import annotations

import json
import sys
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# Load config + logging first (single dotenv via config.py)
from config import config
from logging_config import logger

from agents.orchestrator import run_bidding, run_dispute, run_provider_report
from agents.pakka import PakkaAgent
from graph import new_request_id, run_samajh_workflow
from models.request import (
    ServiceRequest,
    BidRequest,
    BookingRequest,
    DisputeRequest,
    FeedbackRequest,
)
from services.firebase import (
    FirebaseService,
    get_booking,
    save_review,
    set_firebase_service,
    update_booking_status,
)

firebase: Optional[FirebaseService] = None

_PROVIDERS_PATH = Path(__file__).parent / "data" / "providers.json"
_request_store: dict = {}
_providers_cache: list = []
pakka_agent = PakkaAgent()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: validate config, init Firebase singleton for agents + routes."""
    global firebase
    if not config.validate():
        logger.error("Configuration validation failed — exiting")
        sys.exit(1)

    cred_path = str(config.resolved_credentials_path())
    firebase = FirebaseService(cred_path)
    set_firebase_service(firebase)
    app.state.firebase = firebase

    logger.info("Haazir backend started — environment=%s firebase_mock=%s", config.ENVIRONMENT, firebase.is_mock)
    yield
    logger.info("Haazir backend shutdown")


app = FastAPI(
    title="Haazir Dost API",
    description="Pakistan's agentic home-services orchestrator",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _load_providers() -> list:
    global _providers_cache
    if not _providers_cache:
        with open(_PROVIDERS_PATH, encoding="utf-8") as f:
            _providers_cache = json.load(f)
    return _providers_cache


@app.get("/health")
async def health():
    """Liveness + quick Firebase mode indicator for ops / mobile."""
    fb = getattr(app.state, "firebase", None) or firebase
    mode = "mock" if fb is None or fb.is_mock else "connected"
    return {
        "status": "ok",
        "timestamp": datetime.now().isoformat(),
        "service": "Haazir AI",
        "firebase": mode,
        "environment": config.ENVIRONMENT,
    }


@app.get("/test/firebase")
async def test_firebase():
    """Smoke-test Firestore (or mock store): list providers count."""
    fb = getattr(app.state, "firebase", None) or firebase
    if fb is None:
        raise HTTPException(status_code=503, detail="Firebase not initialized")
    try:
        providers = fb.get_all_providers()
        logger.info("test_firebase: providers_count=%s mock=%s", len(providers), fb.is_mock)
        return {
            "status": "success",
            "firebase": "mock" if fb.is_mock else "connected",
            "providers_count": len(providers),
        }
    except Exception as e:
        logger.error("test_firebase failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e)) from e


def _judge_logs_to_mobile_agent_logs(logs: list) -> list:
    """Map judge-facing reasoning entries to the legacy shape used by the Expo AgentLogViewer."""
    out = []
    for entry in logs:
        ts = entry.get("timestamp", "")
        out.append(
            {
                "agent_name": entry.get("agent", "Samajh"),
                "agent_name_urdu": "سمجھ",
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
    """
    Samajh (Gemini) + Dhundho (provider discovery) via LangGraph.

    Send ``user_location`` from mobile when possible (maps + city fallback for Sheryar's agent).
    """
    request_id = new_request_id()
    final_state = await run_samajh_workflow(
        user_input=body.user_input.strip(),
        source="text",
        user_location=(body.user_location or "").strip(),
    )
    intent = final_state.get("intent") or {}
    logs = final_state.get("logs") or []
    providers_ranked = final_state.get("providers") or []
    dh_meta = final_state.get("dhundho_meta") or {}

    _request_store[request_id] = {
        "logs": logs,
        "intent": intent,
        "user_id": body.user_id,
        "providers": providers_ranked,
    }

    agent_logs = _judge_logs_to_mobile_agent_logs(logs)

    return {
        "request_id": request_id,
        "extracted_intent": intent,
        "logs": logs,
        "agent_logs": agent_logs,
        "clarification_needed": bool(intent.get("clarification_needed")),
        "clarification_question": intent.get("clarification_question"),
        "emergency": bool(intent.get("emergency")),
        "providers_ranked": providers_ranked,
        "fallback": dh_meta.get("fallback_message"),
        "dhundho_meta": dh_meta,
    }


@app.post("/api/bid")
async def trigger_bidding(body: BidRequest):
    """Trigger MOLTOL negotiation agent for a prior request."""
    cached = _request_store.get(body.request_id)
    if not cached:
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
    all_providers = _load_providers()
    provider = next((p for p in all_providers if p["id"] == body.provider_id), None)
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
    result = await pakka_agent.create_booking(intent, provider, pricing, body.user_id)
    log = result.pop("_log", None)
    return {
        "booking_id": result["booking_id"],
        "receipt": result["receipt"],
        "confirmation_message": result["confirmation_message"],
        "reminders": result["reminder_times"],
        "agent_log": log,
    }


@app.post("/api/dispute")
async def handle_dispute(body: DisputeRequest):
    """JHAGRA agent resolves a dispute."""
    result = await run_dispute(
        booking_id=body.booking_id,
        dispute_type=body.dispute_type,
        description=body.description,
        evidence_url=body.evidence_url,
    )
    return result


@app.get("/api/booking/{booking_id}")
async def get_booking_status(booking_id: str):
    """Fetch booking status + tracking info."""
    booking = await get_booking(booking_id)
    if not booking:
        return {
            "booking_id": booking_id,
            "status": "confirmed",
            "message": "Booking data retrieved (mock)",
            "tracking_steps": [
                {"step": "Booked", "done": True, "time": datetime.now().isoformat()},
                {"step": "Confirmed", "done": True, "time": datetime.now().isoformat()},
                {"step": "En Route", "done": False},
                {"step": "Arrived", "done": False},
                {"step": "In Progress", "done": False},
                {"step": "Completed", "done": False},
            ],
        }
    return {
        "booking_id": booking_id,
        "status": booking.get("status", "confirmed"),
        "provider_id": booking.get("provider_id"),
        "service": booking.get("service"),
        "scheduled_time": booking.get("scheduled_time"),
        "tracking_steps": [
            {"step": "Booked", "done": True},
            {"step": "Confirmed", "done": True},
            {"step": "En Route", "done": booking.get("status") in ["en_route", "arrived", "in_progress", "completed"]},
            {"step": "Arrived", "done": booking.get("status") in ["arrived", "in_progress", "completed"]},
            {"step": "In Progress", "done": booking.get("status") in ["in_progress", "completed"]},
            {"step": "Completed", "done": booking.get("status") == "completed"},
        ],
    }


@app.get("/api/logs/{request_id}")
async def get_agent_logs(request_id: str):
    """Return cached agent trace logs for a request."""
    cached = _request_store.get(request_id)
    if not cached:
        return {"request_id": request_id, "logs": [], "message": "Logs not found — run /api/request first"}
    return {"request_id": request_id, "logs": cached.get("logs", [])}


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
    """List all providers with optional filters."""
    providers = _load_providers()
    if city:
        providers = [p for p in providers if p["city"].lower() == city.lower()]
    if service:
        providers = [p for p in providers if service.lower() in p["service"].lower()]
    return {"providers": providers, "count": len(providers)}


@app.post("/api/feedback")
async def submit_feedback(body: FeedbackRequest):
    """Submit post-service rating + review."""
    if not 1 <= body.rating <= 5:
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 5")
    review_id = await save_review(
        {
            "booking_id": body.booking_id,
            "user_id": body.user_id,
            "provider_id": body.provider_id,
            "rating": body.rating,
            "tags": body.tags,
            "review": body.review,
        }
    )
    await update_booking_status(body.booking_id, "completed")
    return {
        "success": True,
        "review_id": review_id,
        "message": f"Shukriya! Aapka feedback submit ho gaya. Rating: {body.rating}/5",
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=config.HOST,
        port=config.PORT,
        reload=config.DEBUG,
        log_level=config.LOG_LEVEL.lower(),
    )
