#!/usr/bin/env python3
"""CLI: verify Firestore matches the canonical Haazir schema (Step 1)."""
import asyncio
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
BACKEND = REPO / "backend"
sys.path.insert(0, str(REPO))
sys.path.insert(0, str(BACKEND))

from dotenv import load_dotenv

load_dotenv(BACKEND / ".env")

from services.firebase import verify_firestore_structure  # noqa: E402


async def main() -> int:
    report = await verify_firestore_structure()
    print(json.dumps(report, indent=2))
    return 0 if report.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
