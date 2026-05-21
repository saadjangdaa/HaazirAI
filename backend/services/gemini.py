import os
import re
import json
import asyncio
import google.generativeai as genai

try:
    from config import config

    GEMINI_API_KEY = (config.GEMINI_API_KEY or "").strip()
    _GEMINI_MODEL = getattr(config, "GEMINI_MODEL", None) or "gemini-2.0-flash"
except ImportError:
    GEMINI_API_KEY = os.getenv("GOOGLE_GEMINI_API_KEY", "") or os.getenv("GEMINI_API_KEY", "")
    _GEMINI_MODEL = "gemini-2.0-flash"

# ── Collect up to 5 API keys ──────────────────────────────────────────────────
_ALL_KEYS: list[str] = []
for _suffix in ["", "2", "3", "4", "5"]:
    _k = os.getenv(f"GOOGLE_GEMINI_API_KEY{_suffix}", "").strip()
    if _k and _k != "your_gemini_api_key":
        _ALL_KEYS.append(_k)

MOCK_MODE = len(_ALL_KEYS) == 0
_MODEL_NAME = "gemini-2.5-flash"

_current_key_idx = 0
_model: genai.GenerativeModel | None = None


def _init_model(idx: int) -> bool:
    global _model, _current_key_idx
    if idx >= len(_ALL_KEYS):
        return False
    try:
        genai.configure(api_key=_ALL_KEYS[idx])
        _model = genai.GenerativeModel(_MODEL_NAME)
        _current_key_idx = idx
        print(f"[gemini] using key #{idx + 1} of {len(_ALL_KEYS)}")
        return True
    except Exception as e:
        print(f"[gemini] key #{idx + 1} init error: {e}")
        return False


if not MOCK_MODE:
    if not _init_model(0):
        MOCK_MODE = True


def _is_rate_limit(error: Exception) -> bool:
    s = str(error)
    return "429" in s or "quota" in s.lower() or "rate" in s.lower()


async def _try_generate(content) -> str:
    """Try all keys in sequence, rotating on 429. Falls back to mock if all exhausted."""
    global _current_key_idx, MOCK_MODE

    start = _current_key_idx
    tried = 0

    while tried < len(_ALL_KEYS):
        try:
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None, lambda: _model.generate_content(content)
            )
            return response.text
        except Exception as e:
            if _is_rate_limit(e):
                next_idx = _current_key_idx + 1
                if next_idx < len(_ALL_KEYS):
                    print(f"[gemini] key #{_current_key_idx + 1} rate-limited → switching to key #{next_idx + 1}")
                    _init_model(next_idx)
                    tried += 1
                else:
                    print("[gemini] all keys rate-limited — falling back to mock")
                    return None  # signal caller to use mock
            else:
                print(f"[gemini] API error: {e} — falling back to mock")
                return None

    return None


async def generate_with_parts(parts: list) -> str:
    """Multimodal generation — used for audio STT."""
    if MOCK_MODE:
        return '{"text": "AC bilkul kaam nahi kar raha, kal subah repair chahiye", "detected_language": "roman_urdu", "confidence": 0.95}'
    result = await _try_generate(parts)
    if result is None:
        return '{"text": "", "detected_language": "unknown", "confidence": 0.0}'
    return result


async def generate(prompt: str, system_prompt: str = "") -> str:
    if MOCK_MODE:
        return _mock_gemini_response(prompt, system_prompt)
    full_prompt = f"{system_prompt}\n\n{prompt}" if system_prompt else prompt
    result = await _try_generate(full_prompt)
    if result is None:
        return _mock_gemini_response(prompt, system_prompt)
    return result


# ── Mock responses (fallback when all keys exhausted) ─────────────────────────

