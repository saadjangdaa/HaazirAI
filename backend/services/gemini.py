import os
import re
import json
import asyncio

try:
    from google import genai as _google_genai
    from google.genai import types as _genai_types
    _NEW_SDK = True
except ImportError:
    _NEW_SDK = False

# Fallback to old SDK if new one not installed
if not _NEW_SDK:
    try:
        import google.generativeai as _old_genai
        _OLD_SDK = True
    except ImportError:
        _OLD_SDK = False
else:
    _OLD_SDK = False

# ── Collect up to 15 API keys — MAIN (paid) key goes first ───────────────────
_ALL_KEYS: list[str] = []
_main_key = os.getenv("GOOGLE_GEMINI_API_KEY_MAIN", "").strip()
if _main_key and _main_key != "your_gemini_api_key":
    _ALL_KEYS.append(_main_key)
for _suffix in ["", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"]:
    _k = os.getenv(f"GOOGLE_GEMINI_API_KEY{_suffix}", "").strip()
    if _k and _k not in ("your_gemini_api_key", "") and _k != _main_key:
        _ALL_KEYS.append(_k)

MOCK_MODE = len(_ALL_KEYS) == 0
_MODEL_NAME = "gemini-3.5-flash"
_GEMINI_TIMEOUT = 10.0

_current_key_idx = 0
_client = None  # google-genai Client


def _init_client(idx: int) -> bool:
    global _client, _current_key_idx
    if idx >= len(_ALL_KEYS):
        return False
    try:
        if _NEW_SDK:
            _client = _google_genai.Client(
                api_key=_ALL_KEYS[idx],
                http_options={"api_version": "v1"},
            )
        else:
            _old_genai.configure(api_key=_ALL_KEYS[idx])
        _current_key_idx = idx
        print(f"[gemini] using key #{idx + 1} of {len(_ALL_KEYS)}")
        return True
    except Exception as e:
        print(f"[gemini] key #{idx + 1} init error: {e}")
        return False


if not MOCK_MODE:
    if not _init_client(0):
        MOCK_MODE = True


def _call_generate(prompt: str, system_prompt: str = "") -> str:
    """Synchronous Gemini call — runs in executor."""
    full_content = f"{system_prompt}\n\n{prompt}" if system_prompt else prompt
    if _NEW_SDK and _client:
        response = _client.models.generate_content(
            model=_MODEL_NAME,
            contents=full_content,
        )
        return response.text or ""
    elif _OLD_SDK:
        import google.generativeai as _og
        model = _og.GenerativeModel(_MODEL_NAME)
        response = model.generate_content(full_content)
        return response.text or ""
    return ""


async def _try_generate(prompt: str, system_prompt: str = "") -> str | None:
    """Try all keys in sequence. Returns None → mock fallback."""
    global _current_key_idx

    tried = 0
    while tried < len(_ALL_KEYS):
        try:
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                None, lambda: _call_generate(prompt, system_prompt)
            )
            if result:
                return result
            raise ValueError("empty response")
        except Exception as e:
            print(f"[gemini] key #{_current_key_idx + 1} error: {e}")
            next_idx = _current_key_idx + 1
            if next_idx < len(_ALL_KEYS):
                print(f"[gemini] rotating to key #{next_idx + 1} of {len(_ALL_KEYS)}")
                _init_client(next_idx)
                tried += 1
            else:
                print(f"[gemini] all {len(_ALL_KEYS)} keys exhausted — falling back to mock")
                return None

    return None


