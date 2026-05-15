"""Seed Firestore providers from data/providers.json. Run from backend/: python scripts/seed_providers.py"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services.firebase import is_mock_mode, seed_providers_from_json

DATA = Path(__file__).resolve().parents[1] / "data" / "providers.json"


async def main() -> None:
    count = await seed_providers_from_json(str(DATA))
    mode = "mock (in-memory)" if is_mock_mode() else "Firestore"
    print(f"Seeded {count} providers into {mode}")


if __name__ == "__main__":
    asyncio.run(main())
