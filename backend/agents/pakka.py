"""Agent 4 — PAKKA: Booking + Scheduling Intelligence."""
# PAKKA-HARDENED

import logging
import uuid
from datetime import datetime, timedelta

from services.firebase import check_slot_conflict, save_booking
from services.scheduling import scheduled_time_from_intent

TRAVEL_BUFFER_MINUTES = 30
MIN_SLOT_GAP_HOURS = 1  # minimum gap between jobs including travel

_pakka_log = logging.getLogger("pakka")


async def claim_slot_atomic(provider_id: str, scheduled_time: str, booking_data: dict) -> bool:
    """
    Atomically check slot + persist booking via patchable pakka imports (tests).
    Production Firestore transaction: services.firebase.claim_slot_atomic.
    """
    conflict = await check_slot_conflict(provider_id, scheduled_time)
    if conflict:
        return False
    await save_booking(booking_data)
    return True


class PakkaAgent:

    async def create_booking(
        self, intent: dict, provider: dict, pricing: dict, user_id: str
    ) -> dict:
        start = datetime.now()

        original_requested_time = scheduled_time_from_intent(intent)

        is_emergency = intent.get("emergency", False)
        service = intent.get("service_type", "service")
        location = intent.get("location", "")
        city = intent.get("city", "Islamabad")
        provider_id = provider.get("id")
        provider_name = provider.get("name", "Provider")
        total_price = pricing.get("total", 1000)

        scheduled_time = original_requested_time

        conflict = False
        alternate_slots = []
        fallback_used = False
        waitlist_entry = None
        all_slots_full = False
        emergency_slot_found = False
        emergency_override_used = False

        if is_emergency:
            base_emergency = datetime.now()
            emergency_scan_slots = []
            for minutes_ahead in [30, 45, 60, 75, 90, 105, 120]:
                candidate = (base_emergency + timedelta(minutes=minutes_ahead)).strftime(
                    "%Y-%m-%d %H:%M"
                )
                emergency_scan_slots.append(candidate)
                slot_free = not await check_slot_conflict(provider_id, candidate)
                if slot_free:
                    scheduled_time = candidate
                    emergency_slot_found = True
                    break

            if not emergency_slot_found:
                scheduled_time = emergency_scan_slots[0]
                emergency_override_used = True
        else:
            conflict = await check_slot_conflict(provider_id, scheduled_time)
            if conflict:
                fallback_used = True
                base_dt = datetime.strptime(scheduled_time, "%Y-%m-%d %H:%M")

                candidate_offsets = [2, 3, 4, 5, 6, 8]
                confirmed_alternates = []

                for offset in candidate_offsets:
                    candidate = (base_dt + timedelta(hours=offset)).strftime("%Y-%m-%d %H:%M")
                    candidate_conflict = await check_slot_conflict(provider_id, candidate)
                    if not candidate_conflict:
                        confirmed_alternates.append(candidate)
                    if len(confirmed_alternates) == 3:
                        break

                alternate_slots = confirmed_alternates

                if confirmed_alternates:
                    scheduled_time = confirmed_alternates[0]
                else:
                    scheduled_time = (base_dt + timedelta(hours=2)).strftime("%Y-%m-%d %H:%M")
                    alternate_slots = []

            all_slots_full = conflict and not alternate_slots

        booking_id = f"HAZ-{datetime.now().strftime('%Y%m%d')}-{str(uuid.uuid4())[:6].upper()}"

        try:
            dt = datetime.strptime(scheduled_time, "%Y-%m-%d %H:%M")
            display_time = dt.strftime("%d %b %Y, %I:%M %p")
        except ValueError as exc:
            _pakka_log.warning(
                "scheduled_time parse failed for value %r: %s", scheduled_time, exc
            )
            display_time = scheduled_time

        urgency_prefix = "🚨 EMERGENCY BOOKING! " if is_emergency else ""
        confirmation_message = (
            f"{urgency_prefix}✅ Booking Confirm! {provider_name} "
            f"{'jald az jald (emergency)' if is_emergency else display_time} pe "
            f"{location}, {city} aayenge. "
            f"Total estimate: Rs. {total_price:,}. "
            f"Reference: {booking_id}"
        )

        receipt = {
            "booking_id": booking_id,
            "provider_name": provider_name,
            "provider_phone": provider.get("phone", "03001234567"),
            "service": service,
            "location": f"{location}, {city}",
            "scheduled_time": scheduled_time,
            "estimated_price": f"Rs. {total_price:,}",
            "payment_methods": ["JazzCash", "Easypaisa", "Cash"],
            "status": "assigned",
            "emergency": is_emergency,
        }
        if is_emergency:
            confirmation_message_urdu = (
                f"🚨 فوری بکنگ! ✅ {provider_name} جلد از جلد "
                f"{location}، {city} آئیں گے۔ "
                f"تخمینہ: Rs. {total_price:,}۔ "
                f"حوالہ: {booking_id}"
            )
        else:
            confirmation_message_urdu = (
                f"✅ بکنگ کنفرم! {provider_name} "
                f"{display_time} کو "
                f"{location}، {city} آئیں گے۔ "
                f"کل تخمینہ: Rs. {total_price:,}۔ "
                f"حوالہ نمبر: {booking_id}"
            )

        if emergency_override_used:
            confirmation_message += (
                " ⚠️ Note: requested slot was busy — this time is provisional."
            )
            confirmation_message_urdu += (
                " ⚠️ نوٹ: مطلوبہ وقت مصروف تھا — یہ وقت عارضی ہے۔"
            )

        slot_provisional = emergency_override_used
        final_status = "waitlisted" if all_slots_full else "confirmed"

        reminder_times = []
        try:
            dt_slot = datetime.strptime(scheduled_time, "%Y-%m-%d %H:%M")
            if is_emergency:
                reminder_times = [
                    datetime.now().isoformat(),
                    (dt_slot - timedelta(minutes=10)).isoformat(),
                ]
            else:
                reminder_times = [
                    (dt_slot - timedelta(days=1)).isoformat(),
                    (dt_slot - timedelta(hours=1)).isoformat(),
                ]
        except ValueError as exc:
            _pakka_log.warning(
                "scheduled_time parse failed for value %r: %s", scheduled_time, exc
            )

        calendar_entry = {
            "title": f"Haazir AI — {service} ({provider_name})",
            "start": scheduled_time,
            "location": f"{location}, {city}, Pakistan",
            "notes": f"Booking ref: {booking_id} | Rs {total_price:,}",
        }

        notification = {
            "type": "urgent" if is_emergency else "standard",
            "channels": ["whatsapp", "sms"] if is_emergency else ["sms"],
            "provider_notify": True,
            "user_notify": True,
            "message_preview": confirmation_message[:100],
            "send_at": (
                "immediate"
                if is_emergency
                else reminder_times[0] if reminder_times else "immediate"
            ),
        }

        booking_data = {
            "booking_id": booking_id,
            "provider_id": provider_id,
            "provider_name": provider_name,
            "user_id": user_id,
            "service": service,
            "scheduled_time": scheduled_time,
            "slot_time": scheduled_time,
            "status": "assigned",
            "price": total_price,
            "reminder_sent": False,
            "emergency": is_emergency,
            "notification": notification,
            "travel_buffer_minutes": TRAVEL_BUFFER_MINUTES,
        }

        if not all_slots_full:
            claimed = await claim_slot_atomic(provider_id, scheduled_time, booking_data)
            if not claimed and len(alternate_slots) > 1:
                scheduled_time = alternate_slots[1]
                booking_data["scheduled_time"] = scheduled_time
                claimed = await claim_slot_atomic(provider_id, scheduled_time, booking_data)

            if not claimed:
                all_slots_full = True
                final_status = "waitlisted"
                booking_data["status"] = final_status
                waitlist_entry = {
                    "waitlist_id": (
                        f"WL-{datetime.now().strftime('%Y%m%d')}-"
                        f"{str(uuid.uuid4())[:6].upper()}"
                    ),
                    "provider_id": provider_id,
                    "user_id": user_id,
                    "service": service,
                    "requested_time": original_requested_time,
                    "added_at": datetime.now().isoformat(),
                    "status": "waitlisted",
                    "notify_on_slot": True,
                    "message": (
                        f"Sab slots full hain. Jaisay hi {provider_name} ka slot available ho ga, "
                        f"hum aap ko WhatsApp/SMS pe notify karein ge."
                    ),
                }
                await save_booking({**waitlist_entry, "booking_type": "waitlist"})
                await save_booking(booking_data)
        else:
            if waitlist_entry is None:
                waitlist_entry = {
                    "waitlist_id": (
                        f"WL-{datetime.now().strftime('%Y%m%d')}-"
                        f"{str(uuid.uuid4())[:6].upper()}"
                    ),
                    "provider_id": provider_id,
                    "user_id": user_id,
                    "service": service,
                    "requested_time": original_requested_time,
                    "added_at": datetime.now().isoformat(),
                    "status": "waitlisted",
                    "notify_on_slot": True,
                    "message": (
                        f"Sab slots full hain. Jaisay hi {provider_name} ka slot available ho ga, "
                        f"hum aap ko WhatsApp/SMS pe notify karein ge."
                    ),
                }
            await save_booking({**waitlist_entry, "booking_type": "waitlist"})
            booking_data["status"] = final_status
            await save_booking(booking_data)

        receipt = {
            "booking_id": booking_id,
            "provider_name": provider_name,
            "provider_phone": provider.get("phone", "03001234567"),
            "service": service,
            "location": f"{location}, {city}",
            "scheduled_time": scheduled_time,
            "estimated_price": f"Rs. {total_price:,}",
            "payment_methods": ["JazzCash", "Easypaisa", "Cash"],
            "status": final_status,
            "emergency": is_emergency,
            "confirmation_message_urdu": confirmation_message_urdu,
            "slot_provisional": slot_provisional,
        }

        end = datetime.now()
        elapsed = round((end - start).total_seconds(), 3)

        if is_emergency:
            decision = "Emergency booking — immediate slot (conflict reschedule skipped)"
        elif all_slots_full:
            decision = "All slots full — customer added to waitlist"
        elif conflict:
            decision = f"Conflict resolved — alternate slot {alternate_slots[0]} selected"
        else:
            decision = "Slot confirmed, no conflict"

        return {
            "booking_id": booking_id,
            "provider_id": provider_id,
            "user_id": user_id,
            "service": service,
            "scheduled_time": scheduled_time,
            "status": final_status,
            "confirmation_message": confirmation_message,
            "confirmation_message_urdu": confirmation_message_urdu,
            "receipt": receipt,
            "reminder_times": reminder_times,
            "alternate_slots": alternate_slots,
            "calendar_entry": calendar_entry,
            "waitlisted": all_slots_full,
            "waitlist_entry": waitlist_entry,
            "notification": notification,
            "travel_buffer_minutes": TRAVEL_BUFFER_MINUTES,
            "slot_provisional": slot_provisional,
            "_log": {
                "agent_name": "PAKKA",
                "agent_name_urdu": "پکّا",
                "start_time": start.isoformat(),
                "end_time": end.isoformat(),
                "input_summary": (
                    f"Booking {service} with {provider_name} for {original_requested_time}"
                ),
                "output_summary": (
                    f"Booking {booking_id} → status={final_status} at {scheduled_time}"
                ),
                "decision_made": decision,
                "confidence": 0.97,
                "fallback_used": fallback_used,
                "time_seconds": elapsed,
                "travel_buffer_minutes": TRAVEL_BUFFER_MINUTES,
                "conflict_detected": conflict,
                "alternate_slots_found": len(alternate_slots),
                "waitlisted": all_slots_full,
                "emergency_slot_found": emergency_slot_found if is_emergency else None,
                "emergency_override_used": emergency_override_used if is_emergency else None,
            },
        }
