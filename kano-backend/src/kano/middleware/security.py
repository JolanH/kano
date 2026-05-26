"""CSRF, CORS, and session-cookie configuration.

The module-level ``csrf`` instance is shared so other modules (e.g. the future
poll-submission blueprint) can decorate views with ``@public_endpoint`` to opt
out of CSRF protection on intentionally public, un-authenticated POST routes.

Session cookie attributes (``HttpOnly``, ``Secure``, ``SameSite``) are read by
Flask directly from ``app.config`` — they are populated by ``kano.config.Config``
and inherited from ``app.config.from_object`` in ``create_app``.

CORS has two distinct regimes:

* ``/api/v1/polls/<uuid>`` (Story 3.4), ``/api/v1/polls/<uuid>/submit``
  (Story 4.3), and ``/api/v1/polls/<uuid>/analysis`` (Story 5.2) are public
  respondent / shared-link surfaces — they may be hit from any origin. The
  UUIDv4 is the only authentication; no session cookie crosses these
  requests. Story 3.4 AC #6 + architecture §Authentication & Security:
  ``origins='*'``, ``supports_credentials=False`` (the two are mutually
  exclusive per the CORS spec, and the respondent doesn't carry credentials
  anyway).
* Everything else under ``/api/*`` is PM-only and stays bound to the
  explicit ``CORS_ALLOWED_ORIGINS`` allowlist with credentials enabled so
  the session cookie + CSRF token can flow.
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


# Path patterns that constitute the public respondent / shared-link surface.
# Kept as a tuple at module scope so tests can introspect the contract
# directly. Extended by Story 4-3 (submit) and Story 5-2 (analysis).
#
# Anchored with ``/?$`` so each pattern matches exactly one route plus its
# trailing-slash variant — Flask-CORS uses ``re.match`` (not ``re.fullmatch``)
# under the hood, and without anchoring the bare ``/api/v1/polls/[^/]+``
# would also match ``/submit`` and ``/analysis`` (the trailing segment falls
# outside the regex but the prefix match still succeeds). Flask-CORS happens
# to sort patterns by specificity today, so the deployed behavior is correct
# either way; anchoring removes the latent shadowing trap and lets a fourth
# public path be appended without worrying about declaration / sort order.
#
# The ``/?`` tolerates a trailing slash so a browser-normalized or
# proxy-rewritten ``/api/v1/polls/<uuid>/analysis/`` still resolves to the
# public-resource CORS regime rather than falling through to the PM-only
# catch-all allowlist below.
PUBLIC_RESPONDENT_PATHS: tuple[str, ...] = (
    r"/api/v1/polls/[^/]+/?$",
    r"/api/v1/polls/[^/]+/submit/?$",
    r"/api/v1/polls/[^/]+/analysis/?$",
)


def init_app(app: Flask) -> None:
    """Initialize CSRF protection and CORS on the Flask app."""

    csrf.init_app(app)

    pm_resource = {
        "origins": app.config["CORS_ALLOWED_ORIGINS"],
        "allow_headers": ["Content-Type", "X-CSRF-Token", "X-Request-ID"],
        "max_age": 86400,
        "supports_credentials": True,
    }
    public_resource = {
        "origins": "*",
        "allow_headers": ["Content-Type", "X-Request-ID"],
        "max_age": 86400,
        "supports_credentials": False,
    }

    resources: dict[str, dict[str, object]] = {
        path: public_resource for path in PUBLIC_RESPONDENT_PATHS
    }
    # Catch-all PM rule registered last; Flask-CORS picks the most-specific
    # match first, so the public patterns above win for those exact paths.
    resources[r"/api/*"] = pm_resource

    CORS(app, resources=resources)
