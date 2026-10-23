"""FastAPI application entry point.

Run locally:
    uvicorn app.main:app --reload --port 8010
"""
from __future__ import annotations

import asyncio
import logging
import time
import uuid
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from .config import BASE_DIR, settings
from .database import Base, SessionLocal, engine
from .seed import seed_demo
from .services import devices, feeder
from .services.timeutil import iso_wib, utcnow

logger = logging.getLogger("autofeeder")
FRONTEND_DIST = BASE_DIR.parent / "frontend" / "dist"


def _tick_sync() -> None:
    try:
        with SessionLocal() as db:
            result = feeder.scheduler_tick(db)
            db.commit()
            if any(result.values()):
                logger.info("scheduler tick %s", result)
    except Exception:  # pragma: no cover - operational guard
        logger.exception("scheduler tick failed")


async def _scheduler_loop(stop: asyncio.Event) -> None:
    last_cleanup = 0.0
    while not stop.is_set():
        try:
            await asyncio.wait_for(stop.wait(), timeout=settings.scheduler_tick_seconds)
            break
        except asyncio.TimeoutError:
            pass
        await asyncio.to_thread(_tick_sync)
        if time.time() - last_cleanup > 3600:
            try:
                with SessionLocal() as db:
                    deleted = devices.telemetry_cleanup(db)
                    db.commit()
                    if deleted:
                        logger.info("retention cleanup removed %s telemetry rows", deleted)
                last_cleanup = time.time()
            except Exception:  # pragma: no cover
                logger.exception("retention cleanup failed")


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    if settings.demo_mode:
        logger.warning(
            "DEMO_MODE aktif: aplikasi tanpa login dan hanya untuk presentasi. "
            "Jangan diekspos ke internet."
        )
    if settings.seed_demo:
        if settings.is_production:
            raise RuntimeError("SEED_DEMO tidak boleh aktif di production.")
        with SessionLocal() as db:
            created = seed_demo(db)
            if any(created.values()):
                logger.info("demo seed created: %s", created)
    stop = asyncio.Event()
    task: asyncio.Task | None = None
    if settings.scheduler_enabled:
        task = asyncio.create_task(_scheduler_loop(stop), name="feeder-scheduler")
        logger.info("scheduler started (tick=%ss)", settings.scheduler_tick_seconds)
    try:
        yield
    finally:
        stop.set()
        if task:
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass
        engine.dispose()


def create_app() -> FastAPI:
    docs_enabled = not settings.is_production
    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description="Monitoring dan kendali auto-feeder rail gantry 20 kolam.",
        lifespan=lifespan,
        docs_url="/docs" if docs_enabled else None,
        redoc_url=None,
        openapi_url="/openapi.json" if docs_enabled else None,
    )

    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=settings.allowed_host_list or ["localhost"],
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Device-Key", "X-Request-ID"],
        expose_headers=["X-Request-ID"],
        max_age=600,
    )

    @app.middleware("http")
    async def security_and_logging(request: Request, call_next):
        request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:16]
        request.state.request_id = request_id
        started = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            logger.exception(
                "unhandled error method=%s path=%s request_id=%s",
                request.method,
                request.url.path,
                request_id,
            )
            response = JSONResponse(
                status_code=500,
                content={"detail": "Terjadi kesalahan internal.", "request_id": request_id},
            )
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; "
            "base-uri 'self'; form-action 'self'"
        )
        if request.url.path.startswith(settings.api_prefix):
            response.headers["Cache-Control"] = "no-store"
        if settings.is_production and request.url.scheme == "https":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        logger.info(
            "%s %s %s %sms rid=%s",
            request.method,
            request.url.path,
            response.status_code,
            elapsed_ms,
            request_id,
        )
        return response

    from .routers import (
        alarms,
        audit,
        dashboard,
        device_api,
        devices as devices_router,
        feeds,
        ponds,
        runs,
        schedules,
    )

    api = settings.api_prefix
    app.include_router(ponds.router, prefix=api)
    app.include_router(schedules.router, prefix=api)
    app.include_router(feeds.router, prefix=api)
    app.include_router(runs.router, prefix=api)
    app.include_router(alarms.router, prefix=api)
    app.include_router(audit.router, prefix=api)
    app.include_router(devices_router.router, prefix=api)
    app.include_router(device_api.router, prefix=api)
    app.include_router(dashboard.router, prefix=api)

    @app.get(f"{api}/health", tags=["health"])
    def health() -> dict[str, Any]:
        try:
            with SessionLocal() as db:
                db.execute(text("SELECT 1"))
            db_ok = True
        except Exception:
            db_ok = False
        return {
            "status": "ok" if db_ok else "degraded",
            "database": "ok" if db_ok else "error",
            "time": iso_wib(utcnow()),
            "version": settings.app_version,
        }

    @app.get(f"{api}", include_in_schema=False)
    def api_root() -> dict[str, Any]:
        return {
            "name": settings.app_name,
            "version": settings.app_version,
            "docs": "/docs" if docs_enabled else None,
            "health": f"{api}/health",
        }

    if FRONTEND_DIST.exists():
        assets = FRONTEND_DIST / "assets"
        if assets.exists():
            app.mount("/assets", StaticFiles(directory=str(assets)), name="assets")

        @app.get("/{full_path:path}", include_in_schema=False)
        async def spa(full_path: str):
            if full_path.startswith(settings.api_prefix.lstrip("/")):
                return JSONResponse(status_code=404, content={"detail": "Endpoint tidak ditemukan."})
            target = (FRONTEND_DIST / full_path).resolve()
            if full_path and target.is_file() and str(target).startswith(str(FRONTEND_DIST.resolve())):
                return FileResponse(target)
            return FileResponse(FRONTEND_DIST / "index.html")

    return app


app = create_app()
