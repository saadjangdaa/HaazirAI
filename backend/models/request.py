from typing import List, Optional

from pydantic import BaseModel, field_validator


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
    user_id: str
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


class UserSyncRequest(BaseModel):
    user_id: str
    email: str
    role: str = "customer"  # customer | worker only (validated in /api/users/sync)
    username: Optional[str] = None
    phone: Optional[str] = None
    cnic: Optional[str] = None
    city: Optional[str] = None
    push_token: Optional[str] = None
    provider_id: Optional[str] = None
    worker_data: Optional[dict] = None
    skills: Optional[List[str]] = None
    areas: Optional[List[str]] = None
    availability: Optional[bool] = None
    rating: Optional[float] = None
    price_per_service: Optional[int] = None
    experience_years: Optional[int] = None
    # Legacy field — mapped to username when username omitted
    name: Optional[str] = None

    @field_validator("username", mode="before")
    @classmethod
    def validate_username_field(cls, v):
        if v is None or (isinstance(v, str) and not v.strip()):
            return None
        from services.user_validation import normalize_username

        return normalize_username(str(v))

    @field_validator("phone", mode="before")
    @classmethod
    def validate_phone_field(cls, v):
        if v is None or (isinstance(v, str) and not v.strip()):
            return None
        from services.user_validation import normalize_pk_phone

        return normalize_pk_phone(str(v))

    @field_validator("cnic", mode="before")
    @classmethod
    def validate_cnic_field(cls, v):
        if v is None or (isinstance(v, str) and not v.strip()):
            return None
        from services.user_validation import normalize_cnic

        return normalize_cnic(str(v))


class NegotiateRequest(BaseModel):
    session_id: str
    user_id: str = "user_001"
    providers: Optional[List[dict]] = None  # frontend passes current providers directly


class ConvDirectBookRequest(BaseModel):
    session_id: str
    user_id: str
    provider_id: str
    price_accepted: int = 0
    payment_method: str = "cash"


class BookingStatusUpdate(BaseModel):
    status: str

    @field_validator("status", mode="before")
    @classmethod
    def normalize_status_field(cls, v):
        from services.firestore_schema import normalize_booking_status

        return normalize_booking_status(str(v))
