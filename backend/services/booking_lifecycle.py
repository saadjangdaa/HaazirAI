"""Booking status state machine + tracking steps for Haazir AI."""
from typing import Dict, List, Optional, Tuple

# Canonical lifecycle
BOOKING_STATUSES = (
    "pending",
    "assigned",
    "confirmed",
    "on_the_way",
    "arrived",
    "in_progress",
    "completed",
    "cancelled",
    "disputed",
    "refunded",
)

ALLOWED_TRANSITIONS: Dict[str, List[str]] = {
    "pending": ["assigned", "cancelled"],
    "assigned": ["confirmed", "cancelled", "disputed"],
    "confirmed": ["on_the_way", "cancelled", "disputed"],
    "on_the_way": ["arrived", "cancelled", "disputed"],
    "arrived": ["in_progress", "cancelled", "disputed"],
    "in_progress": ["completed", "cancelled", "disputed"],
    "completed": ["disputed", "refunded"],
    "cancelled": [],
    "disputed": ["refunded"],
    "refunded": [],
}

TRACKING_STEPS = [
    ("pending", "Request received"),
    ("assigned", "Provider assigned"),
    ("confirmed", "Booking confirmed"),
    ("on_the_way", "On the way"),
    ("arrived", "Arrived"),
    ("in_progress", "Service in progress"),
    ("completed", "Completed"),
]

STATUS_ORDER = [s for s, _ in TRACKING_STEPS]


def can_transition(current: str, new_status: str) -> bool:
    current = (current or "pending").lower()
    new_status = new_status.lower()
    if current == new_status:
        return True
    return new_status in ALLOWED_TRANSITIONS.get(current, [])


def build_tracking_steps(status: str) -> List[dict]:
    status = (status or "pending").lower()
    try:
        idx = STATUS_ORDER.index(status)
    except ValueError:
        idx = 0
    if status in ("cancelled", "disputed", "refunded"):
        return [
            {"step": label, "done": i <= idx, "key": key}
            for i, (key, label) in enumerate(TRACKING_STEPS)
        ] + [{"step": status.replace("_", " ").title(), "done": True, "key": status}]
    return [
        {"step": label, "done": i <= idx, "key": key}
        for i, (key, label) in enumerate(TRACKING_STEPS)
    ]


# (new_status) -> (customer event key, title, body template)
CUSTOMER_NOTIFY: Dict[str, Tuple[str, str, str]] = {
    "pending": ("booking_created", "Booking received", "Your service request was received."),
    "assigned": ("provider_assigned", "Provider assigned", "A provider has been assigned to your booking."),
    "confirmed": ("booking_confirmed", "Booking confirmed", "Your booking is confirmed."),
    "on_the_way": ("on_the_way", "On the way", "Your provider is on the way."),
    "arrived": ("arrived", "Provider arrived", "Your provider has arrived."),
    "in_progress": ("service_started", "Service started", "Your service is now in progress."),
    "completed": ("completed", "Service completed", "Your booking is complete. Please leave feedback."),
    "cancelled": ("cancellation", "Booking cancelled", "Your booking was cancelled."),
    "disputed": ("dispute_created", "Dispute opened", "A dispute was opened on your booking."),
    "refunded": ("payment_success", "Refund processed", "Your refund has been processed."),
}

WORKER_NOTIFY: Dict[str, Tuple[str, str, str]] = {
    "pending": ("new_request", "New request", "A new service request is available."),
    "assigned": ("booking_assigned", "Job assigned", "You have been assigned a new booking."),
    "confirmed": ("booking_confirmed", "Booking confirmed", "Customer confirmed the booking."),
    "on_the_way": ("en_route", "Heading to customer", "You are on the way to the job."),
    "arrived": ("arrived", "Arrived", "You marked arrived at the job location."),
    "in_progress": ("service_started", "Service started", "Service is in progress."),
    "completed": ("payment_update", "Job completed", "Booking completed — payment will follow."),
    "cancelled": ("cancellation", "Booking cancelled", "A booking was cancelled."),
    "disputed": ("dispute_opened", "Dispute opened", "A dispute was opened on a booking."),
    "refunded": ("refund_processed", "Refund processed", "A refund was processed on a booking."),
}