async def generate_with_parts(parts: list) -> str:
    """Multimodal generation for audio STT."""
    if MOCK_MODE:
        return '{"text": "AC bilkul kaam nahi kar raha, kal subah repair chahiye", "detected_language": "roman_urdu", "confidence": 0.95}'

    tried = 0
    while tried < len(_ALL_KEYS):
        try:
            loop = asyncio.get_event_loop()

            def _do_multimodal():
                if _NEW_SDK and _client:
                    response = _client.models.generate_content(
                        model=_MODEL_NAME,
                        contents=parts,
                    )
                    return response.text or ""
                elif _OLD_SDK:
                    import google.generativeai as _og
                    model = _og.GenerativeModel(_MODEL_NAME)
                    response = model.generate_content(parts)
                    return response.text or ""
                return ""

            result = await loop.run_in_executor(None, _do_multimodal)
            if result:
                return result
        except Exception as e:
            print(f"[gemini] STT key #{_current_key_idx + 1} error: {e}")

        next_idx = _current_key_idx + 1
        if next_idx < len(_ALL_KEYS):
            _init_client(next_idx)
            tried += 1
        else:
            return '{"text": "", "detected_language": "unknown", "confidence": 0.0}'
    return '{"text": "", "detected_language": "unknown", "confidence": 0.0}'


async def generate(prompt: str, system_prompt: str = "") -> str:
    if MOCK_MODE:
        return _mock_gemini_response(prompt, system_prompt)
    result = await _try_generate(prompt, system_prompt)
    if result is None:
        return _mock_gemini_response(prompt, system_prompt)
    return result


async def generate_chat(
    history: list,
    system_prompt: str = "",
    init_hint: str = "",
) -> str:
    if MOCK_MODE:
        mock_prompt = init_hint or (history[-1]["content"] if history else "")
        return _mock_gemini_response(mock_prompt, system_prompt)

    # Build conversation prompt from history
    lines = []
    for entry in history:
        role = "User" if entry["role"] == "user" else "Assistant"
        lines.append(f"{role}: {entry['content']}")
    if init_hint:
        lines.append(f"User: {init_hint}")
    prompt = "\n".join(lines)

    result = await _try_generate(prompt, system_prompt)
    if not result:
        mock_prompt = init_hint or (history[-1]["content"] if history else "")
        return _mock_gemini_response(mock_prompt, system_prompt)
    return result


# ── Mock responses (fallback when all keys exhausted) ─────────────────────────

