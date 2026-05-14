from pydantic import BaseModel
from typing import Optional, List


class ServiceRequest(BaseModel):
    user_input: str
    user_location: str
    user_id: str


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