def _mock_gemini_response(prompt: str, system_prompt: str = "") -> str:
    sp_lower = system_prompt.lower()

    # Translation call — return input text unchanged so Uplift TTS still gets usable text
    if (
        "translator" in sp_lower
        or "urdu script" in sp_lower
        or "nastaliq" in sp_lower
        or (not system_prompt and "translate" in prompt.lower())
    ):
        parts = prompt.strip().split('\n\n')
        return parts[-1] if parts else prompt

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
        if "karachi" in p_lower: city = "Karachi"
        elif "lahore" in p_lower: city = "Lahore"
        is_emergency = any(kw in p_lower for kw in ["gas leak", "aag", "fire", "emergency"])
        return json.dumps({
            "service_type": service, "location": "G-13", "city": city,
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

    # Conversation agent mock (Fatima persona)
    # Detection: _BASE_LOGIC is always English, so "[search:" appears in all language system prompts
    is_conversation = (
        "[search:" in sp_lower
        or "never ask for the user" in sp_lower
        or "fatima" in sp_lower
        or "فاطمه" in system_prompt
        or "فاطمہ" in system_prompt
    )
    if is_conversation:
        # Detect language from system prompt prefix (Arabic script not lowercased)
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
            "roman_urdu": "Achha! Kahan chahiye — area batao (jaise G-13, DHA)?",
            "urdu":       "اچھا! کہاں چاہیے — علاقہ بتائیں (جیسے G-13، DHA)؟",
            "sindhi":     "ٺيڪ آهي! ڪٿي گهرجي — علائقو ٻڌايو (جهڙوڪ DHA، Clifton)؟",
            "pashto":     "ښه! چیرته پکار ده — سیمه ووایاست (لکه DHA، F-7)؟",
            "balochi":    "خیر! کجا لازم ءُ — ناحیه بگوش (مثال DHA، Clifton)؟",
        }
        _SEARCH_CONFIRM = {
            "roman_urdu": "Theek hai, main abhi providers dhundh rahi hun!",
            "urdu":       "ٹھیک ہے، میں ابھی پرووائیڈرز ڈھونڈ رہی ہوں!",
            "sindhi":     "ٺيڪ آهي، مان هاڻي مددگار ڳولي رهي آهيان!",
            "pashto":     "ښه، زه اوس چمتو کوونکي لټوم!",
            "balochi":    "خیر، من ایستاک خدمتگار گردانی!",
        }

        p_lower = prompt.lower()
        # Only return greeting if this is truly the __init__ turn (no prior User: lines)
        is_init = "user:" not in p_lower and "greet" in p_lower
        if is_init:
            return _GREETINGS[lang]

        # Extract only the last User: line so Fatima's own greeting
        # ("AC, plumber, ya koi aur service?") doesn't poison service detection.
        user_lines = [
            line for line in prompt.splitlines()
            if line.strip().lower().startswith("user:")
        ]
        user_text = user_lines[-1].split(":", 1)[-1].lower() if user_lines else p_lower

        _ASK_URGENCY = {
            "roman_urdu": "Theek hai! Yeh kaam urgent hai (aaj chahiye) ya baad mein schedule karein?",
            "urdu":       "ٹھیک ہے! یہ کام فوری چاہیے (آج) یا بعد میں شیڈول کریں؟",
            "sindhi":     "ٺيڪ آهي! هي ڪم فوري گهرجي (اڄ) يا پوءِ شيڊول ڪريو؟",
            "pashto":     "ښه! دا کار ژر پکار دی (نن) که وروسته شیډول کړو؟",
            "balochi":    "خیر! ایں کام ژلدی لازم ءُ (امروز) یا بعداً شیڈول کنیں؟",
        }

        has_service = any(svc in user_text for svc in ["ac", "plumb", "electric", "tutor", "carpent",
                                                        "mechanic", "cook", "maid", "garden", "painter",
                                                        "beautician", "beaut"])
        has_location = any(loc in p_lower for loc in ["g-", "dha", "f-", "islamabad", "karachi",
                                                       "lahore", "sector", "clifton", "gulshan",
                                                       "bahria", "gulberg"])
        has_urgency = any(kw in p_lower for kw in [
            "urgent", "aaj", "abhi", "jaldi", "fori", "emergency",
            "baad", "kal", "schedule", "later", "high", "medium", "low",
        ])

        if has_service:
            if has_location:
                if not has_urgency:
                    return _ASK_URGENCY[lang]
                # All three known — trigger search
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
                if "karachi" in p_lower or "clifton" in p_lower or ("dha" in p_lower and "karachi" in p_lower): loc = "Karachi"
                elif "lahore" in p_lower or "gulberg" in p_lower: loc = "Lahore"
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