def _mock_gemini_response(prompt: str, system_prompt: str = "") -> str:
    sp_lower = system_prompt.lower()

    # Translation call — return input text unchanged so Uplift TTS still gets usable text.
    is_translation = (
        "translator" in sp_lower
        or "nastaliq" in sp_lower
        or (not system_prompt and "translate" in prompt.lower())
    )
    if not is_translation and "urdu script" in sp_lower and "fatima" not in sp_lower and "[search:" not in sp_lower:
        is_translation = True
    if is_translation:
        lines = [l for l in prompt.strip().splitlines() if not l.strip().lower().startswith(("fatima:", "user:"))]
        return " ".join(lines).strip() or prompt.strip()

    if "samajh" in sp_lower or ("extract" in sp_lower and "service" in sp_lower):
        p_lower = prompt.lower()
        service = "AC repair"
        if "plumb" in p_lower or "nal" in p_lower:
            service = "plumber"
        elif "electric" in p_lower or "bijli" in p_lower:
            service = "electrician"
        elif "tutor" in p_lower or "math" in p_lower:
            service = "tutor"
        elif "beauty" in p_lower or "salon" in p_lower:
            service = "beautician"
        elif "carpent" in p_lower or "furniture" in p_lower:
            service = "carpenter"
        city = "Islamabad"
        _karachi_kw = ["karachi", "clifton", "gulshan", "nazimabad", "korangi", "dha khi",
                       "defence", "saddar", "malir", "north karachi", "surjani", "lyari"]
        _lahore_kw = ["lahore", "gulberg", "johar town", "model town", "dha lahore", "bahria town"]
        if any(kw in p_lower for kw in _karachi_kw): city = "Karachi"
        elif any(kw in p_lower for kw in _lahore_kw): city = "Lahore"
        is_emergency = any(kw in p_lower for kw in ["gas leak", "aag", "fire", "emergency"])
        return json.dumps({
            "service_type": service, "location": city, "city": city,
            "time_preference": "tomorrow_morning",
            "urgency": "critical" if is_emergency else "high",
            "budget_sensitivity": "high", "job_complexity": "intermediate",
            "emergency": is_emergency, "confidence_score": 0.92,
            "clarification_needed": False, "clarification_question": None,
            "detected_language": "roman_urdu", "special_requirements": None,
        })

    if "jhagra" in sp_lower or "dispute" in sp_lower:
        return json.dumps({
            "resolution": "Refund approved based on provider no-show",
            "refund_amount": 1200, "provider_penalty": "warning_issued",
            "case_summary": "Provider failed to arrive. Full refund approved.",
            "escalated_to_human": False,
        })

    if "hisaab" in sp_lower or "pricing" in sp_lower:
        return json.dumps({
            "estimated_hours": 2, "surge_factor": 1.0,
            "notes": "Standard rate applies.",
        })

    is_conversation = (
        "[search:" in sp_lower
        or "never ask for the user" in sp_lower
        or "fatima" in sp_lower
        or "فاطمه" in system_prompt
        or "فاطمہ" in system_prompt
    )
    if is_conversation:
        if "توهان فاطمه" in system_prompt:
            lang = "sindhi"
        elif "آپ فاطمہ" in system_prompt:
            lang = "urdu"
        elif "تاسو فاطمه" in system_prompt:
            lang = "pashto"
        elif "تو فاطمه" in system_prompt:
            lang = "balochi"
        else:
            lang = "roman_urdu"

        _GREETINGS = {
            "roman_urdu": "Assalam-o-Alaikum! Main Fatima hun, Haazir AI ki assistant. Batayiye, aaj kya chahiye — AC, plumber, ya koi aur service?",
            "urdu":       "السلام علیکم! میں فاطمہ ہوں — حاضر AI کی اسسٹنٹ۔ بتایئے، آج کیا سروس چاہیے؟",
            "sindhi":     "السلام عليکم! مان فاطمه آهيان — حاضر AI جي مددگار. ٻڌايو، اڄ ڪهڙي خدمت گهرجي؟",
            "pashto":     "السلام علیکم! زه فاطمه یم — د حاضر AI مرستیاله. ووایاست، نن ورځ کومه خدمت پکار ده؟",
            "balochi":    "السلام علیکم! من فاطمه ئن — حاضر AI ءِ مددگار۔ امروز کئی خدمت لازم ءُ؟",
        }
        _ASK_LOCATION = {
            "roman_urdu": "Achha! Kahan chahiye — area batao (jaise Clifton, DHA, G-13)?",
            "urdu":       "اچھا! کہاں چاہیے — علاقہ بتائیں؟",
            "sindhi":     "ٺيڪ آهي! ڪٿي گهرجي — علائقو ٻڌايو؟",
            "pashto":     "ښه! چیرته پکار ده — سیمه ووایاست؟",
            "balochi":    "خیر! کجا لازم ءُ — ناحیه بگوش؟",
        }
        _SEARCH_CONFIRM = {
            "roman_urdu": "Theek hai, main abhi providers dhundh rahi hun!",
            "urdu":       "ٹھیک ہے، میں ابھی پرووائیڈرز ڈھونڈ رہی ہوں!",
            "sindhi":     "ٺيڪ آهي، مان هاڻي مددگار ڳولي رهي آهيان!",
            "pashto":     "ښه، زه اوس چمتو کوونکي لټوم!",
            "balochi":    "خیر، من ایستاک خدمتگار گردانی!",
        }
        _ASK_URGENCY = {
            "roman_urdu": "Theek hai! Yeh kaam urgent hai (aaj chahiye) ya baad mein schedule karein?",
            "urdu":       "ٹھیک ہے! یہ کام فوری چاہیے (آج) یا بعد میں شیڈول کریں؟",
            "sindhi":     "ٺيڪ آهي! هي ڪم فوري گهرجي (اڄ) يا پوءِ شيڊول ڪريو؟",
            "pashto":     "ښه! دا کار ژر پکار دی (نن) که وروسته شیډول کړو؟",
            "balochi":    "خیر! ایں کام ژلدی لازم ءُ (امروز) یا بعداً شیڈول کنیں؟",
        }

        p_lower = prompt.lower()
        is_init = "user:" not in p_lower and "greet" in p_lower
        if is_init:
            return _GREETINGS[lang]

        user_lines = [
            line for line in prompt.splitlines()
            if line.strip().lower().startswith("user:")
        ]
        user_text = user_lines[-1].split(":", 1)[-1].lower() if user_lines else p_lower

        has_service = any(svc in user_text for svc in ["ac", "plumb", "electric", "tutor", "carpent",
                                                        "mechanic", "cook", "maid", "garden", "painter",
                                                        "beautician", "beaut"])
        _karachi_areas = ["karachi", "clifton", "gulshan", "nazimabad", "korangi", "defence",
                          "saddar", "malir", "north karachi", "surjani", "lyari", "dha khi"]
        _lahore_areas = ["lahore", "gulberg", "johar town", "model town", "dha lahore", "bahria town", "cantt"]
        _isb_areas = ["islamabad", "rawalpindi", "g-", "f-", "i-", "e-7"]
        has_location = any(kw in p_lower for kw in _karachi_areas + _lahore_areas + _isb_areas + ["sector", "dha", "bahria"])
        has_urgency = any(kw in p_lower for kw in [
            "urgent", "aaj", "abhi", "jaldi", "fori", "emergency",
            "baad", "kal", "schedule", "later", "high", "medium", "low",
        ])

        if has_service:
            if has_location:
                if not has_urgency:
                    return _ASK_URGENCY[lang]
                svc = "AC_repair"
                if "plumb" in user_text or "nal" in user_text: svc = "plumber"
                elif "electric" in user_text or "bijli" in user_text: svc = "electrician"
                elif "tutor" in user_text or "teacher" in user_text: svc = "tutor"
                elif "mechanic" in user_text or "car" in user_text: svc = "mechanic"
                elif "cook" in user_text or "chef" in user_text: svc = "cook"
                elif "maid" in user_text or "safai" in user_text: svc = "maid"
                elif "garden" in user_text or "lawn" in user_text: svc = "gardener"
                elif "paint" in user_text: svc = "painter"
                elif "beaut" in user_text or "salon" in user_text: svc = "beautician"
                loc = "Islamabad"
                if any(kw in p_lower for kw in _karachi_areas): loc = "Karachi"
                elif any(kw in p_lower for kw in _lahore_areas): loc = "Lahore"
                urgency = "high" if any(kw in p_lower for kw in ["urgent", "aaj", "abhi", "jaldi", "fori", "emergency"]) else "medium"
                return f"[SEARCH: service={svc} location={loc} urgency={urgency}]\n{_SEARCH_CONFIRM[lang]}"
            return _ASK_LOCATION[lang]
        if "[results:" in p_lower:
            _results_resp = {
                "roman_urdu": "Yeh do options hain. Kise bulwana chahungi aapke liye?",
                "urdu":       "یہ دو آپشن ہیں۔ کسے بلوانا چاہیں گے آپ؟",
                "sindhi":     "هي ٻه آپشن آهن. ڪنهن کي سڏرائڻ چاهيو ٿا؟",
                "pashto":     "دا دوه انتخابونه دي. چا ته وغواړئ چې راشي؟",
                "balochi":    "ایں دو آپشن انت. کئی کس نا گشتیں؟",
            }
            return _results_resp[lang]
        if any(kw in p_lower for kw in ["pehle", "first", "han", "haan", "yes", "ok", "پهريون", "ها"]):
            return "[BOOK: provider_id=prov_001]\nBilkul, booking confirm kar rahi hun!"
        _ask_more = {
            "roman_urdu": "Zaroor! Thoda aur batao — kya masla hai exactly?",
            "urdu":       "ضرور! تھوڑا اور بتائیں — مسئلہ کیا ہے بالکل؟",
            "sindhi":     "ضرور! ٿورو وڌيڪ ٻڌايو — مسئلو ڇا آهي بلڪل؟",
            "pashto":     "حتماً! یو څه نور ووایاست — مسئله سم ولمانئ؟",
            "balochi":    "حتماً! کمی وتر بگوش — مسئله چیش ءُ دقیقاً؟",
        }
        return _ask_more[lang]

    return json.dumps({"response": "Mock OK", "prompt_preview": prompt[:80]})
