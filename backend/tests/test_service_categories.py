"""Phase 1 — strict service category filtering."""
import pytest
from services.service_categories import (
    enrich_intent,
    filter_providers_by_category,
    intent_category,
    normalize_category_from_text,
    provider_matches_category,
    provider_normalized_category,
)


def _provider(service: str, specs=None):
    return {"service": service, "specialization": specs or []}


class TestNormalizeCategory:
    def test_ac_technician(self):
        assert normalize_category_from_text("AC technician chahiye") == "ac_technician"
        assert normalize_category_from_text("AC Repair") == "ac_technician"

    def test_plumber(self):
        assert normalize_category_from_text("plumber chahiye") == "plumber"

    def test_electrician(self):
        assert normalize_category_from_text("electrician", "bijli") == "electrician"


class TestProviderCategory:
    def test_ac_provider(self):
        assert provider_normalized_category(_provider("AC technician")) == "ac_technician"

    def test_plumber_not_ac(self):
        assert provider_matches_category(_provider("plumber"), "ac_technician") is False

    def test_plumber_matches_plumber(self):
        assert provider_matches_category(_provider("plumber"), "plumber") is True


class TestStrictFiltering:
    def test_ac_request_only_ac_providers(self):
        pool = [
            _provider("AC technician"),
            _provider("plumber"),
            _provider("electrician"),
        ]
        out = filter_providers_by_category(pool, "ac_technician")
        assert len(out) == 1
        assert out[0]["service"] == "AC technician"

    def test_no_category_returns_empty(self):
        assert filter_providers_by_category([_provider("plumber")], None) == []

    def test_unknown_request_no_wrong_fallback(self):
        pool = [_provider("AC technician"), _provider("plumber")]
        assert filter_providers_by_category(pool, None) == []


class TestEnrichIntent:
    def test_enrich_adds_fields(self):
        intent = enrich_intent({"service_type": "Plumber"}, "plumber G-13 chahiye")
        assert intent["normalized_category"] == "plumber"
        assert isinstance(intent["keywords"], list)
        assert intent_category(intent) == "plumber"
