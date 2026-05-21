"""CSRF protection across ``/api/v1/*`` routes + ``public_endpoint`` exemption."""

from __future__ import annotations

import json

from flask import Flask
from flask.testing import FlaskClient

from kano.middleware.security import public_endpoint


def test_csrf_blocks_post_without_token_with_problem_details(
    app: Flask,
    client: FlaskClient,
) -> None:
    @app.post("/api/v1/some-protected")
    def _protected() -> dict[str, bool]:
        return {"ok": True}

    response = client.post("/api/v1/some-protected", json={})

    assert response.status_code == 403
    assert response.content_type == "application/problem+json"
    body = json.loads(response.data)
    assert body["type"] == "https://kano.example.com/problems/csrf-validation-failed"
    assert body["status"] == 403


def test_public_endpoint_decorator_exempts_route_from_csrf(
    app: Flask,
    client: FlaskClient,
) -> None:
    @app.post("/api/v1/exempted")
    @public_endpoint
    def _exempted() -> dict[str, bool]:
        return {"ok": True}

    response = client.post("/api/v1/exempted", json={})

    assert response.status_code == 200
    assert json.loads(response.data) == {"ok": True}


