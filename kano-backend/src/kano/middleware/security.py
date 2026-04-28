"""CSRF, CORS, and session-cookie configuration.

The module-level ``csrf`` instance is shared so other modules (e.g. the future
poll-submission blueprint) can decorate views with ``@public_endpoint`` to opt
out of CSRF protection on intentionally public, un-authenticated POST routes.

Session cookie attributes (``HttpOnly``, ``Secure``, ``SameSite``) are read by
Flask directly from ``app.config`` — they are populated by ``kano.config.Config``
and inherited from ``app.config.from_object`` in ``create_app``.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import TYPE_CHECKING, TypeVar, cast

from flask_cors import CORS
from flask_wtf.csrf import CSRFProtect

if TYPE_CHECKING:
    from flask import Flask


csrf = CSRFProtect()

F = TypeVar("F", bound=Callable[..., object])


def public_endpoint(view: F) -> F:
    """Decorator that exempts a view from CSRF protection.

    Use on routes that intentionally accept un-authenticated public POSTs
    (e.g. the respondent poll-submission endpoint in Story 4-3). All other
    state-changing ``/api/v1/*`` routes are CSRF-protected by default.
    """

    return cast(F, csrf.exempt(view))


def init_app(app: Flask) -> None:
    """Initialize CSRF protection and CORS on the Flask app."""

    csrf.init_app(app)

    CORS(
        app,
        resources={
            r"/api/*": {
                "origins": app.config["CORS_ALLOWED_ORIGINS"],
                "allow_headers": ["Content-Type", "X-CSRF-Token", "X-Request-ID"],
                "max_age": 86400,
                "supports_credentials": True,
            }
        },
    )
