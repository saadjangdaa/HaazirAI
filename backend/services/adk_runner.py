"""
ADK Runner Service - Executes HaazirControlRoom ADK pipeline
"""
import logging
import os
import uuid
from typing import Dict, Any

logger = logging.getLogger(__name__)

# Tell google-adk to use Gemini Developer API (API key) instead of Vertex AI (gRPC + service account).
# This MUST be set before importing google.adk so that the Runner doesn't open a gRPC
# connection to Vertex AI at startup — which would fail on non-GCP hosts like Render.
os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "false")

# Mirror GEMINI_API_KEY → GOOGLE_API_KEY if not already set, because google-adk
# reads GOOGLE_API_KEY when GOOGLE_GENAI_USE_VERTEXAI=false.
if not os.environ.get("GOOGLE_API_KEY"):
    _gemini_key = os.environ.get("GOOGLE_GEMINI_API_KEY") or os.environ.get("GEMINI_API_KEY")
    if _gemini_key:
        os.environ["GOOGLE_API_KEY"] = _gemini_key


class _NullADKRunner:
    """Fallback used when ADK fails to initialize (missing credentials, import error, etc.)."""

    async def run_adk_pipeline(self, **_kwargs) -> Dict[str, Any]:
        return {
            "status": "error",
            "error": "ADK runner unavailable — check GOOGLE_API_KEY / GOOGLE_GENAI_USE_VERTEXAI env vars",
            "orchestrator": "google-adk",
        }


class HaazirADKRunner:
    """Runner for HaazirAI ADK Control Room"""

    def __init__(self):
        from google.adk.sessions import InMemorySessionService
        from google.adk.runners import Runner
        from agents.adk_control_room import HaazirControlRoom

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
        Main entry point for ADK pipeline.
        Returns response matching /api/request shape.
        """
        from orchestration.storage import TraceStorage

        session_id = f"session-{uuid.uuid4().hex[:8]}"

        state_delta = {
            "user_input": user_input,
            "user_location": user_location,
            "user_id": user_id,
            "auto_book": auto_book
        }

        adk_events = []

        async for event in self.runner.run_async(
            user_id=user_id,
            session_id=session_id,
            state_delta=state_delta
        ):
            adk_events.append({
                "author": event.author,
                "content": event.content,
                "timestamp": str(event.timestamp) if hasattr(event, "timestamp") else None
            })

        session_state = await self.session_service.get_session(session_id)
        final_response = session_state.state.get("final_response", {})

        final_response["adk_events"] = adk_events
        final_response["orchestrator"] = "google-adk"

        return final_response


def _build_adk_runner():
    try:
        runner = HaazirADKRunner()
        logger.info("ADK runner initialized successfully")
        return runner
    except Exception as exc:
        logger.warning(
            "ADK runner init failed (%s) — /api/adk-request will return error responses. "
            "Set GOOGLE_GENAI_USE_VERTEXAI=false and GOOGLE_API_KEY on Render to enable.",
            exc,
        )
        return _NullADKRunner()


# Singleton — safe to import; failures are caught and return a null runner instead of
# crashing the entire FastAPI app at startup.
adk_runner = _build_adk_runner()
