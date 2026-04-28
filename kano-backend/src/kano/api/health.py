"""Liveness endpoint backing the CI smoke test (``docker compose up --wait``).

The health check probes both the WSGI loop (handler reached) and the database
(``SELECT 1`` round-trip). The version string is whatever was injected at
container build time as ``KANO_VERSION``; we never compute it at request time
to keep this endpoint cheap and side-effect-free under load.

Failure mode: any ``SQLAlchemyError`` collapses to a 503 with a generic body —
exception messages can leak connection strings and are deliberately not
forwarded to the response.
"""

from __future__ import annotations

import structlog
from flask import Blueprint, Response, current_app, jsonify
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from kano.db import db

health_bp = Blueprint("health", __name__, url_prefix="/api/v1")

_log = structlog.get_logger("kano.health")


@health_bp.get("/health")
def health() -> tuple[Response, int]:
    """Return liveness + DB-connectivity status."""

    version = current_app.config.get("KANO_VERSION", "unknown")
    try:
        db.session.execute(text("SELECT 1"))
    except SQLAlchemyError:
        _log.warning("health_db_unreachable")
        return jsonify({"status": "degraded", "db": "unreachable"}), 503
    return jsonify({"status": "ok", "version": version, "db": "connected"}), 200
