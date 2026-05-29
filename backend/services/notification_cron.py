"""Production cron hooks for scheduled Firestore notifications (reminders)."""
import asyncio
import os
from typing import Any, Dict, Optional

from fastapi import Header, HTTPException

from services.notification_service import process_pending_notifications
from logging_config import logger

CRON_SECRET_ENV = "CRON_SECRET"
CRON_INTERVAL_ENV = "NOTIFICATION_CRON_INTERVAL_SECONDS"
CRON_INTERNAL_ENV = "NOTIFICATION_CRON_INTERNAL"


def cron_secret_configured() -> bool:
    return bool(os.getenv(CRON_SECRET_ENV, "").strip())


def internal_cron_enabled() -> bool:
    if not cron_secret_configured():
        return False
    return os.getenv(CRON_INTERNAL_ENV, "").strip().lower() in ("1", "true", "yes")


def cron_interval_seconds() -> int:
    try:
        val = int(os.getenv(CRON_INTERVAL_ENV, "300"))
    except ValueError:
        val = 300
    return max(60, min(val, 3600))


def require_cron_secret(
    x_cron_secret: Optional[str] = Header(None, alias="X-Cron-Secret"),
) -> None:
    """Guard cron HTTP endpoints — set CRON_SECRET on Render / production."""
    expected = os.getenv(CRON_SECRET_ENV, "").strip()
    if not expected:
        raise HTTPException(
            status_code=503,
            detail=f"{CRON_SECRET_ENV} not configured on server",
        )
    if not x_cron_secret or x_cron_secret.strip() != expected:
        raise HTTPException(status_code=401, detail="Invalid cron secret")


async def run_notification_cron() -> Dict[str, Any]:
    """Process due scheduled notifications (reminders)."""
    result = await process_pending_notifications()
    logger.info(
        "[Cron] process_pending_notifications processed=%s sent=%s failed=%s",
        result.get("processed"),
        len(result.get("sent") or []),
        len(result.get("failed") or []),
    )
    return result


async def notification_cron_loop(stop: asyncio.Event) -> None:
    """Optional in-process loop — use only on single-instance deploys."""
    interval = cron_interval_seconds()
    logger.info("[Cron] internal reminder loop started interval=%ss", interval)
    while not stop.is_set():
        try:
            await run_notification_cron()
        except Exception as e:
            logger.warning("[Cron] internal loop error: %s", e)
        try:
            await asyncio.wait_for(stop.wait(), timeout=interval)
        except asyncio.TimeoutError:
            pass
    logger.info("[Cron] internal reminder loop stopped")
