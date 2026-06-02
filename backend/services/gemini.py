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

# ── Collect up to 15 API keys ─────────────────────────────────────────────────
_ALL_KEYS: list[str] = []
for _suffix in ["", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"]:
    _k = os.getenv(f"GOOGLE_GEMINI_API_KEY{_suffix}", "").strip()
    if _k and _k != "your_gemini_api_key" and _k.startswith("AIzaSy"):
        _ALL_KEYS.append(_k)
    elif _k and _k != "your_gemini_api_key":
        print(f"[gemini] skipping GOOGLE_GEMINI_API_KEY{_suffix} — invalid format (must start with AIzaSy)")

MOCK_MODE = len(_ALL_KEYS) == 0
_MODEL_NAME = "gemini-3.5-flash"

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


def _should_rotate(error: Exception) -> bool:
    """Rotate to next key on rate-limits AND access/permission errors."""
    s = str(error)
    return (
        "429" in s
        or "403" in s
        or "quota" in s.lower()
        or "rate" in s.lower()
        or "denied" in s.lower()
        or "permission" in s.lower()
        or "access" in s.lower()
    )


def _is_rate_limit(error: Exception) -> bool:
    s = str(error)
    return "429" in s or "quota" in s.lower() or "rate" in s.lower()


def _extract_response_text(response) -> str:
    """Extract only non-thought text from Gemini response.
    Gemini 2.5 Flash (thinking model) includes thought parts in response.candidates;
    response.text concatenates ALL parts including thinking — we want only the final answer."""
    try:
        text = ""
        for part in response.candidates[0].content.parts:
            if not getattr(part, "thought", False):
                text += getattr(part, "text", "")
        return text.strip() if text.strip() else response.text
    except Exception:
        return response.text


_GEMINI_TIMEOUT = 8.0  # seconds per key attempt — prevents SDK retry-loops from hanging


async def _try_generate(content) -> str:
    """Try all keys in sequence with timeout. Falls back to mock if all exhausted."""
    global _current_key_idx, MOCK_MODE

    tried = 0

    while tried < len(_ALL_KEYS):
        try:
            loop = asyncio.get_event_loop()
            response = await asyncio.wait_for(
                loop.run_in_executor(None, lambda: _model.generate_content(content)),
                timeout=_GEMINI_TIMEOUT,
            )
            return _extract_response_text(response)
        except asyncio.TimeoutError:
            print(f"[gemini] key #{_current_key_idx + 1} timed out after {_GEMINI_TIMEOUT}s")
        except Exception as e:
            print(f"[gemini] key #{_current_key_idx + 1} error: {e}")
        next_idx = _current_key_idx + 1
        if next_idx < len(_ALL_KEYS):
            print(f"[gemini] rotating to key #{next_idx + 1} of {len(_ALL_KEYS)}")
            _init_model(next_idx)
            tried += 1
        else:
            print(f"[gemini] all {len(_ALL_KEYS)} keys exhausted — falling back to mock")
            return None

    return None


async def generate_with_parts(parts: list) -> str:
    """Multimodal generation — used for audio STT.
    Uses _try_generate (gemini-2.5-flash) with key rotation + thought filtering.
    This was the original working implementation."""
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


async def generate_chat(
    history: list,
    system_prompt: str = "",
    init_hint: str = "",
) -> str:
    """Proper Gemini chat format — prevents history echo on gemini-2.5-flash thinking model.

    history: list of {"role": "user"|"assistant", "content": "..."} dicts.
    init_hint: Roman Urdu instruction when history is empty (__init__ turn).
    """
    if MOCK_MODE:
        mock_prompt = init_hint or (history[-1]["content"] if history else "")
        return _mock_gemini_response(mock_prompt, system_prompt)

    async def _do_generate() -> str | None:
        global _current_key_idx
        tried = 0
        while tried < len(_ALL_KEYS):
            try:
                # Build Content list: interleave user/model turns
                contents = []
                for entry in history:
                    role = "user" if entry["role"] == "user" else "model"
                    contents.append({"role": role, "parts": [{"text": entry["content"]}]})

                # If no history yet (__init__), use init_hint as user message
                if not contents and init_hint:
                    contents = [{"role": "user", "parts": [{"text": init_hint}]}]
                elif init_hint and contents[-1]["role"] != "user":
                    # Add init_hint as extra context after last model turn (shouldn't normally happen)
                    contents.append({"role": "user", "parts": [{"text": init_hint}]})

                loop = asyncio.get_event_loop()
                if system_prompt:
                    model_instance = genai.GenerativeModel(
                        _MODEL_NAME,
                        system_instruction=system_prompt,
                    )
                else:
                    model_instance = _model

                response = await asyncio.wait_for(
                    loop.run_in_executor(None, lambda m=model_instance, c=contents: m.generate_content(c)),
                    timeout=_GEMINI_TIMEOUT,
                )
                # Extract only non-thought parts (gemini-2.5-flash thinking model)
                text = ""
                try:
                    for part in response.candidates[0].content.parts:
                        if not getattr(part, "thought", False):
                            text += getattr(part, "text", "")
                except Exception:
                    text = response.text  # fallback for older SDK versions
                return text.strip() or None
            except asyncio.TimeoutError:
                print(f"[gemini] key #{_current_key_idx + 1} timed out after {_GEMINI_TIMEOUT}s")
                next_idx = _current_key_idx + 1
                if next_idx < len(_ALL_KEYS):
                    _init_model(next_idx)
                    tried += 1
                else:
                    return None
            except Exception as e:
                print(f"[gemini] key #{_current_key_idx + 1} error: {e}")
                next_idx = _current_key_idx + 1
                if next_idx < len(_ALL_KEYS):
                    print(f"[gemini] rotating to key #{next_idx + 1} of {len(_ALL_KEYS)}")
                    _init_model(next_idx)
                    tried += 1
                else:
                    print(f"[gemini] all {len(_ALL_KEYS)} keys exhausted — falling back to mock")
                    return None
            tried += 1
        return None

    result = await _do_generate()
    if not result:
        mock_prompt = init_hint or (history[-1]["content"] if history else "")
        return _mock_gemini_response(mock_prompt, system_prompt)
    return result


# ── Mock responses (fallback when all keys exhausted) ─────────────────────────

def _mock_gemini_response(prompt: str, system_prompt: str = "") -> str:
    sp_lower = system_prompt.lower()

    # Translation call — return input text unchanged so Uplift TTS still gets usable text.
    # Only apply when system_prompt clearly identifies a translation task, NOT a conversation.
    is_translation = (
        "translator" in sp_lower
        or "nastaliq" in sp_lower
        or (not system_prompt and "translate" in prompt.lower())
    )
    # "urdu script" check only if NOT a conversation agent (avoid false positives)
    if not is_translation and "urdu script" in sp_lower and "fatima" not in sp_lower and "[search:" not in sp_lower:
        is_translation = True
    if is_translation:
        # Return only plain text — strip any prompt wrapper lines like "Fatima: ..."
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
            "roman_urdu": "Assalam-o-Alaikum! Main Fatima hun, Haazir AI ki assistant. Batayiye, aaj kya chahiye — AC, plumber, ya koi aur service?\nURDU_TTS: السلام علیکم! میں فاطمہ ہوں، حاضر AI کی اسسٹنٹ۔ بتائیے، آج کیا چاہیے — AC، پلمبر، یا کوئی اور سروس؟",
            "urdu":       "السلام علیکم! میں فاطمہ ہوں — حاضر AI کی اسسٹنٹ۔ بتایئے، آج کیا سروس چاہیے؟",
            "sindhi":     "السلام عليکم! مان فاطمه آهيان — حاضر AI جي مددگار. ٻڌايو، اڄ ڪهڙي خدمت گهرجي؟",
            "pashto":     "السلام علیکم! زه فاطمه یم — د حاضر AI مرستیاله. ووایاست، نن ورځ کومه خدمت پکار ده؟",
            "balochi":    "السلام علیکم! من فاطمه ئن — حاضر AI ءِ مددگار۔ امروز کئی خدمت لازم ءُ؟",
        }
        _ASK_LOCATION = {
            "roman_urdu": "Achha! Kahan chahiye — area batao (jaise G-13, DHA)?\nURDU_TTS: اچھا! کہاں چاہیے — علاقہ بتائیں (جیسے G-13، DHA)؟",
            "urdu":       "اچھا! کہاں چاہیے — علاقہ بتائیں (جیسے G-13، DHA)؟",
            "sindhi":     "ٺيڪ آهي! ڪٿي گهرجي — علائقو ٻڌايو (جهڙوڪ DHA، Clifton)؟",
            "pashto":     "ښه! چیرته پکار ده — سیمه ووایاست (لکه DHA، F-7)؟",
            "balochi":    "خیر! کجا لازم ءُ — ناحیه بگوش (مثال DHA، Clifton)؟",
        }
        _SEARCH_CONFIRM = {
            "roman_urdu": "Theek hai, main abhi providers dhundh rahi hun!\nURDU_TTS: ٹھیک ہے، میں ابھی پروائیڈرز ڈھونڈ رہی ہوں!",
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
            "roman_urdu": "Theek hai! Yeh kaam urgent hai (aaj chahiye) ya baad mein schedule karein?\nURDU_TTS: ٹھیک ہے! یہ کام فوری چاہیے (آج) یا بعد میں شیڈول کریں؟",
            "urdu":       "ٹھیک ہے! یہ کام فوری چاہیے (آج) یا بعد میں شیڈول کریں؟",
            "sindhi":     "ٺيڪ آهي! هي ڪم فوري گهرجي (اڄ) يا پوءِ شيڊول ڪريو؟",
            "pashto":     "ښه! دا کار ژر پکار دی (نن) که وروسته شیډول کړو؟",
            "balochi":    "خیر! ایں کام ژلدی لازم ءُ (امروز) یا بعداً شیڈول کنیں؟",
        }

        has_service = any(svc in user_text for svc in ["ac", "plumb", "electric", "tutor", "carpent",
                                                        "mechanic", "cook", "maid", "garden", "painter",
                                                        "beautician", "beaut"])
        _karachi_areas = ["karachi", "clifton", "gulshan", "nazimabad", "korangi", "defence",
                          "saddar", "malir", "north karachi", "surjani", "lyari", "dha khi"]
        _lahore_areas = ["lahore", "gulberg", "johar town", "model town", "dha lahore", "bahria town", "cantt"]
        _isb_areas = ["islamabad", "rawalpindi", "g-", "f-", "i-", "e-7", "bahria isb"]
        has_location = any(kw in p_lower for kw in _karachi_areas + _lahore_areas + _isb_areas + ["sector", "dha", "bahria"])
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
                if any(kw in p_lower for kw in _karachi_areas): loc = "Karachi"
                elif any(kw in p_lower for kw in _lahore_areas): loc = "Lahore"
                urgency = "high" if any(kw in p_lower for kw in ["urgent", "aaj", "abhi", "jaldi", "fori", "emergency"]) else "medium"
                return f"[SEARCH: service={svc} location={loc} urgency={urgency}]\n{_SEARCH_CONFIRM[lang]}"
            return _ASK_LOCATION[lang]
        if "[results:" in p_lower:
            _results_resp = {
                "roman_urdu": "Yeh do options hain. Kise bulwana chahungi aapke liye?\nURDU_TTS: یہ دو آپشن ہیں۔ کسے بلوانا چاہیں گے آپ؟",
                "urdu":       "یہ دو آپشن ہیں۔ کسے بلوانا چاہیں گے آپ؟",
                "sindhi":     "هي ٻه آپشن آهن. ڪنهن کي سڏرائڻ چاهيو ٿا؟",
                "pashto":     "دا دوه انتخابونه دي. چا ته وغواړئ چې راشي؟",
                "balochi":    "ایں دو آپشن انت. کئی کس نا گشتیں؟",
            }
            return _results_resp[lang]
        if any(kw in p_lower for kw in ["pehle", "first", "han", "haan", "yes", "ok", "پهريون", "ها"]):
            return "[BOOK: provider_id=prov_001]\nBilkul, booking confirm kar rahi hun!\nURDU_TTS: بالکل، بکنگ کنفرم کر رہی ہوں!"
        _ask_more = {
            "roman_urdu": "Zaroor! Thoda aur batao — kya masla hai exactly?\nURDU_TTS: ضرور! تھوڑا اور بتائیں — مسئلہ کیا ہے بالکل؟",
            "urdu":       "ضرور! تھوڑا اور بتائیں — مسئلہ کیا ہے بالکل؟",
            "sindhi":     "ضرور! ٿورو وڌيڪ ٻڌايو — مسئلو ڇا آهي بلڪل؟",
            "pashto":     "حتماً! یو څه نور ووایاست — مسئله سم ولمانئ؟",
            "balochi":    "حتماً! کمی وتر بگوش — مسئله چیش ءُ دقیقاً؟",
        }
        return _ask_more[lang]

    return json.dumps({"response": "Mock OK", "prompt_preview": prompt[:80]})
