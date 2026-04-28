"""Integration tests for ``GET /api/v1/health``."""

from __future__ import annotations

import json
from unittest.mock import patch

from flask import Flask
from flask.testing import FlaskClient
from sqlalchemy.exc import OperationalError

from kano.db import db


def _operational_error() -> OperationalError:
    return OperationalError("SELECT 1", {}, Exception("connection refused"))


def test_health_returns_200_with_status_version_and_db_connected(
    app_with_db: Flask,
    client_with_db: FlaskClient,
) -> None:
    response = client_with_db.get("/api/v1/health")

    assert response.status_code == 200
    body = json.loads(response.data)
    assert body["status"] == "ok"
    assert body["db"] == "connected"
    assert body["version"] == app_with_db.config["KANO_VERSION"]


def test_health_response_carries_request_id_header(
    client_with_db: FlaskClient,
) -> None:
    response = client_with_db.get("/api/v1/health")

    assert "X-Request-ID" in response.headers
    assert response.headers["X-Request-ID"]


def test_health_returns_503_when_database_is_unreachable(
    client: FlaskClient,
) -> None:
    """When the DB probe raises ``OperationalError``, collapse to 503."""

    with patch.object(db.session, "execute", side_effect=_operational_error()):
        response = client.get("/api/v1/health")

    assert response.status_code == 503
    body = json.loads(response.data)
    assert body == {"status": "degraded", "db": "unreachable"}


def test_health_degraded_response_carries_request_id_header(
    client: FlaskClient,
) -> None:
    with patch.object(db.session, "execute", side_effect=_operational_error()):
        response = client.get("/api/v1/health")

    assert "X-Request-ID" in response.headers
    assert response.headers["X-Request-ID"]
