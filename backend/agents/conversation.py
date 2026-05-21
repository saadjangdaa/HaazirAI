"""BAAT-CHEET: Conversational AI agent — Fatima (female persona), multi-turn dialogue."""
import re
from services.gemini import generate

_BASE_LOGIC = """
Your job — in this order:
1. First turn: if user_name given say greeting with name, ask what service is needed. If no name, just greet and ask.
2. If user already mentioned service, only ask for location.
3. When service known but location unknown, ONLY ask: where to send the worker?
4. When service + location known but urgency unknown, ask ONE question: is this urgent (needed today/now) or can it wait (schedule for later)?
5. Ask only ONE question at a time.
6. When service + location + urgency are ALL known, write EXACTLY on a new line (always in English/ASCII — never translate this tag):
   [SEARCH: service=X location=Y urgency=Z]
   Where X is the service in English (e.g. mechanic, plumber, electrician, AC repair, tutor, carpenter, beautician).
   Where Z is "high" for urgent/today, "medium" for later/scheduled.
   Use the EXACT English service word the user requested — do NOT substitute a different service.
   Then say you are searching for providers (in your response language).
7. When [RESULTS: ...] arrive, mention top 2 providers with name and rate, ask which they prefer.
8. When user picks a provider, ask: cash or JazzCash/Easypaisa?
9. When payment method given, say details then write EXACTLY on a new line (always in English/ASCII):
   [BOOK: provider_id=X payment=Y]
   Then confirm booking. All in ONE response.

CRITICAL: The [SEARCH: ...] and [BOOK: ...] tags MUST always be written in plain English/ASCII characters exactly as shown above — NEVER translate or replace these tags, even if your response language is Urdu/Sindhi/Pashto/Balochi.
Keep responses SHORT — max 2 sentences. You are speaking, not typing.
NEVER ask for the user's name — they are already logged in."""

# Per-language system prompts
SYSTEM_PROMPTS: dict = {
    'roman_urdu': (
        "Tum Fatima ho — Haazir AI ki friendly female voice assistant. Pakistan mein ghar ki services ke liye.\n"
        "ZAROORI HUKUM: Sirf Roman Urdu likhna (English/Latin letters mein) — kabhi Urdu/Arabic/Hindi script mat likhna.\n"
        + _BASE_LOGIC +
        "\n\nIMPORTANT TTS RULE: After your Roman Urdu response, add ONE final line starting with exactly 'URDU_TTS: ' "
        "followed by your COMPLETE response translated into pure Urdu script (Nastaliq). "
        "This line is for the voice engine only — never shown to the user. "
        "Example:\nAchha! Kahan chahiye — area batao?\nURDU_TTS: اچھا! کہاں چاہیے — علاقہ بتائیں؟"
    ),
    'urdu': (
        "آپ فاطمہ ہیں — حاضر AI کی دوستانہ خاتون وائس اسسٹنٹ۔ پاکستان میں گھریلو خدمات کے لیے۔\n"
        "لازمی قاعدہ: صرف اردو رسم الخط (نستعلیق) میں لکھیں — Roman Urdu یا انگریزی مت لکھیں۔\n"
        + _BASE_LOGIC
    ),
    'sindhi': (
        "توهان فاطمه آهيو — حاضر AI جي دوستاڻي آواز اسسٽنٽ. پاڪستان ۾ گهر جي خدمتن لاءِ.\n"
        "لازمي قاعدو: فقط سنڌي اسڪرپٽ ۾ لکو — ٻي ڪا به ٻولي يا رسم الخط نه.\n"
        + _BASE_LOGIC
    ),
    'pashto': (
        "تاسو فاطمه یاست — د حاضر AI دوستانه غږیز مرستیاله. د پاکستان د کور خدماتو لپاره.\n"
        "لازمي قاعده: یوازې پښتو لیکلو (پښتو رسم الخط) کې ولیکئ — بله ژبه مه کاروئ.\n"
        + _BASE_LOGIC
    ),
    'balochi': (
        "تو فاطمه ای — حاضر AI ءِ دوستین آواز اسسٹنٹ۔ پاکستان ءِ گھر ءِ خدمتان لئی۔\n"
        "لازمی قانون: فقط بلوچی رسم الخط میں لکھو — کوئی اور زبان یا رسم الخط نہیں۔\n"
        + _BASE_LOGIC
    ),
}

_sessions: dict = {}


