"""
Seed Firestore with demo providers for Haazir Dost.

Run from repo root:
    python backend/data/seed_firebase.py

Or from ``backend/``:
    python data/seed_firebase.py
"""

from __future__ import annotations

import logging
import sys
from pathlib import Path

# Ensure ``backend/`` is on sys.path
_BACKEND = Path(__file__).resolve().parents[1]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from config import config  # noqa: E402
from services.firebase import FirebaseService  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger(__name__)

PROVIDERS = [
    {
        "id": "p001",
        "name": "Ali AC Services",
        "service": "AC repair",
        "city": "Islamabad",
        "area": "G-13",
        "phone": "+923001111111",
        "rating": 4.8,
        "on_time_percentage": 95,
        "hourly_rate": 800,
        "distance_km": 2.1,
        "cancellation_rate": 0.05,
        "available": True,
        "current_bookings": 2,
        "total_jobs_completed": 1247,
        "verified": True,
    },
    {
        "id": "p002",
        "name": "Hassan AC",
        "service": "AC repair",
        "city": "Islamabad",
        "area": "G-14",
        "phone": "+923002222222",
        "rating": 4.5,
        "on_time_percentage": 88,
        "hourly_rate": 700,
        "distance_km": 3.2,
        "cancellation_rate": 0.08,
        "available": True,
        "current_bookings": 1,
        "total_jobs_completed": 856,
        "verified": True,
    },
    {
        "id": "p003",
        "name": "Fatima Electrical",
        "service": "Electrical repair",
        "city": "Islamabad",
        "area": "F-11",
        "phone": "+923003333333",
        "rating": 4.7,
        "on_time_percentage": 92,
        "hourly_rate": 750,
        "distance_km": 4.5,
        "cancellation_rate": 0.03,
        "available": True,
        "current_bookings": 0,
        "total_jobs_completed": 542,
        "verified": True,
    },
]


def seed_providers(firebase: FirebaseService) -> None:
    """Upsert provider documents via ``FirebaseService`` (works in mock + prod)."""
    for row in PROVIDERS:
        pid = row["id"]
        data = {k: v for k, v in row.items() if k != "id"}
        if firebase.create_provider(pid, data):
            logger.info("Seeded provider %s", pid)
        else:
            logger.error("Failed to seed provider %s", pid)


def main() -> None:
    cred = config.resolved_credentials_path()
    if not cred.is_file():
        logger.error("Credentials not found: %s — cannot seed real Firestore.", cred)
        sys.exit(1)

    firebase = FirebaseService(str(cred))
    if firebase.is_mock:
        logger.warning("Firestore is MOCK (no credentials file) — seeding in-memory only for this process.")

    logger.info("Starting Firebase seed — project=%s", config.FIREBASE_PROJECT_ID)
    seed_providers(firebase)
    logger.info("Seeding complete.")


if __name__ == "__main__":
    main()
