"""Dispute flow feature flags (Phase B — two-sided lifecycle)."""
import os


def dispute_instant_resolve_enabled() -> bool:
    """Legacy instant JHAGRA resolve; default off for two-sided disputes."""
    return os.getenv("DISPUTE_INSTANT_RESOLVE", "false").strip().lower() in (
        "1",
        "true",
        "yes",
    )
