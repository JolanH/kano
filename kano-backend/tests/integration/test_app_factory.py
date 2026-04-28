"""Boot the app factory and exercise request-ID + structured-log wiring."""

from __future__ import annotations

import json
import logging
import re

import pytest
from flask import Flask
from flask.testing import FlaskClient

UUID_V4_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.IGNORECASE,
)


def _register_ping(app: Flask, path: str = "/test/ping") -> None:
    @app.route(path)
    def _ping() -> dict[str, bool]:
        return {"ok": True}


def test_request_id_generated_when_header_absent(app: Flask, client: FlaskClient) -> None:
    _register_ping(app)

    response = client.get("/test/ping")

    assert response.status_code == 200
    request_id = response.headers["X-Request-ID"]
    assert UUID_V4_RE.match(request_id), f"not a UUIDv4: {request_id}"


def test_incoming_request_id_round_trips(app: Flask, client: FlaskClient) -> None:
    _register_ping(app)
    incoming = "018f9a1b-1234-4567-8901-abcdef012345"

    response = client.get("/test/ping", headers={"X-Request-ID": incoming})

    assert response.headers["X-Request-ID"] == incoming


def test_invalid_incoming_request_id_is_replaced(app: Flask, client: FlaskClient) -> None:
    _register_ping(app)

    response = client.get("/test/ping", headers={"X-Request-ID": "not-a-uuid"})

    request_id = response.headers["X-Request-ID"]
    assert request_id != "not-a-uuid"
    assert UUID_V4_RE.match(request_id)


def test_structured_request_log_emits_one_line_with_expected_keys(
    app: Flask,
    client: FlaskClient,
    caplog: pytest.LogCaptureFixture,
) -> None:
    _register_ping(app, path="/test/logged")

    caplog.set_level(logging.INFO)
    response = client.get("/test/logged")
    assert response.status_code == 200

    request_logs: list[dict[str, object]] = []
    for record in caplog.records:
        try:
            parsed = json.loads(record.getMessage())
        except (json.JSONDecodeError, TypeError):
            continue
        if isinstance(parsed, dict) and parsed.get("event") == "request":
            request_logs.append(parsed)

    assert len(request_logs) == 1, f"expected exactly one request log; got {len(request_logs)}"
    log = request_logs[0]

    expected_keys = {
        "timestamp",
        "level",
        "request_id",
        "event",
        "method",
        "path",
        "status",
        "duration_ms",
    }
    missing = expected_keys - set(log.keys())
    assert not missing, f"missing keys: {missing}; got: {sorted(log.keys())}"

    assert log["method"] == "GET"
    assert log["path"] == "/test/logged"
    assert log["status"] == 200
    assert log["level"] == "info"
    assert UUID_V4_RE.match(str(log["request_id"]))
    assert isinstance(log["duration_ms"], int | float)
    assert log["duration_ms"] >= 0
