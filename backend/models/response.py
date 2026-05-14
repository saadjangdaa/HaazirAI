from pydantic import BaseModel
from typing import Optional, List, Any, Dict


class AgentLog(BaseModel):
    agent_name: str
    agent_name_urdu: str
    start_time: str
    end_time: str
    input_summary: str
    output_summary: str
    decision_made: str
    confidence: float
    fallback_used: bool
    time_seconds: float


class Intent(BaseModel):
    service_type: str
    location: str
    city: str
    time_preference: str
    urgency: str
    budget_sensitivity: str
    job_complexity: str
    emergency: bool
    confidence_score: float
    clarification_needed: bool
    clarification_question: Optional[str] = None
    detected_language: str
    special_requirements: Optional[str] = None


class Provider(BaseModel):
    id: str
    name: str
    service: str
    specialization: List[str]
    complexity_level: str
    city: str
    area: str
    rating: float
    review_count: int
    recent_reviews_positive: float
    on_time_percentage: float
    cancellation_rate: float
    available: bool
    available_slots: List[str]
    price_per_hour: int
    experience_years: int
    verified: bool
    trust_score: float
    jobs_completed: int
    phone: str
    lat: float
    lng: float
    languages: List[str]
    tools_available: List[str]
    pending_earnings: int
    workload_today: int
    ranking_score: Optional[float] = None
    ranking_reason_urdu: Optional[str] = None
    ranking_reason_english: Optional[str] = None
    distance_km: Optional[float] = None
    warnings: Optional[List[str]] = []


class PriceBreakdown(BaseModel):
    base_price: int
    distance_cost: int
    urgency_adjustment: int
    complexity_fee: int
    surge_pricing: int
    loyalty_discount: int
    total: int
    budget_alternative: Optional[Dict[str, Any]] = None
    fairness_note: str


class Booking(BaseModel):
    booking_id: str
    provider_id: str
    user_id: str
    service: str
    scheduled_time: str
    status: str
    confirmation_message: str
    receipt: Dict[str, Any]
    reminder_times: List[str]
    calendar_entry: Dict[str, Any]


class TrustAssessment(BaseModel):
    provider_id: str
    trust_score: float
    risk_flags: List[str]
    recommended_action: str
    warnings: List[str]


class FullOrchestrationResponse(BaseModel):
    request_id: str
    extracted_intent: Intent
    providers_ranked: List[Provider]
    best_provider: Provider
    price_breakdown: PriceBreakdown
    booking: Booking
    trust_scores: List[TrustAssessment]
    agent_logs: List[AgentLog]
    clarification_needed: Optional[bool] = False
    clarification_question: Optional[str] = None


class Bid(BaseModel):
    provider_id: str
    provider_name: str
    bid_price: int
    eta_minutes: int
    message: str
    rating: float
    negotiated: bool
    final_price: int


class BiddingResponse(BaseModel):
    request_id: str
    bids: List[Bid]
    recommended_bid: Bid
    negotiation_log: List[str]


class BookingResponse(BaseModel):
    booking_id: str
    receipt: Dict[str, Any]
    confirmation_message: str
    reminders: List[str]


class DisputeResolution(BaseModel):
    booking_id: str
    dispute_type: str
    resolution: str
    refund_amount: int
    provider_penalty: str
    case_summary: str
    escalated_to_human: bool


class DailyReport(BaseModel):
    provider_id: str
    provider_name: str
    date: str
    jobs_completed: int
    total_earnings: int
    average_rating: float
    pending_payments: int
    upcoming_bookings: List[Dict[str, Any]]
    voice_summary_urdu: str
    predictive_suggestions: List[str]
