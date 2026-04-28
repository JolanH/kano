"""Structlog JSON logging configuration + per-request access log.

structlog is wired through stdlib logging so every log line — whether emitted
from a structlog logger or a stdlib logger — flows through the same root
``StreamHandler`` and ends up as a single JSON object on stdout.

The per-request hook emits one ``INFO`` line at request completion with
``method``, ``path``, ``status``, and ``duration_ms``; ``request_id``,
``timestamp``, and ``level`` are injected by the configured processor chain.
"""

from __future__ import annotations

import logging
import sys
import time
from typing import TYPE_CHECKING

import structlog
from flask import g, request

if TYPE_CHECKING:
    from flask import Flask, Response


def configure_logging(app: Flask) -> None:
    """Configure structlog + stdlib root logger and register request hooks."""

    is_dev = app.config.get("FLASK_ENV") == "development"
    log_level = logging.DEBUG if is_dev else logging.INFO

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter("%(message)s"))
    root_logger = logging.getLogger()
    root_logger.handlers.clear()
    root_logger.addHandler(handler)
    root_logger.setLevel(log_level)

    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            structlog.processors.JSONRenderer(),
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.make_filtering_bound_logger(log_level),
        cache_logger_on_first_use=False,
    )

    log = structlog.get_logger("kano.request")

    @app.before_request
    def _start_request_timer() -> None:
        g.request_start = time.monotonic()

    @app.after_request
    def _emit_request_log(response: Response) -> Response:
        start = getattr(g, "request_start", None)
        if start is None:
            return response
        duration_ms = round((time.monotonic() - start) * 1000, 2)
        log.info(
            "request",
            method=request.method,
            path=request.path,
            status=response.status_code,
            duration_ms=duration_ms,
        )
        return response
