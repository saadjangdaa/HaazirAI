"""Agent 4 — PAKKA: Booking + Scheduling Intelligence."""
import uuid
from datetime import datetime, timedelta
from services.firebase import save_booking, check_slot_conflict
from services.scheduling import scheduled_time_from_intent


class PakkaAgent:

    async def create_booking(
        self, intent: dict, provider: dict, pricing: dict, user_id: str = "user_001"
    ) -> dict:
        start = datetime.now()

        is_emergency = intent.get("emergency", False)
        service = intent.get("service_type", "service")
        location = intent.get("location", "")
        city = intent.get("city", "Islamabad")
        provider_id = provider.get("id")
        provider_name = provider.get("name", "Provider")
        total_price = pricing.get("total", 1000)

        scheduled_time = scheduled_time_from_intent(intent)

        conflict = False
        alternate_slots = []
        fallback_used = False

        if not is_emergency:
            conflict = await check_slot_conflict(provider_id, scheduled_time)
            if conflict:
                fallback_used = True
                base_dt = datetime.strptime(scheduled_time, "%Y-%m-%d %H:%M")
                alternate_slots = [
                    (base_dt + timedelta(hours=h)).strftime("%Y-%m-%d %H:%M")
                    for h in [2, 3, 5]
                ]
                scheduled_time = alternate_slots[0]

        booking_id = f"HAZ-{datetime.now().strftime('%Y%m%d')}-{str(uuid.uuid4())[:6].upper()}"

        try:
            dt = datetime.strptime(scheduled_time, "%Y-%m-%d %H:%M")
            display_time = dt.strftime("%d %b %Y, %I:%M %p")
        except Exception:
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
            "status": "confirmed",
            "emergency": is_emergency,
        }

        reminder_times = []
        if not is_emergency:
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
            "user_id": user_id,
            "service": service,
            "scheduled_time": scheduled_time,
            "status": "confirmed",
            "price": total_price,
            "emergency": is_emergency,
        }
        await save_booking(booking_data)

        end = datetime.now()
        elapsed = round((end - start).total_seconds(), 3)

        if is_emergency:
            decision = "Emergency booking — immediate slot (conflict reschedule skipped)"
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
