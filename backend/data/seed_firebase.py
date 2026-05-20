"""
Seed Firestore with demo providers for Haazir Dost.

Run from repo root:
    python backend/data/seed_firebase.py

Or from ``backend/``:
    python data/seed_firebase.py
"""

from __future__ import annotations

import json
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

_PROVIDERS_JSON = Path(__file__).resolve().parents[0] / "providers.json"


def _load_providers_json() -> list:
    with open(_PROVIDERS_JSON, encoding="utf-8") as f:
        return json.load(f)


def seed_providers(firebase: FirebaseService) -> None:
    """Upsert ALL provider documents from providers.json into Firestore."""
    import json as _json  # local import to avoid shadowing at module level
    providers = _load_providers_json()
    ok = 0
    for row in providers:
        pid = row.get("id")
        if not pid:
            continue
        data = {k: v for k, v in row.items() if k != "id"}
        if firebase.create_provider(pid, data):
            logger.info("Seeded provider %s (%s — %s)", pid, row.get("name"), row.get("city"))
            ok += 1
        else:
            logger.error("Failed to seed provider %s", pid)
    logger.info("Seeded %d / %d providers", ok, len(providers))


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
