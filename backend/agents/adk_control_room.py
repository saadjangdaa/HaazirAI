"""
Google ADK Control Room - Orchestration wrapper for HaazirAI agents
Integrates google-adk with existing LangGraph + 9 agents
"""

from google.adk.agents import BaseAgent, InvocationContext
from google.adk.events import Event
from typing import AsyncGenerator, Any
import asyncio
import uuid
from datetime import datetime
from agents.samajh import SamajhAgent
from agents.hifazat import HifazatAgent
from agents.hisaab import HisaabAgent
from agents.pakka import PakkaAgent
from graph import run_samajh_workflow
from orchestration.tracer import Tracer
from orchestration.storage import TraceStorage

class HaazirControlRoom(BaseAgent):
    """
    Main ADK Control Room agent for HaazirAI
    Orchestrates: LangGraph (Phase 1) → HIFAZAT (Phase 2) → HISAAB (Phase 3) → PAKKA (Phase 4)
    Yields ADK Events for each phase showing progress
    """
    
    def __init__(self):
        super().__init__(
            name="HaazirControlRoom",
            description="Google ADK orchestration layer for HaazirAI home services"
        )
    
    async def _run_async_impl(
        self, ctx: InvocationContext
    ) -> AsyncGenerator[Event, Any]:
        """
        Main async generator - yields ADK Events for each phase
        """
        
        try:
            # Extract inputs from session state
            user_input = ctx.session.state.get("user_input")
            user_location = ctx.session.state.get("user_location")
            user_id = ctx.session.state.get("user_id")
            
            # Create request ID and tracer for logging
            request_id = f"ADK-{uuid.uuid4().hex[:8].upper()}"
            tracer = Tracer(request_id, user_id)
            
            # Yield initial event
            yield Event(
                author=self.name,
                content={
                    "phase": "INITIALIZATION",
                    "status": "starting",
                    "request_id": request_id,
                    "timestamp": datetime.now().isoformat()
                }
            )
            
            # ═══════════════════════════════════════════════════════════
            # PHASE 1: SAMAJH + DHUNDHO + CHUNNO (via LangGraph)
            # ═══════════════════════════════════════════════════════════
            
            yield Event(
                author=self.name,
                content={
                    "phase": "PHASE_1_LANGGRAPH",
                    "status": "running",
                    "message": "Running LangGraph workflow (SAMAJH → DHUNDHO → CHUNNO)"
                }
            )
            
            # Run LangGraph workflow (unchanged)
            langgraph_result = await run_samajh_workflow(
                user_input=user_input,
                user_location=user_location,
                user_id=user_id
            )
            
            # Store phase 1 results in session
            ctx.session.state["intent"] = langgraph_result.get("intent")
            ctx.session.state["providers_ranked"] = langgraph_result.get("providers_ranked", [])
            ctx.session.state["best_provider"] = langgraph_result.get("best_provider")
            ctx.session.state["phase1_logs"] = langgraph_result.get("logs", [])
            
            yield Event(
                author=self.name,
                content={
                    "phase": "PHASE_1_LANGGRAPH",
                    "status": "completed",
                    "summary": f"LangGraph complete: {langgraph_result.get('intent', {}).get('service_type')} in {langgraph_result.get('intent', {}).get('location')}",
                    "providers_found": len(langgraph_result.get("providers_ranked", []))
                }
            )
            
            # ═══════════════════════════════════════════════════════════
            # PHASE 2: HIFAZAT (Trust & Fraud Detection)
            # ═══════════════════════════════════════════════════════════
            
            best_provider = ctx.session.state.get("best_provider")
            intent = ctx.session.state.get("intent")
            
            if best_provider:
                yield Event(
                    author=self.name,
                    content={
                        "phase": "PHASE_2_HIFAZAT",
                        "status": "running",
                        "message": f"Assessing trust for provider: {best_provider.get('name')}"
                    }
                )
                
                # Run HIFAZAT agent
                hifazat = HifazatAgent()
                trust_result = await hifazat.assess_trust(best_provider, intent)
                
                ctx.session.state["trust_score"] = trust_result.get("trust_score")
                ctx.session.state["trust_safe"] = trust_result.get("safe_to_proceed")
                ctx.session.state["risk_flags"] = trust_result.get("risk_flags", [])
                
                yield Event(
                    author=self.name,
                    content={
                        "phase": "PHASE_2_HIFAZAT",
                        "status": "completed",
                        "summary": f"Trust assessment complete: Score {trust_result.get('trust_score')}/100",
                        "safe_to_proceed": trust_result.get("safe_to_proceed"),
                        "risk_flags": trust_result.get("risk_flags", [])
                    }
                )
            
            # ═══════════════════════════════════════════════════════════
            # PHASE 3: HISAAB (Dynamic Pricing)
            # ═══════════════════════════════════════════════════════════
            
            if best_provider and intent:
                yield Event(
                    author=self.name,
                    content={
                        "phase": "PHASE_3_HISAAB",
                        "status": "running",
                        "message": "Calculating dynamic pricing"
                    }
                )
                
                # Run HISAAB agent
                hisaab = HisaabAgent()
                price_result = await hisaab.calculate_price(intent, best_provider)
                
                ctx.session.state["price"] = price_result
                ctx.session.state["total_price"] = price_result.get("total")
                
                yield Event(
                    author=self.name,
                    content={
                        "phase": "PHASE_3_HISAAB",
                        "status": "completed",
                        "summary": f"Price calculated: Rs {price_result.get('total')}",
                        "breakdown": {
                            "base": price_result.get("base_price"),
                            "distance": price_result.get("distance_cost"),
                            "urgency": price_result.get("urgency_adjustment"),
                            "complexity": price_result.get("complexity_fee")
                        }
                    }
                )
            
            # ═══════════════════════════════════════════════════════════
            # PHASE 4: PAKKA (Booking)
            # ═══════════════════════════════════════════════════════════
            
            auto_book = ctx.session.state.get("auto_book", False)
            
            if best_provider and intent and (auto_book or True):  # Always book for demo
                yield Event(
                    author=self.name,
                    content={
                        "phase": "PHASE_4_PAKKA",
                        "status": "running",
                        "message": "Creating booking"
                    }
                )
                
                # Run PAKKA agent
                pakka = PakkaAgent()
                booking_result = await pakka.create_booking(
                    intent=intent,
                    provider=best_provider,
                    price=ctx.session.state.get("price"),
                    user_id=user_id
                )
                
                ctx.session.state["booking"] = booking_result
                ctx.session.state["booking_id"] = booking_result.get("booking_id")
                
                yield Event(
                    author=self.name,
                    content={
                        "phase": "PHASE_4_PAKKA",
                        "status": "completed",
                        "summary": f"Booking created: {booking_result.get('booking_id')}",
                        "confirmation": booking_result.get("confirmation_message")
                    }
                )
            
            # ═══════════════════════════════════════════════════════════
            # FINAL: Build response matching /api/request shape
            # ═══════════════════════════════════════════════════════════
            
            final_response = {
                "status": "success",
                "request_id": request_id,
                "orchestrator": "google-adk",
                "extracted_intent": ctx.session.state.get("intent"),
                "providers_ranked": ctx.session.state.get("providers_ranked", []),
                "best_provider": ctx.session.state.get("best_provider"),
                "price_breakdown": ctx.session.state.get("price"),
                "booking": ctx.session.state.get("booking"),
                "trust_score": ctx.session.state.get("trust_score"),
                "agent_logs": ctx.session.state.get("phase1_logs", []),
                "adk_phases_completed": [
                    "PHASE_1_LANGGRAPH",
                    "PHASE_2_HIFAZAT",
                    "PHASE_3_HISAAB",
                    "PHASE_4_PAKKA"
                ]
            }
            
            yield Event(
                author=self.name,
                content={
                    "phase": "COMPLETION",
                    "status": "success",
                    "summary": "All phases completed successfully",
                    "final_response": final_response
                }
            )
            
            # Save to Firestore
            await TraceStorage.save_trace(request_id, {
                "request_id": request_id,
                "user_id": user_id,
                "orchestrator": "google-adk",
                "phases": 4,
                "final_response": final_response
            })
            
            # Store final response in session for retrieval
            ctx.session.state["final_response"] = final_response
        
        except Exception as e:
            yield Event(
                author=self.name,
                content={
                    "phase": "ERROR",
                    "status": "failed",
                    "error": str(e)
                }
            )
