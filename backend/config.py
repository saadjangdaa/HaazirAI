"""
Configuration for Haazir Dost backend.

``load_dotenv()`` runs once here. Other modules should read values via ``config``,
not duplicate ``load_dotenv()`` (except optional fallbacks when ``config`` is unavailable).
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent

load_dotenv(BACKEND_DIR / ".env")


class Config:
    """Base configuration — all keys from environment."""

    FIREBASE_PROJECT_ID: str = os.getenv("FIREBASE_PROJECT_ID", "haazir-ai")
    FIREBASE_CREDENTIALS_PATH: str = os.getenv("FIREBASE_CREDENTIALS_PATH", "firebase-key.json")
    FIRESTORE_REGION: str = os.getenv("FIRESTORE_REGION", "asia-southeast1")

    # Gemini: support both names used in .env examples
    GEMINI_API_KEY: str = (
        os.getenv("GOOGLE_GEMINI_API_KEY", "").strip()
        or os.getenv("GEMINI_API_KEY", "").strip()
    )
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")

    MAPS_API_KEY: str = os.getenv("GOOGLE_MAPS_API_KEY", "").strip()

    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8080"))
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    DEBUG: bool = os.getenv("DEBUG", "false").lower() in ("1", "true", "yes")
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")

    @classmethod
    def resolved_credentials_path(cls) -> Path:
        """Absolute path to the Firebase service account JSON."""
        p = Path(cls.FIREBASE_CREDENTIALS_PATH)
        if not p.is_absolute():
            p = BACKEND_DIR / p
        return p

    @classmethod
    def validate(cls) -> bool:
        """
        Validate configuration.

        * **development**: missing Gemini or credentials only prints warnings — server can run
          (mock Gemini / mock Firestore).
        * **production** (``ENVIRONMENT=production``): missing credentials or Gemini fails validation.
        """
        strict = cls.ENVIRONMENT == "production"
        cred = cls.resolved_credentials_path()
        ok = True

        if not cls.FIREBASE_PROJECT_ID:
            print("[X] FIREBASE_PROJECT_ID is empty")
            ok = False

        if not cred.is_file():
            msg = f"Firebase credentials not found: {cred} — Firestore will use in-memory mock"
            if strict:
                print(f"[X] {msg}")
                ok = False
            else:
                print(f"[!] {msg}")

        gk = cls.GEMINI_API_KEY
        if not gk or gk == "your_gemini_api_key":
            msg = "Gemini API key not set — Samajh uses mock LLM responses"
            if strict:
                print(f"[X] {msg}")
                ok = False
            else:
                print(f"[!] {msg}")

        if ok:
            print("[OK] Configuration validated (see warnings above if any)")
        return ok


class DevelopmentConfig(Config):
    """Development configuration"""
    DEBUG = True
    LOG_LEVEL = "DEBUG"


class ProductionConfig(Config):
    """Production configuration"""
    DEBUG = False
    LOG_LEVEL = "WARNING"


# Select config based on environment
config = ProductionConfig() if os.getenv("ENVIRONMENT") == "production" else DevelopmentConfig()