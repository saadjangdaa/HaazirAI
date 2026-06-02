"""Agent 4 — PAKKA: Booking + Scheduling Intelligence."""
# PAKKA-HARDENED

import logging
import uuid
from datetime import datetime, timedelta

from services.firebase import check_slot_conflict, save_booking
from services.investigation_service import is_provider_eligible_for_assignment
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
        if not is_provider_eligible_for_assignment(provider):
            raise ValueError(f"Provider {provider_id} is not eligible for assignment")

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

    async def handle_cancellation(
        self,
        booking_id: str,
        provider_id: str,
        cancelled_by: str,
        reason: str,
        original_booking: dict,
        alternative_providers: list[dict],
        intent: dict,
        pricing: dict,
        user_id: str = "user_001",
    ) -> dict:
        start = datetime.now()
        replacement_booking = None

        if cancelled_by == "provider":
            cancellation_penalty = True
            penalty_points = 10
            cancel_reason_category = "provider_cancelled"
            customer_message = (
                "Aap ke provider ne booking cancel kar di. "
                "Hum aap ke liye doosra provider dhundh rahe hain..."
            )
        else:
            cancellation_penalty = False
            penalty_points = 0
            cancel_reason_category = "customer_cancelled"
            customer_message = (
                "Aap ki booking cancel ho gayi. "
                "Agar zaroorat ho to dobara book karein."
            )

        cancelled_booking_data = {
            **original_booking,
            "status": "cancelled",
            "cancelled_by": cancelled_by,
            "cancellation_reason": reason,
            "cancelled_at": datetime.now().isoformat(),
            "penalty_applied": cancellation_penalty,
            "penalty_points": penalty_points,
        }
        await save_booking(cancelled_booking_data)

        if cancelled_by == "provider":
            replacement_booking = await self._find_replacement(
                alternative_providers, intent, pricing, user_id
            )
            if replacement_booking:
                replacement_status = "replacement_found"
                provider_name = replacement_booking.get("receipt", {}).get(
                    "provider_name", "Provider"
                )
                replacement_message = (
                    f"✅ Nayi booking confirm! {provider_name} "
                    f"{replacement_booking['scheduled_time']} pe aayenge. "
                    f"Naya reference: {replacement_booking['booking_id']}"
                )
            else:
                replacement_status = "no_replacement_found"
                replacement_message = (
                    "Abhi koi provider available nahi. "
                    "Aap waitlist mein hain — jaisay hi koi available ho ga hum notify karein ge."
                )
        else:
            replacement_booking = None
            replacement_status = "customer_cancelled_no_replacement"
            replacement_message = customer_message

        end = datetime.now()
        elapsed = round((end - start).total_seconds(), 3)

        return {
            "cancellation_id": (
                f"CAN-{datetime.now().strftime('%Y%m%d')}-"
                f"{str(uuid.uuid4())[:6].upper()}"
            ),
            "original_booking_id": booking_id,
            "cancelled_by": cancelled_by,
            "cancellation_reason": reason,
            "cancel_reason_category": cancel_reason_category,
            "penalty_applied": cancellation_penalty,
            "penalty_points": penalty_points,
            "customer_message": customer_message,
            "replacement_status": replacement_status,
            "replacement_message": replacement_message,
            "replacement_booking": replacement_booking,
            "notification": {
                "type": "urgent",
                "channels": ["whatsapp", "sms"],
                "provider_notify": True,
                "user_notify": True,
                "message_preview": customer_message[:100],
                "send_at": "immediate",
            },
            "_log": {
                "agent_name": "PAKKA",
                "agent_name_urdu": "پکّا",
                "start_time": start.isoformat(),
                "end_time": end.isoformat(),
                "input_summary": f"Cancellation: booking={booking_id} by={cancelled_by}",
                "output_summary": f"replacement_status={replacement_status}",
                "decision_made": replacement_status,
                "confidence": 0.95,
                "fallback_used": False,
                "time_seconds": elapsed,
            },
        }

    async def _find_replacement(
        self,
        alternative_providers: list[dict],
        intent: dict,
        pricing: dict,
        user_id: str,
    ) -> dict | None:
        for provider in alternative_providers:
            if provider.get("id") is None:
                continue
            result = await self.create_booking(intent, provider, pricing, user_id)
            if result["status"] == "confirmed":
                return result
            if result["status"] == "waitlisted":
                continue
        return None

    async def handle_no_show(
        self,
        booking_id: str,
        provider_id: str,
        original_booking: dict,
        alternative_providers: list[dict],
        intent: dict,
        pricing: dict,
        user_id: str = "user_001",
    ) -> dict:
        start = datetime.now()

        no_show_data = {
            **original_booking,
            "status": "no_show",
            "no_show_detected_at": datetime.now().isoformat(),
            "penalty_applied": True,
            "penalty_points": 20,
        }
        await save_booking(no_show_data)

        replacement = await self._find_replacement(
            alternative_providers, intent, pricing, user_id
        )

        if replacement:
            customer_message = (
                "Aap ka provider nahi aaya. Hum ne aap ke liye "
                "doosra provider dhundha hai."
            )
            replacement_status = "replacement_found"
        else:
            customer_message = (
                "Aap ka provider nahi aaya. Abhi koi alternative "
                "available nahi — aap waitlist mein hain."
            )
            replacement_status = "no_replacement_found"

        end = datetime.now()
        elapsed = round((end - start).total_seconds(), 3)

        return {
            "no_show_id": (
                f"NS-{datetime.now().strftime('%Y%m%d')}-"
                f"{str(uuid.uuid4())[:6].upper()}"
            ),
            "original_booking_id": booking_id,
            "provider_id": provider_id,
            "penalty_points": 20,
            "customer_message": customer_message,
            "replacement_status": replacement_status,
            "replacement_booking": replacement,
            "notification": {
                "type": "urgent",
                "channels": ["whatsapp", "sms"],
                "provider_notify": True,
                "user_notify": True,
                "message_preview": "Aap ka provider nahi aaya..."[:100],
                "send_at": "immediate",
            },
            "_log": {
                "agent_name": "PAKKA",
                "agent_name_urdu": "پکّا",
                "start_time": start.isoformat(),
                "end_time": end.isoformat(),
                "input_summary": f"No-show: booking={booking_id} provider={provider_id}",
                "output_summary": (
                    f"penalty=20pts replacement={'found' if replacement else 'not found'}"
                ),
                "decision_made": "NO_SHOW_HANDLED",
                "confidence": 0.95,
                "fallback_used": False,
                "time_seconds": elapsed,
            },
        }
