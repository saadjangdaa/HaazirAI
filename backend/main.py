"""Haazir AI — FastAPI backend entry point."""
import json
import os
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from models.request import ServiceRequest, BidRequest, BookingRequest, DisputeRequest, FeedbackRequest
from agents.orchestrator import run_full_orchestration, run_bidding, run_dispute, run_provider_report
from agents.pakka import PakkaAgent
from services.firebase import save_review, get_booking, update_booking_status

app = FastAPI(
    title="Haazir AI API",
    description="Pakistan's Agentic Home Services Orchestrator",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_PROVIDERS_PATH = Path(__file__).parent / "data" / "providers.json"

# In-memory store for quick lookups during demo
_request_store: dict = {}
_providers_cache: list = []

pakka_agent = PakkaAgent()


def _load_providers() -> list:
    global _providers_cache
    if not _providers_cache:
        with open(_PROVIDERS_PATH, encoding="utf-8") as f:
            _providers_cache = json.load(f)
    return _providers_cache


@app.get("/health")
async def health():
    return {"status": "ok", "timestamp": datetime.now().isoformat(), "service": "Haazir AI"}


@app.post("/api/request")
async def handle_service_request(body: ServiceRequest):
    """Full Antigravity orchestration: Samajh → Dhundho → Chunno → Hifazat → Hisaab → Pakka."""
    result = await run_full_orchestration(
        user_input=body.user_input,
        user_location=body.user_location,
        user_id=body.user_id,
    )
    request_id = result.get("request_id", f"REQ-{uuid.uuid4().hex[:8].upper()}")

    # Cache providers for subsequent /api/bid calls
    if "providers_ranked" in result:
        _request_store[request_id] = {
            "providers": result["providers_ranked"],
            "intent": result.get("extracted_intent", {}),
            "user_id": body.user_id,
        }

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
        # Return a mock for demo
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
    review_id = await save_review({
        "booking_id": body.booking_id,
        "user_id": body.user_id,
        "provider_id": body.provider_id,
        "rating": body.rating,
        "tags": body.tags,
        "review": body.review,
    })
    await update_booking_status(body.booking_id, "completed")
    return {
        "success": True,
        "review_id": review_id,
        "message": f"Shukriya! Aapka feedback submit ho gaya. Rating: {body.rating}/5",
    }
