"""Push — Expo Push API (Expo Go) or FCM native tokens."""
import json
from typing import Any, Dict, Optional, Tuple

import httpx

from services.firebase import is_mock_mode


def _is_expo_push_token(token: str) -> bool:
    return "ExponentPushToken" in token or "ExpoPushToken" in token


async def _send_expo_push(
    token: str, title: str, body: str, data: Optional[Dict[str, Any]] = None
) -> Tuple[bool, str]:
    payload = {
        "to": token,
        "title": title,
        "body": body,
        "data": data or {},
        "sound": "default",
        "priority": "high",
        "channelId": "default",
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.post(
                "https://exp.host/--/api/v2/push/send",
                json=payload,
                headers={"Accept": "application/json", "Content-Type": "application/json"},
            )
            if res.status_code != 200:
                return False, f"HTTP {res.status_code}: {res.text}"
            body_json = res.json()
            ticket = body_json.get("data")
            if isinstance(ticket, list):
                ticket = ticket[0] if ticket else {}
            if isinstance(ticket, dict) and ticket.get("status") == "error":
                return False, ticket.get("message", str(ticket))
            return True, "ok"
    except Exception as e:
        return False, str(e)


async def send_push(
    token: str, title: str, body: str, data: Optional[Dict[str, Any]] = None
) -> bool:
    if not token:
        return False
    if is_mock_mode():
        print(f"[Push mock] {title}: {body}")
        return True
    if _is_expo_push_token(token):
        ok, detail = await _send_expo_push(token, title, body, data)
        if not ok:
            print(f"[Push] Expo failed: {detail}")
        return ok
    try:
        from firebase_admin import messaging

        messaging.send(
            messaging.Message(
                notification=messaging.Notification(title=title, body=body),
                data={k: str(v) for k, v in (data or {}).items()},
                token=token,
            )
        )
        return True
    except Exception as e:
        print(f"[Push] FCM error: {e}")
        return False
