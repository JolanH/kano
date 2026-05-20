"""RFC 7807 Problem Details error handler registry.

Every domain exception in :mod:`kano.exceptions` plus a handful of framework
errors (Pydantic ``ValidationError``, Flask-WTF ``CSRFError``, generic
``HTTPException`` and the 500 fallback) maps to a JSON ``problem+json``
envelope with the six canonical keys: ``type``, ``title``, ``status``,
``detail``, ``instance``, ``request_id``.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from flask import Response, current_app, g, jsonify, request
from flask_wtf.csrf import CSRFError
from pydantic import ValidationError
from werkzeug.exceptions import HTTPException

from kano.exceptions import (
    EntityNotFound,
    EpochBumpRequired,
    KanoError,
    PartialSubmission,
    PollExpired,
)

if TYPE_CHECKING:
    from flask import Flask


PROBLEM_TYPE_BASE = "https://kano.example.com/problems"
PROBLEM_CONTENT_TYPE = "application/problem+json"

_logger = logging.getLogger(__name__)


def _problem_response(
    *,
    status: int,
    type_slug: str,
    title: str,
    detail: str | None,
) -> Response:
    payload: dict[str, object] = {
        "type": f"{PROBLEM_TYPE_BASE}/{type_slug}",
        "title": title,
        "status": status,
        "detail": detail,
        "instance": request.path,
        "request_id": getattr(g, "request_id", None),
    }
    response = jsonify(payload)
    response.status_code = status
    response.mimetype = PROBLEM_CONTENT_TYPE
    return response


def _kano_error_handler(exc: KanoError) -> Response:
    return _problem_response(
        status=exc.status_code,
        type_slug=exc.type_slug,
        title=exc.title,
        detail=str(exc) if str(exc) else None,
    )


def _epoch_bump_handler(exc: EpochBumpRequired) -> Response:
    """409 envelope with the extra fields PM-SPA uses to render the bump dialog."""

    response = _problem_response(
        status=exc.status_code,
        type_slug=exc.type_slug,
        title=exc.title,
        detail=str(exc) if str(exc) else None,
    )
    payload = response.get_json() or {}
    payload["project_id"] = str(exc.project_id)
    payload["current_epoch"] = exc.current_epoch
    payload["would_be_epoch"] = exc.would_be_epoch
    response.set_data(jsonify(payload).get_data())
    return response


def register_error_handlers(app: Flask) -> None:
    """Register ``application/problem+json`` handlers for all exception types."""

    app.register_error_handler(EpochBumpRequired, _epoch_bump_handler)
    for exc_cls in (PollExpired, PartialSubmission, EntityNotFound):
        app.register_error_handler(exc_cls, _kano_error_handler)

    @app.errorhandler(ValidationError)
    def _handle_validation(exc: ValidationError) -> Response:
        return _problem_response(
            status=400,
            type_slug="validation-error",
            title="Request validation failed",
            detail=str(exc),
        )

    @app.errorhandler(CSRFError)
    def _handle_csrf(exc: CSRFError) -> Response:
        return _problem_response(
            status=400,
            type_slug="csrf-validation-failed",
            title="CSRF token missing or invalid",
            detail=exc.description,
        )

    @app.errorhandler(HTTPException)
    def _handle_http(exc: HTTPException) -> Response:
        status = exc.code or 500
        return _problem_response(
            status=status,
            type_slug=f"http-{status}",
            title=exc.name or "HTTP Error",
            detail=exc.description,
        )

    @app.errorhandler(Exception)
    def _handle_generic(exc: Exception) -> Response:
        _logger.exception("unhandled_exception")
        is_dev = current_app.config.get("FLASK_ENV") == "development"
        return _problem_response(
            status=500,
            type_slug="internal-server-error",
            title="Internal Server Error",
            detail=str(exc) if is_dev else None,
        )
