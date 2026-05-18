"""Agent 4 — PAKKA: Booking + Scheduling Intelligence."""
import uuid
from datetime import datetime, timedelta
from services.firebase import save_booking, check_slot_conflict


TIME_PREF_TO_SLOT = {
    "now": "ASAP",
    "today": datetime.now().strftime("%Y-%m-%d") + " 15:00",
    "tomorrow_morning": (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d") + " 10:00",
    "tomorrow_afternoon": (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d") + " 14:00",
    "this_week": (datetime.now() + timedelta(days=2)).strftime("%Y-%m-%d") + " 10:00",
    "flexible": (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d") + " 10:00",
}


class PakkaAgent:

    async def create_booking(
        self, intent: dict, provider: dict, pricing: dict, user_id: str
    ) -> dict:
        start = datetime.now()

        time_pref = intent.get("time_preference", "tomorrow_morning")
        is_emergency = intent.get("emergency", False)
        service = intent.get("service_type", "service")
        location = intent.get("location", "")
        city = intent.get("city", "Islamabad")
        provider_id = provider.get("id")
        provider_name = provider.get("name", "Provider")
        total_price = pricing.get("total", 1000)

        if is_emergency:
            slot_time = datetime.now() + timedelta(hours=1)
            scheduled_time = slot_time.strftime("%Y-%m-%d %H:%M")
        else:
            scheduled_time = TIME_PREF_TO_SLOT.get(time_pref, TIME_PREF_TO_SLOT["tomorrow_morning"])

        conflict = await check_slot_conflict(provider_id, scheduled_time)
        alternate_slots = []
        fallback_used = False

        if conflict:
            fallback_used = True
            base_dt = datetime.strptime(
                scheduled_time if scheduled_time != "ASAP" else datetime.now().strftime("%Y-%m-%d %H:%M"),
                "%Y-%m-%d %H:%M"
            )
            alternate_slots = [
                (base_dt + timedelta(hours=h)).strftime("%Y-%m-%d %H:%M")
                for h in [2, 3, 5]
            ]
            scheduled_time = alternate_slots[0]

        booking_id = f"HAZ-{datetime.now().strftime('%Y%m%d')}-{str(uuid.uuid4())[:6].upper()}"

        display_time = scheduled_time if scheduled_time != "ASAP" else "1 ghante mein"
        if scheduled_time != "ASAP":
            try:
                dt = datetime.strptime(scheduled_time, "%Y-%m-%d %H:%M")
                display_time = dt.strftime("%d %b %Y, %I:%M %p")
            except Exception:
                pass

        urgency_prefix = "🚨 EMERGENCY BOOKING! " if is_emergency else ""
        confirmation_message = (
            f"{urgency_prefix}✅ Booking Confirm! {provider_name} "
            f"{'1 ghante mein' if is_emergency else display_time} pe "
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

        reminder_times = []
        if not is_emergency and scheduled_time != "ASAP":
            try:
                dt = datetime.strptime(scheduled_time, "%Y-%m-%d %H:%M")
                reminder_times = [
                    (dt - timedelta(days=1)).isoformat(),
                    (dt - timedelta(hours=1)).isoformat(),
                ]
            except Exception:
                pass

        calendar_entry = {
            "title": f"Haazir AI — {service} ({provider_name})",
            "start": scheduled_time,
            "location": f"{location}, {city}, Pakistan",
            "notes": f"Booking ref: {booking_id} | Rs {total_price:,}",
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
        }
        await save_booking(booking_data)

        end = datetime.now()
        elapsed = round((end - start).total_seconds(), 3)

        decision = (
            "Emergency booking — slot overridden to earliest available"
            if is_emergency
            else (f"Conflict resolved — alternate slot {alternate_slots[0]} selected" if conflict else "Slot confirmed, no conflict")
        )

        return {
            "booking_id": booking_id,
            "provider_id": provider_id,
            "user_id": user_id,
            "service": service,
            "scheduled_time": scheduled_time,
            "status": "confirmed",
            "confirmation_message": confirmation_message,
            "receipt": receipt,
            "reminder_times": reminder_times,
            "alternate_slots": alternate_slots,
            "calendar_entry": calendar_entry,
            "_log": {
                "agent_name": "PAKKA",
                "agent_name_urdu": "پکّا",
                "start_time": start.isoformat(),
                "end_time": end.isoformat(),
                "input_summary": f"Booking {service} with {provider_name} for {scheduled_time}",
                "output_summary": f"Booking {booking_id} confirmed at {scheduled_time}",
                "decision_made": decision,
                "confidence": 0.97,
                "fallback_used": fallback_used,
                "time_seconds": elapsed,
            },
        }
