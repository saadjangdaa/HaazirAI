"""Structured logger setup for orchestration traces."""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any, Dict


class JsonTraceFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: Dict[str, Any] = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        request_id = getattr(record, "request_id", None)
        if request_id:
            payload["request_id"] = request_id
        return json.dumps(payload, ensure_ascii=True)


def configure_trace_logger(name: str = "haazir.orchestration") -> logging.Logger:
    logger = logging.getLogger(name)
    if logger.handlers:
        return logger
    logger.setLevel(logging.INFO)
    handler = logging.StreamHandler()
    handler.setFormatter(JsonTraceFormatter())
    logger.addHandler(handler)
    logger.propagate = False
    return logger
