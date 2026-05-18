"""Normalize and validate unified user profile fields (users/{uid})."""
import re
from typing import Any, Dict, List, Optional

USERNAME_RE = re.compile(r"^[a-zA-Z][a-zA-Z0-9_]{2,29}$")
PK_PHONE_RE = re.compile(r"^03\d{9}$")
CNIC_DIGITS_LEN = 13

# worker_data stores ONLY extra worker fields — never phone/cnic/username/name.


def normalize_username(raw: str) -> str:
    u = raw.strip().lower()
    if not USERNAME_RE.match(u):
        raise ValueError(
            "Username must be 3–30 characters, start with a letter, "
            "and use only letters, numbers, and underscores"
        )
    return u


def normalize_pk_phone(raw: str) -> str:
    digits = re.sub(r"\D", "", raw)
    if digits.startswith("92") and len(digits) >= 12:
        digits = "0" + digits[2:]
    if len(digits) == 10 and digits.startswith("3"):
        digits = "0" + digits
    if not PK_PHONE_RE.match(digits):
        raise ValueError("Phone must be Pakistan mobile format 03XXXXXXXXX (11 digits)")
    return digits


def normalize_cnic(raw: str) -> str:
    digits = re.sub(r"\D", "", raw)
    if len(digits) != CNIC_DIGITS_LEN:
        raise ValueError("CNIC must be exactly 13 digits")
    return digits


def sanitize_worker_data(raw: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Keep only extra worker fields; strip identity fields from nested blob."""
    if not raw or not isinstance(raw, dict):
        return {}

    specs = raw.get("specializations") or raw.get("skills") or []
    areas = raw.get("areas") or []
    out: Dict[str, Any] = {}

    if specs:
        out["specializations"] = list(specs) if isinstance(specs, list) else [specs]
    if areas:
        out["areas"] = list(areas) if isinstance(areas, list) else [areas]
    if raw.get("pricePerService") is not None:
        out["pricePerService"] = raw["pricePerService"]
    elif raw.get("price_per_service") is not None:
        out["pricePerService"] = raw["price_per_service"]
    if raw.get("experienceYears") is not None:
        out["experienceYears"] = raw["experienceYears"]
    elif raw.get("experience_years") is not None:
        out["experienceYears"] = raw["experience_years"]
    if raw.get("availability") is not None:
        out["availability"] = raw["availability"]
    if raw.get("rating") is not None:
        out["rating"] = raw["rating"]
    pid = raw.get("providerId") or raw.get("provider_id")
    if pid:
        out["providerId"] = pid

    return out


def mirror_profile_root_fields(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Ensure required identity fields live on users/{uid} root, not only in worker_data.
    Mutates a copy; recalculates profile_complete after normalization.
    """
    out = dict(data)
    wd = out.get("worker_data")
    wd_dict = wd if isinstance(wd, dict) else {}

    # Pull identity from worker_data if root empty (legacy / partial syncs).
    if not (out.get("phone") or "").strip() and wd_dict.get("phone"):
        out["phone"] = wd_dict["phone"]
    if not (out.get("cnic") or "").strip() and wd_dict.get("cnic"):
        out["cnic"] = wd_dict["cnic"]
    if not (out.get("username") or "").strip() and wd_dict.get("username"):
        out["username"] = wd_dict["username"]

    username = (out.get("username") or out.get("name") or "").strip()
    if username:
        out["username"] = username
        if not (out.get("name") or "").strip():
            out["name"] = username

    if not (out.get("city") or "").strip():
        areas: List[str] = list(out.get("areas") or wd_dict.get("areas") or [])
        if areas:
            out["city"] = areas[0]

    # Normalize root identity when present.
    if out.get("username"):
        try:
            out["username"] = normalize_username(str(out["username"]))
            out["name"] = out["username"]
        except ValueError:
            pass
    if out.get("phone"):
        try:
            out["phone"] = normalize_pk_phone(str(out["phone"]))
        except ValueError:
            pass
    if out.get("cnic"):
        try:
            out["cnic"] = normalize_cnic(str(out["cnic"]))
        except ValueError:
            pass

    out["worker_data"] = sanitize_worker_data(wd_dict)
    out["profile_complete"] = is_profile_complete(out)
    return out


def _effective_role(doc: Dict[str, Any]) -> Optional[str]:
    role = (doc.get("role") or "").strip().lower()
    if role in ("customer", "worker"):
        return role
    return None


def _worker_skills(doc: Dict[str, Any]) -> List[str]:
    skills = doc.get("skills") or []
    if isinstance(skills, list):
        out = [str(s).strip() for s in skills if s and str(s).strip()]
        if out:
            return out
    wd = doc.get("worker_data")
    if isinstance(wd, dict):
        specs = wd.get("specializations") or []
        if isinstance(specs, list):
            return [str(s).strip() for s in specs if s and str(s).strip()]
    return []


def profile_completion_issues(doc: Optional[Dict[str, Any]]) -> List[str]:
    """Role-based profile requirements for users/{uid}."""
    if not doc:
        return ["Profile not found. Sign in again."]

    role = _effective_role(doc)
    if not role:
        return ["Missing or invalid role (customer|worker)."]

    if role == "customer":
        name = (doc.get("username") or doc.get("name") or "").strip()
        if not name:
            return ["Add a display name or username to your profile."]
        email = (doc.get("email") or "").strip()
        if not email:
            return ["Email required on profile."]
        return []

    issues: List[str] = []
    username = (doc.get("username") or doc.get("name") or "").strip()
    if not username:
        issues.append("Username required.")
    else:
        try:
            normalize_username(username)
        except ValueError:
            issues.append("Username format invalid.")

    phone = (doc.get("phone") or "").strip()
    if not phone:
        issues.append("Phone required (Pakistan mobile 03XXXXXXXXX).")
    else:
        try:
            normalize_pk_phone(phone)
        except ValueError:
            issues.append("Phone format invalid.")

    cnic = (doc.get("cnic") or "").strip()
    if not cnic:
        issues.append("CNIC required (13 digits).")
    else:
        try:
            normalize_cnic(cnic)
        except ValueError:
            issues.append("CNIC format invalid.")

    if not _worker_skills(doc):
        issues.append("At least one skill required.")

    return issues


def is_profile_complete(doc: Optional[Dict[str, Any]]) -> bool:
    return len(profile_completion_issues(doc)) == 0