async def run_conversation(
    session_id: str,
    user_message: str,
    providers: list = None,
    user_name: str = None,
    history: list = None,
    language: str = 'roman_urdu',
) -> dict:
    session_lost = session_id not in _sessions
    if session_lost:
        # Restore from client-provided history (handles Render worker restarts).
        # Strip any trailing entry that matches the current user_message — frontend may
        # still send currentHistory from older builds, and we must not duplicate it.
        restored_history = []
        if history:
            for entry in history:
                role = entry.get("role", "user")
                content = (entry.get("content") or "").strip()
                if content:
                    restored_history.append({"role": role, "content": content})
        # Drop last entry if it's a user turn matching current message (dedup guard)
        if (
            restored_history
            and restored_history[-1]["role"] == "user"
            and restored_history[-1]["content"] == (user_message or "").strip()
        ):
            restored_history = restored_history[:-1]
        _sessions[session_id] = {
            "history": restored_history,
            "phase": "intake",
            "user_name": user_name or "",
            "language": language,
        }

    session = _sessions[session_id]
    # Always refresh user_name / language in case they were empty on first init
    if user_name and not session.get("user_name"):
        session["user_name"] = user_name
    if language and language != 'roman_urdu':
        session["language"] = language  # persist so all turns use the same language
    stored_name = session.get("user_name", "")
    first_name = stored_name.split()[0] if stored_name else ""
    # Use session-stored language as fallback (handles cases where later turns omit it)
    language = session.get("language", language)

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
                f"Rate: Rs.{p.get('price_per_hour', p.get('base_rate', p.get('hourly_rate', 'N/A')))}, "
                f"ID: {p.get('id', '?')})"
            )
        results_injection = f"\n[RESULTS: {' | '.join(summary_parts)}]"
        session["phase"] = "confirming"

    # Build prompt — use English instructions so they don't override the language system prompt
    if user_message == "__init__":
        if first_name:
            prompt = f"(Greet the user by name '{first_name}', then ask what service they need. Respond in the language specified by your system instructions.)\nFatima:"
        else:
            prompt = "(Greet the user warmly, then ask what service they need. Respond in the language specified by your system instructions.)\nFatima:"
    elif history_text:
        prompt = f"{history_text}{results_injection}\nFatima:"
    else:
        prompt = "Fatima:"

    system_prompt = SYSTEM_PROMPTS.get(language, SYSTEM_PROMPTS['roman_urdu'])
    response_text = await generate(prompt, system_prompt=system_prompt)
    response_text = response_text.strip()

    # Safety: if Gemini returned raw JSON, use a language-appropriate fallback
    if response_text.startswith('{') and '"response"' in response_text:
        _FALLBACK = {
            'roman_urdu': "Main Fatima hun, Haazir AI ki assistant. Batayiye, aaj kya chahiye?",
            'urdu':       "میں فاطمہ ہوں — حاضر AI کی اسسٹنٹ۔ بتایئے، آج کیا چاہیے؟",
            'sindhi':     "مان فاطمه آهيان — حاضر AI جي مددگار. ٻڌايو، اڄ ڪهڙي خدمت گهرجي؟",
            'pashto':     "زه فاطمه یم — د حاضر AI مرستیاله. ووایاست، نن ورځ کومه خدمت پکار ده؟",
            'balochi':    "من فاطمه ئن — حاضر AI ءِ مددگار۔ امروز کئی خدمت لازم ءُ؟",
        }
        _SALAAM = {
            'roman_urdu': "Assalam-o-Alaikum",
            'urdu': "السلام علیکم",
            'sindhi': "السلام عليکم",
            'pashto': "السلام علیکم",
            'balochi': "السلام علیکم",
        }
        sal = _SALAAM.get(language, "Assalam-o-Alaikum")
        name_part = f" {first_name}!" if first_name else "!"
        response_text = f"{sal}{name_part} {_FALLBACK.get(language, _FALLBACK['roman_urdu'])}"

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

    # Extract URDU_TTS: line (Urdu script for voice, roman_urdu mode only)
    tts_text = None
    tts_match = re.search(r'URDU_TTS:\s*(.+)', response_text)
    if tts_match:
        tts_text = tts_match.group(1).strip()
        # Remove the URDU_TTS line from the display text
        response_text = re.sub(r'\nURDU_TTS:.*', '', response_text).strip()

    # Strip [...] tags for display
    clean_text = re.sub(r'\[[^\]]+\]', '', response_text).strip()
    clean_text = re.sub(r'  +', ' ', clean_text)

    # Strip [...] tags from tts_text too if present
    if tts_text:
        tts_text = re.sub(r'\[[^\]]+\]', '', tts_text).strip()

    return {
        "session_id": session_id,
        "response_text": clean_text,
        "tts_text": tts_text,
        "phase": session["phase"],
        "search_trigger": search_trigger,
        "book_trigger": book_trigger,
    }


def clear_session(session_id: str) -> None:
    _sessions.pop(session_id, None)
