"""
Strict service category normalization for SAMAJH → DHUNDHO → API responses.

Additive fields on intent (no Firestore schema change):
  - normalized_category: canonical slug (e.g. ac_technician, plumber)
  - keywords: token hints from user text

Provider matching uses existing ``service`` + ``specialization`` fields only.
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

# Canonical categories used across agents and safeguards
NORMALIZED_CATEGORIES = frozenset(
    {
        "ac_technician",
        "plumber",
        "electrician",
        "tutor",
        "beautician",
        "carpenter",
        "painter",
        "mechanic",
        "cook",
        "maid",
        "gardener",
    }
)

_CATEGORY_LABELS: Dict[str, str] = {
    "ac_technician": "AC Technician",
    "plumber": "Plumber",
    "electrician": "Electrician",
    "tutor": "Tutor",
    "beautician": "Beautician",
    "carpenter": "Carpenter",
    "painter": "Painter",
    "mechanic": "Mechanic",
    "cook": "Cook",
    "maid": "Maid",
    "gardener": "Gardener",
}

# Provider ``service`` / specialization → category
_PROVIDER_SERVICE_MAP: tuple[tuple[str, str], ...] = (
    ("ac technician", "ac_technician"),
    ("ac repair", "ac_technician"),
    ("climate", "ac_technician"),
    ("cooling", "ac_technician"),
    ("plumber", "plumber"),
    ("plumbing", "plumber"),
    ("electrician", "electrician"),
    ("electric", "electrician"),
    ("wiring", "electrician"),
    ("tutor", "tutor"),
    ("teacher", "tutor"),
    ("tuition", "tutor"),
    ("beautician", "beautician"),
    ("beauty", "beautician"),
    ("salon", "beautician"),
    ("carpenter", "carpenter"),
    ("carpentry", "carpenter"),
    ("painter", "painter"),
    ("painting", "painter"),
    ("mechanic", "mechanic"),
    ("auto repair", "mechanic"),
    ("car repair", "mechanic"),
    ("cook", "cook"),
    ("cooking", "cook"),
    ("chef", "cook"),
    ("maid", "maid"),
    ("house help", "maid"),
    ("cleaning", "maid"),
    ("gardener", "gardener"),
    ("gardening", "gardener"),
    ("lawn", "gardener"),
)

# User text / SAMAJH labels → category (order: more specific first)
_TEXT_RULES: tuple[tuple[tuple[str, ...], str], ...] = (
    (("ac technician", "ac tech", "air condition", "aircondition", "gas refill", "split ac", "inverter"), "ac_technician"),
    (("ac repair", "a/c", "cooling", "gas refill"), "ac_technician"),
    (("plumber", "plumbing", "pipe", "drain", "tap", "tanki", "nal", "paani leak"), "plumber"),
    (("electrician", "electric", "bijli", "wiring", "ups", "short circuit"), "electrician"),
    (("tutor", "tuition", "teacher", "math", "science"), "tutor"),
    (("beautician", "beauty", "salon", "makeup", "hair", "threading"), "beautician"),
    (("carpenter", "carpentry", "furniture", "wood work"), "carpenter"),
    (("painter", "painting", "rang", "wall paint"), "painter"),
    (("mechanic", "auto repair", "car repair", "motorcycle repair", "engine", "gearbox", "tyre", "puncture", "oil change", "garage"), "mechanic"),
    (("cook", "chef", "cooking", "khana", "biryani", "catering", "daily meals", "food"), "cook"),
    (("maid", "house help", "kaam wali", "cleaning", "jhaadu", "pocha", "laundry", "safai"), "maid"),
    (("gardener", "gardening", "lawn", "plant", "tree trim", "garden"), "gardener"),
)


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").lower().strip())


def extract_keywords(text: str, *, limit: int = 12) -> List[str]:
    """Significant tokens from user input for traceability."""
    t = _norm(text)
    stop = {
        "a", "an", "the", "me", "mujhe", "chahiye", "hai", "ho", "ka", "ki", "ke",
        "ko", "se", "par", "aur", "for", "in", "on", "at", "to", "need", "want",
    }
    tokens = re.findall(r"[a-z0-9]+", t)
    out: List[str] = []
    for tok in tokens:
        if len(tok) < 2 or tok in stop:
            continue
        if tok not in out:
            out.append(tok)
        if len(out) >= limit:
            break
    return out


def normalize_category_from_text(*parts: str) -> Optional[str]:
    """Map free text / service_type label to a canonical category slug."""
    blob = _norm(" ".join(p for p in parts if p))
    if not blob:
        return None

    if re.search(r"(?<![a-z])ac(?![a-z])", blob) or "air condition" in blob or "technician" in blob and "ac" in blob:
        if any(k in blob for k in ("plumb", "electric", "tutor", "beaut", "carpent", "paint")):
            pass
        else:
            if "ac" in blob or "air condition" in blob or "cooling" in blob or "gas" in blob or "split" in blob:
                return "ac_technician"
            if "technician" in blob and not any(
                k in blob for k in ("plumb", "electric", "tutor", "beaut", "carpent", "paint")
            ):
                return "ac_technician"

    for phrases, category in _TEXT_RULES:
        for phrase in phrases:
            if phrase in blob:
                return category

    if re.search(r"(?<![a-z])ac(?![a-z])", blob) or "a/c" in blob:
        return "ac_technician"

    return None


def provider_normalized_category(provider: dict) -> Optional[str]:
    """Derive category from provider.service / specialization (no new Firestore fields)."""
    p_service = _norm(provider.get("service") or provider.get("service_type") or "")
    specs = " ".join(_norm(s) for s in (provider.get("specialization") or []))

    # Check primary service field first — avoids spec keywords overriding the service
    for needle, category in _PROVIDER_SERVICE_MAP:
        if needle in p_service:
            return category

    blob = f"{p_service} {specs}".strip()
    for needle, category in _PROVIDER_SERVICE_MAP:
        if needle in blob:
            return category

    return normalize_category_from_text(p_service, specs)


def provider_matches_category(provider: dict, category: Optional[str]) -> bool:
    """Strict: provider must map to the same normalized_category."""
    if not category or category not in NORMALIZED_CATEGORIES:
        return False
    pc = provider_normalized_category(provider)
    return pc == category


def filter_providers_by_category(
    providers: List[dict], category: Optional[str]
) -> List[dict]:
    if not category:
        return []
    return [p for p in providers if provider_matches_category(p, category)]


def enrich_intent(intent: dict, user_input: str = "") -> dict:
    """
    Ensure intent exposes normalized_category + keywords for downstream agents.
    Does not remove existing keys; safe for old clients.
    """
    out = dict(intent or {})
    service_type = (out.get("service_type") or "").strip()
    existing_kw = out.get("keywords")
    if isinstance(existing_kw, list):
        keywords = [str(k).strip() for k in existing_kw if str(k).strip()]
    else:
        keywords = extract_keywords(user_input)
        if service_type:
            keywords = extract_keywords(f"{user_input} {service_type}", limit=12)

    category = (out.get("normalized_category") or "").strip()
    if category not in NORMALIZED_CATEGORIES:
        category = normalize_category_from_text(service_type, user_input, " ".join(keywords)) or ""

    if category and category in NORMALIZED_CATEGORIES:
        out["normalized_category"] = category
        if not service_type:
            out["service_type"] = _CATEGORY_LABELS.get(category, category.replace("_", " ").title())
    else:
        out["normalized_category"] = None

    out["keywords"] = keywords
    return out


def intent_category(intent: dict) -> Optional[str]:
    """Resolved category for filtering (normalized_category preferred)."""
    intent = intent or {}
    cat = (intent.get("normalized_category") or "").strip()
    if cat in NORMALIZED_CATEGORIES:
        return cat
    return normalize_category_from_text(
        intent.get("service_type") or "",
        " ".join(intent.get("keywords") or []),
    )
