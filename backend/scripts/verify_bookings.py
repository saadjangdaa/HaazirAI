#!/usr/bin/env python3
"""CLI: Step 3 — verify bookings lifecycle and user history linkage."""
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

from services.firebase import verify_bookings_integrity  # noqa: E402


async def main() -> int:
    report = await verify_bookings_integrity()
    print(json.dumps(report, indent=2))
    return 0 if report.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
