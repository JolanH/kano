"""Thin async HTTP client for the Kano API.

The Kano write routes (``POST/PATCH/DELETE`` under ``/api/v1/*``) are PM-only and
guarded by a Flask **session cookie + CSRF token** — there are no bearer tokens.
The flow is:

1. ``GET /api/v1/csrf-token`` returns ``{"csrf_token": "..."}`` and sets the
   session cookie via ``Set-Cookie``.
2. Every subsequent state-changing request must send that cookie back *and* echo
   the token in an ``X-CSRF-Token`` header.

A single :class:`httpx.AsyncClient` handles step (1)'s cookie automatically (it has
a cookie jar), so we only need to remember the token string and attach the header.

Read routes (``GET``) need neither the cookie nor the token.
"""

from __future__ import annotations

import os
from typing import Any

import httpx

DEFAULT_BASE_URL = "http://localhost:5000/api/v1"


class KanoApiError(Exception):
    """Raised when the Kano API returns a non-2xx response.

    Carries the parsed RFC 7807 ``problem+json`` fields so tool functions can
    surface a clean message to the model and special-case specific conditions
    (most importantly the 409 ``epoch-bump-required`` on feature creation).
    """

    def __init__(self, status_code: int, problem: dict[str, Any]):
        self.status_code = status_code
        self.problem = problem
        # `type` is a URL like ".../problems/epoch-bump-required"; the trailing
        # path segment is a stable, machine-friendly code.
        self.problem_type = str(problem.get("type", "")).rstrip("/").rsplit("/", 1)[-1]
        self.title = problem.get("title", "Kano API error")
        self.detail = problem.get("detail", "")
        super().__init__(f"{status_code} {self.title}: {self.detail}")

    @property
    def is_epoch_bump_required(self) -> bool:
        return self.status_code == 409 and self.problem_type == "epoch-bump-required"


class KanoClient:
    """Async wrapper around the Kano API with lazy CSRF bootstrap."""

    def __init__(self, base_url: str | None = None):
        self.base_url = (base_url or os.environ.get("KANO_API_BASE", DEFAULT_BASE_URL)).rstrip("/")
        # One client => one cookie jar => the Flask session cookie persists across calls.
        self._client = httpx.AsyncClient(base_url=self.base_url, timeout=30.0)
        self._csrf_token: str | None = None

    async def aclose(self) -> None:
        await self._client.aclose()

    async def _ensure_csrf(self) -> str:
        """Fetch (once) and cache the CSRF token; also seeds the session cookie."""
        if self._csrf_token is None:
            resp = await self._client.get("/csrf-token")
            resp.raise_for_status()
            self._csrf_token = resp.json()["csrf_token"]
        return self._csrf_token

    async def _request(self, method: str, path: str, *, json: dict[str, Any] | None = None) -> Any:
        headers: dict[str, str] = {}
        if method.upper() in {"POST", "PATCH", "PUT", "DELETE"}:
            headers["X-CSRF-Token"] = await self._ensure_csrf()

        resp = await self._client.request(method, path, json=json, headers=headers)

        if resp.is_success:
            # 204 No Content has an empty body.
            return resp.json() if resp.content else None

        # Map any error into our typed exception, falling back gracefully if the
        # body is not the expected problem+json envelope.
        try:
            problem = resp.json()
        except Exception:
            problem = {"title": resp.reason_phrase, "detail": resp.text}
        raise KanoApiError(resp.status_code, problem)

    # ----- Reads (no CSRF needed) -------------------------------------------------

    async def list_projects(self) -> list[dict[str, Any]]:
        return await self._request("GET", "/projects")

    async def get_project(self, project_id: str) -> dict[str, Any]:
        return await self._request("GET", f"/projects/{project_id}")

    async def list_features_at_epoch(self, project_id: str, epoch: int) -> list[dict[str, Any]]:
        return await self._request("GET", f"/projects/{project_id}/epochs/{epoch}/features")

    # ----- Writes (CSRF required) -------------------------------------------------

    async def create_project(self, name: str, version: str) -> dict[str, Any]:
        return await self._request("POST", "/projects", json={"name": name, "version": version})

    async def create_feature(
        self,
        project_id: str,
        name: str,
        description: str | None = None,
        acknowledged: bool = False,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {"name": name, "description": description}
        if acknowledged:
            # The strict server-side check is `is True`, so only send the real bool.
            body["acknowledged"] = True
        return await self._request("POST", f"/projects/{project_id}/features", json=body)
