"""
Run from repo backend root:

  py -3.13 -m agents.test_pipeline

(google-genai does not work on Python 3.14 yet — use 3.11–3.13 for live Gemini.)

Runs three HaazirPipeline scenarios and prints JSON summaries (status, total_found, pipeline_log).
"""
import asyncio
import json
import sys
from pathlib import Path

# Ensure `backend` is on sys.path when executed as a script
_BACKEND = Path(__file__).resolve().parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from agents.pipeline import HaazirPipeline


def _summarize(result: dict) -> dict:
    out = {
        "status": result.get("status"),
        "total_found": result.get("total_found"),
        "pipeline_log": result.get("pipeline_log"),
    }
    if result.get("status") == "clarification_needed":
        out["clarification_question"] = result.get("clarification_question")
    if result.get("status") == "error":
        out["stage"] = result.get("stage")
        out["message"] = result.get("message")
    return out


def _print_case(name: str, result: dict) -> None:
    print("\n" + "=" * 72)
    print(name)
    print("=" * 72)
    print(json.dumps(result, indent=2, ensure_ascii=False, default=str))
    print("\n--- Summary ---")
    print(json.dumps(_summarize(result), indent=2, ensure_ascii=False, default=str))


async def _run_all() -> None:
    pipe = HaazirPipeline()

    cases = [
        (
            "1) Normal — AC repair DHA Karachi kal subah",
            "Mujhe DHA Karachi mein AC repair chahiye kal subah",
        ),
        (
            "2) Emergency — gas leak F-7 Islamabad",
            "Gas leak ho gayi hai F-7 Islamabad mein emergency",
        ),
        (
            "3) Vague — expect clarification",
            "kuch theek karna hai",
        ),
    ]

    for title, text in cases:
        result = await pipe.run(text)
        _print_case(title, result)


def main() -> None:
    asyncio.run(_run_all())


if __name__ == "__main__":
    main()
