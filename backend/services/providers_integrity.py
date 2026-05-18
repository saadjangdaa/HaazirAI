"""Step 4 — providers/{provider_id} data integrity and API shape."""
from typing import Any, Dict, List, Optional, Set, Tuple

PROVIDER_CANONICAL_FIELDS = (
    "provider_id",
    "name",
    "service",
    "city",
    "area",
    "rating",
    "available",
    "trust_score",
)

# Minimum fields agents/ranking expect beyond canonical set.
AGENT_FIELDS = ("id", "price_per_hour", "lat", "lng", "specialization")


def resolve_provider_id(doc_id: str, data: Dict[str, Any]) -> str:
    return (doc_id or data.get("provider_id") or data.get("id") or "").strip()


def derive_trust_score(data: Dict[str, Any]) -> float:
    """Fallback when trust_score missing — approximate from rating."""
    ts = data.get("trust_score")
    if ts is not None and ts != "":
        return max(0.0, min(1.0, float(ts)))
    rating = float(data.get("rating", 0) or 0)
    if rating <= 0:
        return 0.5
    return max(0.0, min(1.0, round((rating - 1.0) / 4.0, 3)))


def format_provider_record(data: Dict[str, Any], doc_id: Optional[str] = None) -> Dict[str, Any]:
    """Normalize provider dict for API + agent consumption (always has `id`)."""
    pid = resolve_provider_id(doc_id or "", data)
    out: Dict[str, Any] = {**data}
    out["provider_id"] = pid
    out["id"] = pid
    out["trust_score"] = derive_trust_score(out)
    out["rating"] = float(out.get("rating", 0) or 0)
    out["available"] = bool(out.get("available", True))
    if "specialization" not in out or not out["specialization"]:
        svc = out.get("service", "")
        out["specialization"] = [svc] if svc else []
    return out


def validate_provider_document(doc_id: str, data: Dict[str, Any]) -> List[str]:
    issues: List[str] = []
    prefix = f"providers/{doc_id}"
    pid = resolve_provider_id(doc_id, data)

    if not pid:
        issues.append(f"{prefix}: missing provider id")
    elif pid != doc_id:
        issues.append(f"{prefix}: id field '{pid}' does not match document id '{doc_id}'")

    for field in PROVIDER_CANONICAL_FIELDS:
        if field == "provider_id":
            continue
        val = data.get(field)
        if field == "available":
            if val is None:
                issues.append(f"{prefix}: missing {field}")
        elif val is None or val == "":
            issues.append(f"{prefix}: missing {field}")

    ts = data.get("trust_score")
    if ts is not None:
        try:
            fv = float(ts)
            if fv < 0 or fv > 1:
                issues.append(f"{prefix}: trust_score must be between 0 and 1")
        except (TypeError, ValueError):
            issues.append(f"{prefix}: invalid trust_score")

    if not data.get("id") and not data.get("provider_id"):
        issues.append(f"{prefix}: missing id/provider_id on document body")

    return issues


def audit_providers_collection(
    provider_entries: List[Tuple[str, Dict[str, Any]]],
    booking_provider_ids: Set[str],
) -> Dict[str, Any]:
    issues: List[str] = []
    warnings: List[str] = []
    cities: Dict[str, int] = {}
    services: Dict[str, int] = {}

    provider_ids: Set[str] = set()

    for doc_id, data in provider_entries:
        data = data or {}
        provider_ids.add(doc_id)
        issues.extend(validate_provider_document(doc_id, data))

        city = (data.get("city") or "unknown").lower()
        cities[city] = cities.get(city, 0) + 1
        svc = (data.get("service") or "unknown").lower()
        services[svc] = services.get(svc, 0) + 1

        formatted = format_provider_record(data, doc_id)
        for field in AGENT_FIELDS:
            if field == "id":
                continue
            if formatted.get(field) is None and field not in ("specialization",):
                warnings.append(f"providers/{doc_id}: agent field '{field}' missing (may break discovery)")

    orphan_booking_refs = sorted(booking_provider_ids - provider_ids)

    if len(provider_entries) < 5:
        warnings.append(
            f"only {len(provider_entries)} providers in Firestore — run POST /api/admin/seed-providers"
        )

    return {
        "provider_count": len(provider_entries),
        "cities": cities,
        "services": services,
        "orphan_booking_provider_refs": orphan_booking_refs,
        "issues": issues,
        "warnings": warnings,
        "issue_count": len(issues),
        "warning_count": len(warnings),
        "ok": len(issues) == 0,
    }
