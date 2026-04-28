"""Session cookie attributes (``HttpOnly``, ``Secure``, ``SameSite=Lax``)."""

from __future__ import annotations

from flask import Flask, session

from kano import create_app
from tests.conftest import TestConfig


class _ProdLikeConfig(TestConfig):
    """Production-equivalent cookie attributes (``Secure=True``)."""

    SESSION_COOKIE_SECURE = True
    FLASK_ENV = "production"


def _make_session_setting_app(config_class: type[TestConfig]) -> Flask:
    app = create_app(config_class)
    # Disable CSRF for this fixture's GET-driven session-issuing route; the
    # session cookie is set on a regular GET response, no CSRF involved.
    app.config["WTF_CSRF_ENABLED"] = False

    @app.get("/test/set-session")
    def _set_session() -> dict[str, bool]:
        session["foo"] = "bar"
        return {"ok": True}

    return app


def test_dev_session_cookie_has_httponly_lax_no_secure() -> None:
    app = _make_session_setting_app(TestConfig)
    client = app.test_client()

    response = client.get("/test/set-session")
    set_cookie = response.headers.get("Set-Cookie", "")

    assert set_cookie, "expected a Set-Cookie header on session-issuing response"
    assert "HttpOnly" in set_cookie
    assert "SameSite=Lax" in set_cookie
    assert "Secure" not in set_cookie


def test_prod_session_cookie_has_httponly_lax_and_secure() -> None:
    app = _make_session_setting_app(_ProdLikeConfig)
    client = app.test_client()

    response = client.get("/test/set-session")
    set_cookie = response.headers.get("Set-Cookie", "")

    assert set_cookie, "expected a Set-Cookie header on session-issuing response"
    assert "HttpOnly" in set_cookie
    assert "SameSite=Lax" in set_cookie
    assert "Secure" in set_cookie
