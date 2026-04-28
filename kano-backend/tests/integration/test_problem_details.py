"""RFC 7807 ``application/problem+json`` envelope for domain exceptions."""

from __future__ import annotations

import json
import re

from flask import Flask
from flask.testing import FlaskClient

from kano.exceptions import EpochBumpRequired

PROBLEM_KEYS = {"type", "title", "status", "detail", "instance", "request_id"}


def test_epoch_bump_required_returns_problem_details(
    app: Flask,
    client: FlaskClient,
) -> None:
    detail_msg = "This project has active polls on epoch 2."

    @app.route("/test/raise-epoch")
    def _raise_epoch() -> dict[str, bool]:
        raise EpochBumpRequired(detail_msg)

    response = client.get("/test/raise-epoch")

    assert response.status_code == 409
    assert response.content_type == "application/problem+json"

    body = json.loads(response.data)
    assert PROBLEM_KEYS.issubset(body.keys()), f"missing keys: {PROBLEM_KEYS - body.keys()}"

    assert body["type"] == "https://kano.example.com/problems/epoch-bump-required"
    assert body["title"] == "Feature change requires epoch bump"
    assert body["status"] == 409
    assert body["detail"] == detail_msg
    assert body["instance"] == "/test/raise-epoch"
    assert isinstance(body["request_id"], str)
    assert re.match(r"^[0-9a-f-]{36}$", body["request_id"], re.IGNORECASE)


def test_unhandled_exception_returns_problem_details_500(
    app: Flask,
    client: FlaskClient,
) -> None:
    @app.route("/test/raise-unknown")
    def _raise_unknown() -> dict[str, bool]:
        raise RuntimeError("kaboom")

    # In Flask test mode TESTING=True propagates exceptions; force handlers to run.
    app.config["TESTING"] = False
    app.config["PROPAGATE_EXCEPTIONS"] = False
    response = client.get("/test/raise-unknown")

    assert response.status_code == 500
    assert response.content_type == "application/problem+json"
    body = json.loads(response.data)
    assert body["type"] == "https://kano.example.com/problems/internal-server-error"
    assert body["status"] == 500
    assert body["instance"] == "/test/raise-unknown"
