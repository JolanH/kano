"""Liveness endpoint backing the CI smoke test (``docker compose up --wait``).

The health check probes both the WSGI loop (handler reached) and the database
(``SELECT 1`` round-trip). The version string is whatever was injected at
container build time as ``KANO_VERSION``; we never compute it at request time
to keep this endpoint cheap and side-effect-free under load.

Failure mode: any error during the DB probe — SQLAlchemy or otherwise —
collapses to a 503 with a generic body. Exception messages can leak
connection strings and are deliberately not forwarded to the response.
"""

from __future__ import annotations

import structlog
from flask import Blueprint, Response, current_app, jsonify
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError, SQLAlchemyError

from kano.db import db

health_bp = Blueprint("health", __name__, url_prefix="/api/v1")

_log = structlog.get_logger("kano.health")

# Exceptions that legitimately indicate "the DB is unreachable" rather than
# "this handler has a bug." SQLAlchemyError covers the high-level wrapper
# (PendingRollbackError, OperationalError, InterfaceError, …); DBAPIError
# catches driver-level failures (psycopg2 connection drops) that bubble
# through the dialect. Anything else — TypeError, AttributeError, an import
# regression in this module — is a programmer error and must surface as a
# 500 via the generic Problem-Details handler, not be silently relabelled
# as a transient outage.
_DB_PROBE_FAILURES: tuple[type[BaseException], ...] = (SQLAlchemyError, DBAPIError)


@health_bp.get("/health")
def health() -> tuple[Response, int]:
    """Return liveness + DB-connectivity status."""

    version = current_app.config.get("KANO_VERSION", "unknown")
    # Discard any stale transaction state on the request-scoped session before
    # the probe. Without this, a prior request that left a `PendingRollbackError`
    # on the session would surface as a fake "DB unreachable" page even when
    # Postgres is healthy.
    try:
        db.session.rollback()
        db.session.execute(text("SELECT 1"))
    except _DB_PROBE_FAILURES:
        _log.warning("health_db_unreachable")
        return jsonify({"status": "degraded", "db": "unreachable"}), 503
    return jsonify({"status": "ok", "version": version, "db": "connected"}), 200
