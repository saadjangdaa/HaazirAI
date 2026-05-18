"""FCM / Expo push pipeline with Firestore notifications/{notif_id} persistence."""
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from services.booking_lifecycle import CUSTOMER_NOTIFY, WORKER_NOTIFY
from services.fcm import send_push
from services.firebase import (
    create_notification,
    get_booking,
    get_user,
    list_users_by_provider,
    mark_notification_sent,
    find_recent_notification,
    list_pending_notifications,
)

DEDUPE_WINDOW_SECONDS = 90


async def deliver_notification(
    user_id: str,
    *,
    title: str,
    message: str,
    event_type: str,
    booking_id: str = "",
    role: str = "customer",
    data: Optional[Dict[str, Any]] = None,
    send_at: Optional[str] = None,
) -> Optional[str]:
    """
    Persist notifications/{notif_id}, send push immediately unless scheduled.
    Returns notif_id or None if skipped (duplicate / no user).
    """
    uid = (user_id or "").strip()
    if not uid:
        return None

    bid = (booking_id or "").strip()
    if bid and await find_recent_notification(
        uid, bid, event_type, within_seconds=DEDUPE_WINDOW_SECONDS
    ):
        print(f"[Push] dedupe skip {event_type} booking={bid} user={uid}")
        return None

    now = datetime.now(timezone.utc)
    schedule_at = (send_at or "").strip()
    is_scheduled = bool(schedule_at and schedule_at > now.isoformat())

    notif_id = await create_notification(
        {
            "booking_id": bid,
            "user_id": uid,
            "send_at": schedule_at or now.isoformat(),
            "message": message,
            "title": title,
            "event_type": event_type,
            "role": role,
            "sent": False,
        }
    )

    if is_scheduled:
        return notif_id

    user = await get_user(uid)
    token = (user or {}).get("push_token")
    push_ok = False
    if token:
        payload = {"user_id": uid, "type": event_type, **(data or {})}
        if bid:
            payload["booking_id"] = bid
        push_ok = await send_push(token, title, message, payload)
    else:
        print(f"[Push] no push_token for users/{uid} — notification stored only")

    await mark_notification_sent(notif_id)
    print(f"[Push] {title} → {role} user={uid} sent={push_ok} notif={notif_id}")
    return notif_id


async def process_pending_notifications(before_iso: Optional[str] = None) -> Dict[str, Any]:
    """Send scheduled notifications whose send_at has passed."""
    pending = await list_pending_notifications(before_iso)
    sent_ids: List[str] = []
    failed: List[str] = []

    for doc in pending:
        nid = doc.get("notif_id")
        uid = doc.get("user_id")
        if not nid or not uid:
            continue
        user = await get_user(uid)
        token = (user or {}).get("push_token")
        title = doc.get("title") or "Haazir AI"
        message = doc.get("message") or ""
        data = {
            "type": doc.get("event_type", "reminder"),
            "booking_id": doc.get("booking_id", ""),
        }
        ok = False
        if token:
            ok = await send_push(token, title, message, data)
        if ok or not token:
            await mark_notification_sent(nid)
            sent_ids.append(nid)
        else:
            failed.append(nid)

    return {"processed": len(pending), "sent": sent_ids, "failed": failed}


async def notify_booking_status_change(
    booking: dict,
    old_status: str,
    new_status: str,
) -> None:
    """Role-based push only on real status transitions."""
    if not booking:
        return
    old_status = (old_status or "").strip().lower()
    new_status = (new_status or "").strip().lower()
    if not new_status or old_status == new_status:
        return

    booking_id = booking.get("booking_id", "")
    user_id = booking.get("user_id")
    provider_id = booking.get("provider_id")
    provider_name = booking.get("provider_name", "Provider")

    cust = CUSTOMER_NOTIFY.get(new_status)
    if cust and user_id:
        event, title, body = cust
        await deliver_notification(
            user_id,
            title=title,
            message=f"{body} Ref: {booking_id}",
            event_type=event,
            booking_id=booking_id,
            role="customer",
            data={"status": new_status},
        )

    worker = WORKER_NOTIFY.get(new_status)
    if worker and provider_id:
        event, title, body = worker
        worker_ids = await list_users_by_provider(provider_id)
        for wid in worker_ids:
            if wid == user_id:
                continue
            await deliver_notification(
                wid,
                title=title,
                message=f"{body} · {provider_name} · {booking_id}",
                event_type=event,
                booking_id=booking_id,
                role="worker",
                data={"status": new_status, "provider_id": provider_id},
            )


async def notify_booking_created(booking: dict) -> None:
    """First notification after booking doc exists — uses actual status, not startup."""
    if not booking:
        return
    status = (booking.get("status") or "pending").lower()
    await notify_booking_status_change(booking, "__none__", status)


async def notify_dispute_filed(
    booking: dict, customer_id: str, dispute_id: str = ""
) -> None:
    """Customer + workers notified when a dispute is filed (unique event per dispute_id)."""
    if not booking:
        return
    booking_id = booking.get("booking_id", "")
    event_suffix = (dispute_id or "new").strip()[:12]
    await deliver_notification(
        customer_id,
        title="Dispute opened",
        message=f"A dispute was opened on your booking. Ref: {booking_id}",
        event_type=f"dispute_created_{event_suffix}",
        booking_id=booking_id,
        role="customer",
        data={"status": "disputed", "dispute_id": dispute_id},
    )
    provider_id = booking.get("provider_id")
    if provider_id:
        for wid in await list_users_by_provider(provider_id):
            if wid == customer_id:
                continue
            await deliver_notification(
                wid,
                title="Dispute opened",
                message=f"A dispute was opened on booking {booking_id}",
                event_type=f"dispute_opened_{event_suffix}",
                booking_id=booking_id,
                role="worker",
                data={"status": "disputed", "provider_id": provider_id, "dispute_id": dispute_id},
            )


async def notify_feedback_received(
    booking: dict, provider_id: str, rating: int
) -> None:
    """Worker notified when customer leaves a review."""
    if not booking or not provider_id:
        return
    booking_id = booking.get("booking_id", "")
    for wid in await list_users_by_provider(provider_id):
        await deliver_notification(
            wid,
            title="New review",
            message=f"Customer rated {rating}/5 on booking {booking_id}",
            event_type="review_received",
            booking_id=booking_id,
            role="worker",
            data={"rating": rating},
        )
