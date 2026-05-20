"""Integration tests for ``GET /api/v1/csrf-token``.

Two contracts under test:

1. The endpoint returns a non-empty ``csrf_token`` and sets a session cookie
   carrying the Story-1.3 attributes (``HttpOnly``, ``SameSite=Lax``).
2. The token, sent back as ``X-CSRF-Token`` together with the cookie, validates
   on a subsequent state-changing request — so the SPA bootstrap actually
   works end-to-end.
"""

from __future__ import annotations

import json

from flask import Flask
from flask.testing import FlaskClient


def test_csrf_token_endpoint_returns_token_and_sets_session_cookie(
    client: FlaskClient,
) -> None:
    response = client.get("/api/v1/csrf-token")

    assert response.status_code == 200
    body = json.loads(response.data)
    assert "csrf_token" in body
    assert isinstance(body["csrf_token"], str)
    assert body["csrf_token"]

    set_cookie = response.headers.get("Set-Cookie", "")
    assert set_cookie, "expected a Set-Cookie header on csrf-token response"
    assert "HttpOnly" in set_cookie
    assert "SameSite=Lax" in set_cookie


def test_csrf_token_endpoint_response_carries_request_id_header(
    client: FlaskClient,
) -> None:
    response = client.get("/api/v1/csrf-token")

    assert "X-Request-ID" in response.headers
    assert response.headers["X-Request-ID"]


def test_returned_csrf_token_validates_on_subsequent_protected_post(
    app: Flask,
    client: FlaskClient,
) -> None:
    """Token returned by GET /csrf-token is accepted on a CSRF-protected POST."""

    @app.post("/test/protected")
    def _protected() -> dict[str, bool]:
        return {"ok": True}

    bootstrap = client.get("/api/v1/csrf-token")
    assert bootstrap.status_code == 200
    token = json.loads(bootstrap.data)["csrf_token"]

    response = client.post(
        "/test/protected",
        json={},
        headers={"X-CSRF-Token": token},
    )

    assert response.status_code == 200
    assert json.loads(response.data) == {"ok": True}


def test_protected_post_without_token_still_rejected_after_bootstrap(
    app: Flask,
    client: FlaskClient,
) -> None:
    """Sanity: bootstrap call alone does not bypass CSRF protection."""

    @app.post("/test/protected")
    def _protected() -> dict[str, bool]:
        return {"ok": True}

    client.get("/api/v1/csrf-token")

    response = client.post("/test/protected", json={})

    assert response.status_code == 403
    assert response.content_type == "application/problem+json"
