"""Kano backend Flask application factory.

``create_app`` wires every cross-cutting concern that a future blueprint can
rely on without per-endpoint boilerplate: request-ID propagation, structlog
JSON output, CSRF + CORS + session-cookie discipline, the SQLAlchemy session
extension, and the RFC 7807 ``application/problem+json`` error envelope. Two
infrastructure blueprints — ``health`` and ``csrf`` — are registered here
because they exist to support the platform itself (CI smoke-testing and SPA
bootstrap) rather than any one domain. Domain blueprints (projects, features,
polls, …) land in Epic 2+ and are mounted by their own helper functions.
"""

from __future__ import annotations

from flask import Flask

from kano.api.analysis import analysis_bp
from kano.api.csrf import csrf_bp
from kano.api.errors import register_error_handlers
from kano.api.features import features_bp
from kano.api.health import health_bp
from kano.api.polls import polls_bp
from kano.api.projects import projects_bp
from kano.config import Config
from kano.db import db
from kano.middleware import request_id, security, structured_logging


def create_app(config_class: type[Config] = Config) -> Flask:
    """Build, configure, and return the Kano Flask application."""

    app = Flask(__name__)
    app.config.from_object(config_class)

    request_id.init_app(app)
    structured_logging.configure_logging(app)
    security.init_app(app)
    db.init_app(app)
    register_error_handlers(app)

    app.register_blueprint(health_bp)
    app.register_blueprint(csrf_bp)
    app.register_blueprint(projects_bp)
    app.register_blueprint(features_bp)
    # polls_bp and analysis_bp expose routes matched by PUBLIC_RESPONDENT_PATHS
    # in middleware/security.py — keep that tuple in sync when adding routes.
    app.register_blueprint(polls_bp)
    app.register_blueprint(analysis_bp)

    return app


__all__ = ["create_app"]
