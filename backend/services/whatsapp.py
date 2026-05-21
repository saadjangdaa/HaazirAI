"""WhatsApp booking confirmation via Twilio Sandbox — optional feature.

Set these env vars to enable:
  TWILIO_ACCOUNT_SID   — your Twilio Account SID
  TWILIO_AUTH_TOKEN    — your Twilio Auth Token
  TWILIO_WHATSAPP_FROM — sender number (default: whatsapp:+14155238886 sandbox)

If not set, the function logs and returns False — no crash.
"""
import asyncio
import logging
import os
from concurrent.futures import ThreadPoolExecutor

logger = logging.getLogger("whatsapp")

_TWILIO_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
_TWILIO_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
_TWILIO_FROM = os.getenv("TWILIO_WHATSAPP_FROM", "whatsapp:+14155238886")


def _normalize_pk_phone(phone: str) -> str:
    """Return E.164 format for Pakistani numbers, e.g. '03001234567' → '+923001234567'."""
    phone = phone.strip().replace(" ", "").replace("-", "")
    if phone.startswith("+"):
        return phone
    if phone.startswith("92"):
        return "+" + phone
    if phone.startswith("0"):
        return "+92" + phone[1:]
    return "+92" + phone


def _send_twilio_whatsapp(to_phone: str, message: str) -> bool:
    """Blocking Twilio REST call — run in executor."""
    try:
        import urllib.request
        import urllib.parse
        import base64

        url = f"https://api.twilio.com/2010-04-01/Accounts/{_TWILIO_SID}/Messages.json"
        payload = urllib.parse.urlencode({
            "From": _TWILIO_FROM,
            "To": f"whatsapp:{to_phone}",
            "Body": message,
        }).encode()
        credentials = base64.b64encode(f"{_TWILIO_SID}:{_TWILIO_TOKEN}".encode()).decode()
        req = urllib.request.Request(url, data=payload, method="POST")
        req.add_header("Authorization", f"Basic {credentials}")
        req.add_header("Content-Type", "application/x-www-form-urlencoded")
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status in (200, 201)
    except Exception as exc:
        logger.warning("[whatsapp] Twilio call failed: %s", exc)
        return False


async def send_booking_whatsapp(
    to_phone: str,
    booking_id: str,
    provider_name: str,
    service: str,
    price: int,
    scheduled_time: str,
) -> bool:
    """
    Send a WhatsApp booking confirmation.
    Returns True if sent, False if credentials missing or send failed.
    """
    if not _TWILIO_SID or not _TWILIO_TOKEN:
        logger.info("[whatsapp] Credentials not configured — skipping WhatsApp to %s", to_phone)
        return False

    phone = _normalize_pk_phone(to_phone)
    message = (
        f"✅ Haazir AI - Booking Confirm!\n\n"
        f"Booking ID: {booking_id}\n"
        f"Service: {service}\n"
        f"Worker: {provider_name}\n"
        f"Price: Rs. {price:,}\n"
        f"Time: {scheduled_time}\n\n"
        f"Shukriya! Haazir AI aapki sewa mein haazir hai."
    )

    loop = asyncio.get_event_loop()
    with ThreadPoolExecutor(max_workers=1) as pool:
        sent = await loop.run_in_executor(pool, _send_twilio_whatsapp, phone, message)

    if sent:
        logger.info("[whatsapp] Confirmation sent to %s for booking %s", phone, booking_id)
    return sent
