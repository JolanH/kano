"""Request-ID middleware.

Generates (or accepts) a UUIDv4 per request, binds it to ``flask.g`` and to
``structlog`` context vars (so every log line emitted during the request
inherits it), and echoes it back on the response ``X-Request-ID`` header so
clients can correlate server logs with their own traces.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

import structlog
from flask import g, request

if TYPE_CHECKING:
    from flask import Flask, Response


REQUEST_ID_HEADER = "X-Request-ID"


def _is_valid_uuid(value: str) -> bool:
    try:
        uuid.UUID(value)
    except ValueError:
        return False
    return True


def init_app(app: Flask) -> None:
    """Register before/after/teardown hooks on the Flask app."""

    @app.before_request
    def _bind_request_id() -> None:
        incoming = request.headers.get(REQUEST_ID_HEADER, "").strip()
        request_id = incoming if incoming and _is_valid_uuid(incoming) else str(uuid.uuid4())
        g.request_id = request_id
        structlog.contextvars.bind_contextvars(request_id=request_id)

    @app.after_request
    def _emit_request_id_header(response: Response) -> Response:
        request_id = getattr(g, "request_id", None)
        if request_id is not None:
            response.headers[REQUEST_ID_HEADER] = request_id
        return response

    @app.teardown_request
    def _clear_log_context(_exc: BaseException | None) -> None:
        structlog.contextvars.clear_contextvars()
