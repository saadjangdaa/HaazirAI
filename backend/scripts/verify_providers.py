#!/usr/bin/env python3
"""CLI: Step 4 — verify providers data and seed completeness."""
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

from services.firebase import seed_providers_from_json, verify_providers_integrity  # noqa: E402


async def main() -> int:
    report = await verify_providers_integrity()
    if report.get("provider_count", 0) < report.get("seed_json_count", 0):
        print("Seeding providers from JSON...", file=sys.stderr)
        path = _BACKEND / "data" / "providers.json"
        seeded = await seed_providers_from_json(str(path))
        print(f"Seeded {seeded} providers", file=sys.stderr)
        report = await verify_providers_integrity()
    print(json.dumps(report, indent=2))
    return 0 if report.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
