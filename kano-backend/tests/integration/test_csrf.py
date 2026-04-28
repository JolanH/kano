"""CSRF protection across ``/api/v1/*`` routes + ``public_endpoint`` exemption."""

from __future__ import annotations

import json
import uuid

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

    assert response.status_code == 400
    assert response.content_type == "application/problem+json"
    body = json.loads(response.data)
    assert body["type"] == "https://kano.example.com/problems/csrf-validation-failed"
    assert body["status"] == 400


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


def test_polls_submit_unrouted_returns_404_not_csrf_400(
    app: Flask,
    client: FlaskClient,
) -> None:
    """Story 4-3 will register the real route. Until then the URL 404s."""

    poll_id = uuid.uuid4()
    response = client.post(f"/api/v1/polls/{poll_id}/submit", json={})

    assert response.status_code == 404
    assert response.status_code != 400
