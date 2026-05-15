"""Gemini via google-genai SDK. Import is deferred — google.genai does not support Python 3.14 yet."""
import asyncio
import os

from dotenv import load_dotenv

load_dotenv()

api_key = os.environ.get("GEMINI_API_KEY")
_client = None


def _get_client():
    """Lazy init so `from services.gemini import generate` works without loading google.genai at import."""
    global _client
    if _client is not None:
        return _client
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not set in the environment")
    try:
        from google import genai

        _client = genai.Client(api_key=api_key)
        return _client
    except Exception as e:
        raise RuntimeError(
            "Failed to load google.genai (use Python 3.11–3.13; 3.14 is not supported yet): "
            f"{e}"
        ) from e


async def generate(prompt: str, system_prompt: str = "") -> str:
    try:
        client = _get_client()
        loop = asyncio.get_event_loop()

        def _call():
            response = client.models.generate_content(
                model="gemini-2.0-flash",
                contents=prompt,
                config={"system_instruction": system_prompt},
            )
            return response.text

        return await loop.run_in_executor(None, _call)
    except Exception as e:
        raise RuntimeError(f"Gemini API error: {e}") from e
