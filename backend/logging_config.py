"""
Logging configuration for Haazir Dost.

Import after ``config`` (``from config import config``) so levels come from the environment.
"""

from __future__ import annotations

import logging
import logging.config
from pathlib import Path

from config import config

_LOG_FILE = Path(__file__).resolve().parent / "haazir_dost.log"

LOGGING_CONFIG = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "default": {
            "format": "%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        },
        "detailed": {
            "format": "%(asctime)s - %(name)s - %(levelname)s - [%(filename)s:%(lineno)d] - %(message)s",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "default",
            "level": config.LOG_LEVEL,
            "stream": "ext://sys.stdout",
        },
        "file": {
            "class": "logging.FileHandler",
            "filename": str(_LOG_FILE),
            "encoding": "utf-8",
            "formatter": "detailed",
            "level": "INFO",
        },
    },
    "loggers": {
        "": {
            "handlers": ["console", "file"],
            "level": config.LOG_LEVEL,
        },
        "firebase": {
            "handlers": ["console", "file"],
            "level": "DEBUG",
        },
        "agents": {
            "handlers": ["console", "file"],
            "level": "DEBUG",
        },
    },
}

try:
    logging.config.dictConfig(LOGGING_CONFIG)
except OSError:
    logging.basicConfig(level=logging.INFO)
    logging.getLogger(__name__).warning("File logging disabled — console only")

logger = logging.getLogger("haazir")
