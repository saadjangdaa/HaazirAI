"""Shared scheduling helpers for intent → concrete slot (Dhundho, Pakka)."""
from datetime import datetime, timedelta


def scheduled_time_from_intent(intent: dict) -> str:
    """Resolve the primary slot string used for Firestore conflict checks and booking."""
    if intent.get("emergency"):
        return (datetime.now() + timedelta(hours=1)).strftime("%Y-%m-%d %H:%M")
    time_pref = intent.get("time_preference", "tomorrow_morning")
    if time_pref == "now":
        return (datetime.now() + timedelta(minutes=30)).strftime("%Y-%m-%d %H:%M")
    if time_pref == "today":
        return datetime.now().strftime("%Y-%m-%d") + " 15:00"
    if time_pref == "tomorrow_morning":
        return (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d") + " 10:00"
    if time_pref == "tomorrow_afternoon":
        return (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d") + " 14:00"
    if time_pref == "this_week":
        return (datetime.now() + timedelta(days=2)).strftime("%Y-%m-%d") + " 10:00"
    if time_pref == "flexible":
        return (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d") + " 10:00"
    if time_pref == "specific_time":
        raw = intent.get("specific_datetime", "")
        try:
            dt = datetime.strptime(raw, "%Y-%m-%d %H:%M")
            if dt > datetime.now():
                return dt.strftime("%Y-%m-%d %H:%M")
        except (ValueError, TypeError):
            pass
    return (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d") + " 10:00"
