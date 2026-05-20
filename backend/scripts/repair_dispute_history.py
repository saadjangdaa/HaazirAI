#!/usr/bin/env python3
"""CLI: backfill users/{uid}.dispute_history from disputes/*."""
import asyncio
import json
import sys
from pathlib import Path

_REPO = Path(__file__).resolve().parents[2]
_BACKEND = _REPO / "backend"
sys.path.insert(0, str(_REPO))
sys.path.insert(0, str(_BACKEND))

from dotenv import load_dotenv

load_dotenv(_BACKEND / ".env")

from config import config  # noqa: E402
from services.firebase import (  # noqa: E402
    FirebaseService,
    repair_all_dispute_history,
    set_firebase_service,
    verify_disputes_integrity,
)


async def main() -> int:
    svc = FirebaseService(str(config.resolved_credentials_path()))
    set_firebase_service(svc)
    if svc.is_mock:
        print("ERROR: Firestore mock mode — set FIREBASE_PROJECT_ID and credentials in backend/.env")
        return 1
    result = await repair_all_dispute_history()
    verify = await verify_disputes_integrity()
    print(json.dumps({**result, "verify": verify}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
