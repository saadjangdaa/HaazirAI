from pydantic import BaseModel
from typing import Optional, List


class ServiceRequest(BaseModel):
    """Primary field ``user_input``; location/id optional for LangGraph-only Samajh flow."""

    user_input: str
    user_location: str = ""
    user_id: str = "anonymous"


class BidRequest(BaseModel):
    request_id: str
    user_id: str


class BookingRequest(BaseModel):
    provider_id: str
    user_id: str
    service: str
    time: str
    price_accepted: int


class DisputeRequest(BaseModel):
    booking_id: str
    dispute_type: str
    description: str
    evidence_url: Optional[str] = None


class FeedbackRequest(BaseModel):
    booking_id: str
    user_id: str
    provider_id: str
    rating: int
    tags: List[str] = []
    review: Optional[str] = None


class VoiceRequest(BaseModel):
    audio_base64: str
    mime_type: str = "audio/m4a"


class TTSRequest(BaseModel):
    text: str
    voice_id: str = "v_8eelc901"
    translate: bool = True


class ConversationRequest(BaseModel):
    session_id: str
    user_text: str
    user_id: str = "user_001"
    user_name: Optional[str] = None
    providers: Optional[List[dict]] = None
