"""
Single FastAPI application instance for Haazir AI.

Import ONLY:  from backend.app import app
Run ONLY:     python -m uvicorn backend.main:app --host 0.0.0.0 --port 8080
"""
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Unique id per process — use /health and /api/routes to confirm one running instance.
APP_INSTANCE_ID = str(uuid.uuid4())


def _collect_api_paths(application: FastAPI) -> list[str]:
    paths: list[str] = []
    for route in application.routes:
        path = getattr(route, "path", None)
        if not path:
            continue
        if path.startswith("/api") or path == "/health":
            paths.append(path)
    return sorted(set(paths))


@asynccontextmanager
async def _lifespan(application: FastAPI):
    api_paths = _collect_api_paths(application)
    print("[HAAZIR] BACKEND LOADED - MAIN APP ACTIVE")
    print(f"[HAAZIR] instance_id={APP_INSTANCE_ID}")
    print(f"[HAAZIR] api_paths={len(api_paths)}")
    for path in api_paths:
        print(f"[HAAZIR]   {path}")
    if "/api/routes" not in api_paths:
        raise RuntimeError(
            "/api/routes is not registered — stale import or incomplete main.py load"
        )
    print("[HAAZIR] OK /api/routes registered")
    yield


app = FastAPI(
    title="Haazir AI API",
    description="Pakistan's Agentic Home Services Orchestrator",
    version="1.0.0",
    lifespan=_lifespan,
)

app.state.instance_id = APP_INSTANCE_ID

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
