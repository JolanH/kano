"""SPA bootstrap endpoint that hands the PM client its CSRF token.

The PM SPA's ``useApi`` composable (Story 1.6) calls this once on boot, stashes
the returned token in memory, and attaches it as ``X-CSRF-Token`` on every
subsequent state-changing request. The endpoint itself is GET-only so it sits
outside Flask-WTF's protection by construction.

``flask_wtf.csrf.generate_csrf`` is idempotent: it lazily creates and stores
the per-session CSRF secret in ``flask.session`` on first call (which makes
Flask emit the session cookie on the response), then derives a token bound to
that secret. Subsequent calls within the same session return tokens that all
validate against that secret, so the SPA only ever needs one fetch per session.
"""

from __future__ import annotations

from flask import Blueprint, Response, jsonify
from flask_wtf.csrf import generate_csrf

csrf_bp = Blueprint("csrf", __name__, url_prefix="/api/v1")


@csrf_bp.get("/csrf-token")
def csrf_token() -> Response:
    """Return a fresh CSRF token; sets the session cookie on first call."""

    token = generate_csrf()
    return jsonify({"csrf_token": token})
