"""CORS preflight headers on ``/api/*`` routes."""

from __future__ import annotations

from flask import Flask
from flask.testing import FlaskClient


def _register_target(app: Flask) -> None:
    @app.post("/api/v1/cors-target")
    def _target() -> dict[str, bool]:
        return {"ok": True}


def test_cors_preflight_includes_origin_headers_and_max_age(
    app: Flask,
    client: FlaskClient,
) -> None:
    _register_target(app)

    response = client.options(
        "/api/v1/cors-target",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "X-CSRF-Token, Content-Type",
        },
    )

    assert response.headers.get("Access-Control-Allow-Origin") == "http://localhost:5173"
    allowed_headers = response.headers.get("Access-Control-Allow-Headers", "")
    assert "X-CSRF-Token" in allowed_headers
    assert "Content-Type" in allowed_headers
    assert response.headers.get("Access-Control-Max-Age") == "86400"


def test_cors_does_not_use_wildcard(app: Flask, client: FlaskClient) -> None:
    _register_target(app)

    response = client.options(
        "/api/v1/cors-target",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
        },
    )

    assert response.headers.get("Access-Control-Allow-Origin") != "*"
