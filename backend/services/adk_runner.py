"""
ADK Runner Service - Executes HaazirControlRoom ADK pipeline
"""

from google.adk.sessions import InMemorySessionService
from google.adk.runners import Runner
from agents.adk_control_room import HaazirControlRoom
from orchestration.storage import TraceStorage
import uuid
from typing import Dict, Any

class HaazirADKRunner:
    """Runner for HaazirAI ADK Control Room"""
    
    def __init__(self):
        self.session_service = InMemorySessionService()
        self.control_room = HaazirControlRoom()
        self.runner = Runner(
            agent=self.control_room,
            session_service=self.session_service,
            app_name="HaazirAI"
        )
    
    async def run_adk_pipeline(
        self,
        user_input: str,
        user_location: str,
        user_id: str,
        auto_book: bool = True
    ) -> Dict[str, Any]:
        """
        Main entry point for ADK pipeline
        Returns response matching /api/request shape
        """
        
        session_id = f"session-{uuid.uuid4().hex[:8]}"
        
        state_delta = {
            "user_input": user_input,
            "user_location": user_location,
            "user_id": user_id,
            "auto_book": auto_book
        }
        
        # Collect ADK events
        adk_events = []
        
        # Run the pipeline and collect events
        async for event in self.runner.run_async(
            user_id=user_id,
            session_id=session_id,
            state_delta=state_delta
        ):
            adk_events.append({
                "author": event.author,
                "content": event.content,
                "timestamp": str(event.timestamp) if hasattr(event, 'timestamp') else None
            })
        
        # Get final response from session state
        session_state = await self.session_service.get_session(session_id)
        final_response = session_state.state.get("final_response", {})
        
        # Add ADK events to response
        final_response["adk_events"] = adk_events
        final_response["orchestrator"] = "google-adk"
        
        return final_response


# Singleton instance
adk_runner = HaazirADKRunner()
