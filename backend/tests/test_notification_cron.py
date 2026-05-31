"""Phase 6: cron auth for scheduled notification delivery."""
import os
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

import main


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("CRON_SECRET", "test-cron-secret-phase6")
    return TestClient(main.app)


def test_cron_endpoint_rejects_without_secret(client):
    r = client.post("/api/cron/process-notifications")
    assert r.status_code == 401


def test_cron_endpoint_rejects_wrong_secret(client):
    r = client.post(
        "/api/cron/process-notifications",
        headers={"X-Cron-Secret": "wrong"},
    )
    assert r.status_code == 401


def test_cron_endpoint_processes_with_valid_secret(client):
    with patch(
        "services.notification_cron.process_pending_notifications",
        new_callable=AsyncMock,
        return_value={"processed": 2, "sent": ["n1"], "failed": []},
    ):
        r = client.post(
            "/api/cron/process-notifications",
            headers={"X-Cron-Secret": "test-cron-secret-phase6"},
        )
    assert r.status_code == 200
    assert r.json()["processed"] == 2


def test_cron_endpoint_503_when_secret_not_configured(client, monkeypatch):
    monkeypatch.delenv("CRON_SECRET", raising=False)
    r = client.post(
        "/api/cron/process-notifications",
        headers={"X-Cron-Secret": "test-cron-secret-phase6"},
    )
    assert r.status_code == 503
