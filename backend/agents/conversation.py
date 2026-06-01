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
CRITICAL BOOKING RULE: NEVER write [BOOK: ...] in the same response as [SEARCH: ...]. The [BOOK: ...] tag can ONLY appear AFTER [RESULTS: ...] has been shown AND the user has explicitly named a provider AND given a payment method — these are separate conversation turns.
CRITICAL BOOKING RULE: Do NOT assume payment method or provider choice. Always wait for the user to explicitly state both before generating [BOOK: ...].
Keep responses SHORT — max 2 sentences. You are speaking, not typing.
NEVER ask for the user's name — they are already logged in."""

# Per-language system prompts
SYSTEM_PROMPTS: dict = {
    'roman_urdu': (
        "Tum Fatima ho — Haazir AI ki friendly female voice assistant. Pakistan mein ghar ki services ke liye.\n"
        "ZAROORI HUKUM: Sirf Roman Urdu likhna (English/Latin letters mein) — kabhi Urdu/Arabic/Hindi script mat likhna.\n"
        + _BASE_LOGIC
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
    user_city: str = None,
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
            "user_city": user_city or "",
        }

    session = _sessions[session_id]
    # Always refresh user_name / language / city in case they were empty on first init
    if user_name and not session.get("user_name"):
        session["user_name"] = user_name
    if user_city and not session.get("user_city"):
        session["user_city"] = user_city
    if language and language != 'roman_urdu':
        session["language"] = language  # persist so all turns use the same language
    stored_name = session.get("user_name", "")
    first_name = stored_name.split()[0] if stored_name else ""
    stored_city = session.get("user_city", "") or user_city or ""
    # Use session-stored language as fallback (handles cases where later turns omit it)
    language = session.get("language", language)

    # __init__ = first greeting — don't add as user turn
    if user_message != "__init__":
        session["history"].append({"role": "user", "content": user_message})

    # Inject provider results when search completes — append to last user turn
    results_injection = ""
    if providers:
        summary_parts = []
        for p in providers[:3]:
            summary_parts.append(
                f"{p.get('name', '?')} (Rating: {p.get('rating', '?')}, "
                f"Rate: Rs.{p.get('price_per_hour', p.get('base_rate', p.get('hourly_rate', 'N/A')))}, "
                f"ID: {p.get('id', '?')})"
            )
        results_injection = f" [RESULTS: {' | '.join(summary_parts)}]"
        session["phase"] = "confirming"

    base_prompt = SYSTEM_PROMPTS.get(language, SYSTEM_PROMPTS['roman_urdu'])
    if stored_city:
        city_hint = f"\nUser ka registered city: {stored_city}. Agar user apna exact area bataye (e.g. 'DHA', 'Gulshan'), tab bhi city {stored_city} hi use karna. Location poochne ki zaroorat nahi agar user ne area bata diya — seedha [SEARCH: ...] likho with location={stored_city} or the area they mentioned."
        system_prompt = base_prompt + city_hint
    else:
        system_prompt = base_prompt

    # Language-aware init hints — tells model the user's name and what to do,
    # written in the target language so the greeting matches from the first token.
    _INIT_WITH_NAME = {
        'roman_urdu': lambda n: f"(User ka naam: {n}. Naam le kar warmly greet karo, phir poocho kya service chahiye.)",
        'urdu':       lambda n: f"(صارف کا نام: {n}۔ نام لے کر گرمجوشی سے ملیں، پھر پوچھیں کیا سروس چاہیے۔)",
        'sindhi':     lambda n: f"(يوزر جو نالو: {n}. نالي سان گرمجوشيءَ سان ملو، پوءِ پڇو ڪهڙي خدمت گهرجي.)",
        'pashto':     lambda n: f"(د کارن نوم: {n}. د نوم سره ګرمه هرکلې وکړئ، بیا پوښتنه وکړئ کومه خدمت پکار ده.)",
        'balochi':    lambda n: f"(یوزر ءِ نام: {n}۔ نام گپتاں گرمیءَ سرا سلام کنیں، پشت کمی خدمت لازم ءُ۔)",
    }
    _INIT_NO_NAME = {
        'roman_urdu': "(Warmly greet karo, phir seedha poocho kya service chahiye — naam mat poocho.)",
        'urdu':       "(گرمجوشی سے سلام کریں، پھر پوچھیں کیا سروس چاہیے — نام مت پوچھیں۔)",
        'sindhi':     "(گرمجوشيءَ سان سلام ڪريو، پوءِ سڌو پڇو ڪهڙي خدمت گهرجي — نالو نه پڇجو.)",
        'pashto':     "(ګرمه هرکلې وکړئ، بیا مستقیم وپوښتئ کومه خدمت پکار ده — نوم مه پوښتئ.)",
        'balochi':    "(گرمیءَ سرا سلام کنیں، پشت سدا پرسیں کمی خدمت لازم ءُ — نام مه پرسیں۔)",
    }

    # Build text-completion prompt ending with "Fatima:" — forces model to complete
    # Fatima's next line rather than echoing the user. Proven reliable on all Gemini models.
    if user_message == "__init__":
        hint_fn = _INIT_WITH_NAME.get(language, _INIT_WITH_NAME['roman_urdu'])
        hint_no = _INIT_NO_NAME.get(language, _INIT_NO_NAME['roman_urdu'])
        if first_name:
            prompt = f"{hint_fn(first_name)}\nFatima:"
        else:
            prompt = f"{hint_no}\nFatima:"
    else:
        history_lines = []
        for m in session["history"][-12:]:  # last 12 turns keeps context tight
            role = "User" if m["role"] == "user" else "Fatima"
            history_lines.append(f"{role}: {m['content']}")
        history_text = "\n".join(history_lines)
        prompt = f"{history_text}{results_injection}\nFatima:"

    response_text = await generate(prompt, system_prompt=system_prompt)

    response_text = (response_text or "").strip()

    # Guard: if Gemini echoed the init instruction text, use hardcoded greeting
    if user_message == "__init__" and (
        "naam le kar warmly greet" in response_text.lower()
        or "warmly greet karo" in response_text.lower()
        or response_text.startswith("(User ka naam")
        or response_text.startswith("(Warmly greet")
    ):
        _GREETINGS_INIT = {
            'roman_urdu': f"Assalam-o-Alaikum{' ' + first_name + '!' if first_name else '!'} Main Fatima hun — Haazir AI ki assistant. Aaj kya chahiye?",
            'urdu':       f"السلام علیکم{' ' + first_name + '!' if first_name else '!'} میں فاطمہ ہوں۔ آج کیا سروس چاہیے؟",
            'sindhi':     f"السلام عليکم{' ' + first_name + '!' if first_name else '!'} مان فاطمه آهيان۔ اڄ ڪهڙي خدمت گهرجي؟",
            'pashto':     f"السلام علیکم{' ' + first_name + '!' if first_name else '!'} زه فاطمه یم۔ نن ورځ کومه خدمت پکار ده؟",
            'balochi':    f"السلام علیکم{' ' + first_name + '!' if first_name else '!'} من فاطمه ئن۔ امروز کئی خدمت لازم ءُ؟",
        }
        response_text = _GREETINGS_INIT.get(language, _GREETINGS_INIT['roman_urdu'])

    # Echo guard: Gemini sometimes acknowledges by echoing the user's message verbatim
    # without generating a [SEARCH: ...] tag. Detect and inject the correct trigger.
    if (
        user_message not in ("__init__",)
        and '[SEARCH:' not in response_text
        and '[BOOK:' not in response_text
        and response_text
        and response_text.strip().lower() == user_message.strip().lower()
    ):
        _u = user_message.lower()
        # Detect service keyword
        if 'plumb' in _u or 'nal' in _u or 'pipe' in _u:
            _svc = 'plumber'
        elif 'electric' in _u or 'bijli' in _u or 'wiring' in _u:
            _svc = 'electrician'
        elif 'mechanic' in _u or 'gaadi' in _u or 'car repair' in _u:
            _svc = 'mechanic'
        elif 'ac' in _u or 'air condition' in _u or 'cooling' in _u:
            _svc = 'AC_repair'
        elif 'cook' in _u or 'chef' in _u or 'khana' in _u:
            _svc = 'cook'
        elif 'maid' in _u or 'khaanasaaf' in _u or 'safai' in _u:
            _svc = 'maid'
        elif 'garden' in _u or 'baghban' in _u:
            _svc = 'gardener'
        elif 'tutor' in _u or 'teacher' in _u or 'teacher' in _u:
            _svc = 'tutor'
        elif 'carpent' in _u or 'wood' in _u or 'darwaza' in _u:
            _svc = 'carpenter'
        elif 'beaut' in _u or 'salon' in _u or 'mehendi' in _u:
            _svc = 'beautician'
        else:
            _svc = 'electrician'
        # Detect city
        if 'karachi' in _u or 'clifton' in _u or 'dha khi' in _u or 'gulshan' in _u:
            _loc = 'Karachi'
        elif 'lahore' in _u or 'gulberg' in _u or 'johar' in _u:
            _loc = 'Lahore'
        elif 'islamabad' in _u or 'rawalpindi' in _u or 'g-' in _u or 'f-' in _u or 'i-' in _u:
            _loc = 'Islamabad'
        else:
            _loc = stored_city or 'Islamabad'
        _confirm = {
            'roman_urdu': 'Theek hai, main abhi providers dhundh rahi hun!',
            'urdu': 'ٹھیک ہے، میں ابھی فراہم کنندگان تلاش کر رہی ہوں!',
            'sindhi': 'ٺيڪ آهي، مان هاڻي فراهم ڪندڙن کي ڳوليندي آهيان!',
            'pashto': 'سمه ده، زه اوس د چمتو کونکو لټول کوم!',
            'balochi': 'ٹھیک ءُ، من ھنا فراہم کنندگان گرد دنباک!',
        }
        response_text = (
            f"[SEARCH: service={_svc} location={_loc} urgency=medium]\n"
            + _confirm.get(language, _confirm['roman_urdu'])
        )

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
