"""BAAT-CHEET: Conversational AI agent — Fatima (female persona), multi-turn dialogue."""
import re
from services.gemini import generate

SYSTEM_PROMPT = """Tum Fatima ho — Haazir AI ki friendly female voice assistant. Pakistan mein ghar ki services ke liye.

ZAROORI HUKUM (1): Sirf Roman Urdu likhna (English/Latin letters mein) — kabhi bhi Urdu script, Arabic script, ya Hindi/Devanagari mat likhna.
ZAROORI HUKUM (2): KABHI naam mat poocho — user pehle se logged in hai, naam tumhe pata hai ya nahi bhi toh koi baat nahi. Seedha kaam ki baat karo.
ZAROORI HUKUM (3): Apne liye female pronouns (hun, rahi hun). User ke liye "aap" (aap, aapka, aapko).
ZAROORI HUKUM (4): Agar user ne SEEDHA service batadi hai (e.g. "mechanic chahiye", "plumber bulao") toh SIRF location poocho — greeting skip karo.

Har response maximum 2 sentences. Warm aur confident raho.

Tumhara kaam — is order mein:
1. Pehli baar: agar user_name diya hai toh "Assalam-o-Alaikum [naam]! Kya service chahiye?" — agar naam nahi toh "Assalam-o-Alaikum! Kya service chahiye?" — NAAM KABHI MAT POOCHO
2. Agar user ne pehle hi service batadi (e.g. "mechanic chahiye") toh sirf location poocho: "Bilkul! Worker ko kahan bhejun? Area ya sector batayein."
3. Jab service pata ho aur location nahi, SIRF yeh poocho: "Worker ko kahan bulana chahte hain? Apna area ya sector batayein."
4. Location milne ke baad urgency mat poocho — "medium" assume karo
5. SIRF EK sawal ek baar mein pucho
6. Jab service + location DONO pata hon, EXACTLY likho (alag line):
   [SEARCH: service=X location=Y urgency=medium]
   Phir kaho: "Theek hai, main abhi aapke area mein providers dhundh rahi hun!"
7. Jab [RESULTS: ...] mile, top 2 providers ka naam aur rate batao, pucho: "Aap kise prefer karein ge?"
8. Jab user provider chunay, pucho: "Payment cash mein karein ge ya JazzCash/Easypaisa se?"
9. Jab user payment method bataye, pehle yeh sentence kaho: "[provider naam] aapke ghar Rs.[price] mein [time] aayenge, payment [payment method] se hogi." PHIR USI response mein EXACTLY likho (alag line):
   [BOOK: provider_id=X payment=Y]
   PHIR likho: "Aapki booking confirm ho gayi — shukriya!"
   YEH SAARA EK HI response mein hona chahiye — teen cheezein: details + [BOOK] tag + confirmation.

Important: Responses SHORT rakho — tum bol rahi ho, type nahi kar rahi."""

_sessions: dict = {}


async def run_conversation(
    session_id: str,
    user_message: str,
    providers: list = None,
    user_name: str = None,
    history: list = None,
) -> dict:
    session_lost = session_id not in _sessions
    if session_lost:
        # Restore from client-provided history (handles Render worker restarts)
        restored_history = []
        if history:
            for entry in history:
                role = entry.get("role", "user")
                content = entry.get("content", "")
                if content:
                    restored_history.append({"role": role, "content": content})
        _sessions[session_id] = {
            "history": restored_history,
            "phase": "intake",
            "user_name": user_name or "",
        }

    session = _sessions[session_id]
    # Always refresh user_name in case it was empty on first init
    if user_name and not session.get("user_name"):
        session["user_name"] = user_name
    stored_name = session.get("user_name", "")
    first_name = stored_name.split()[0] if stored_name else ""

    # __init__ = first greeting — don't add as user turn
    if user_message != "__init__":
        session["history"].append({"role": "user", "content": user_message})

    # Build conversation history
    history_lines = []
    for m in session["history"][-12:]:
        role = "User" if m["role"] == "user" else "Fatima"
        history_lines.append(f"{role}: {m['content']}")
    history_text = "\n".join(history_lines)

    # Inject provider results when search completes
    results_injection = ""
    if providers:
        summary_parts = []
        for p in providers[:3]:
            summary_parts.append(
                f"{p.get('name', '?')} (Rating: {p.get('rating', '?')}, "
                f"Rate: Rs.{p.get('base_rate', p.get('hourly_rate', 'N/A'))}, "
                f"ID: {p.get('id', '?')})"
            )
        results_injection = f"\n[RESULTS: {' | '.join(summary_parts)}]"
        session["phase"] = "confirming"

    # Build prompt
    if user_message == "__init__":
        if first_name:
            prompt = f"(User ka naam: {first_name}. Warmly greet karo naam le kar, phir poocho kya service chahiye)\nFatima:"
        else:
            prompt = "(Warmly greet karo, phir seedha poocho kya service chahiye — naam mat poocho)\nFatima:"
    elif history_text:
        prompt = f"{history_text}{results_injection}\nFatima:"
    else:
        prompt = "Fatima:"

    response_text = await generate(prompt, system_prompt=SYSTEM_PROMPT)
    response_text = response_text.strip()

    # Safety: if Gemini returned raw JSON, use a sensible fallback
    if response_text.startswith('{') and '"response"' in response_text:
        greeting = f"Assalam-o-Alaikum {first_name}! " if first_name else "Assalam-o-Alaikum! "
        response_text = f"{greeting}Main Fatima hun, Haazir AI ki assistant. Batayiye, aaj kya chahiye?"

    session["history"].append({"role": "assistant", "content": response_text})

    # Parse [SEARCH: ...] trigger
    search_trigger = None
    search_match = re.search(r'\[SEARCH:\s*([^\]]+)\]', response_text)
    if search_match:
        params = {}
        for part in search_match.group(1).split():
            if '=' in part:
                k, v = part.split('=', 1)
                params[k.strip()] = v.strip()
        search_trigger = params
        session["phase"] = "searching"

    # Parse [BOOK: ...] trigger
    book_trigger = None
    book_match = re.search(r'\[BOOK:\s*([^\]]+)\]', response_text)
    if book_match:
        params = {}
        for part in book_match.group(1).split():
            if '=' in part:
                k, v = part.split('=', 1)
                params[k.strip()] = v.strip()
        book_trigger = params
        session["phase"] = "booking"

    # Strip [...] tags for TTS
    clean_text = re.sub(r'\[[^\]]+\]', '', response_text).strip()
    clean_text = re.sub(r'  +', ' ', clean_text)

    return {
        "session_id": session_id,
        "response_text": clean_text,
        "phase": session["phase"],
        "search_trigger": search_trigger,
        "book_trigger": book_trigger,
    }


def clear_session(session_id: str) -> None:
    _sessions.pop(session_id, None)
