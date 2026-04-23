# Story 1.3: Flask app factory with CSRF, CORS, request-ID, structured logging, and Problem Details middleware

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a solo dev,
I want the Flask `create_app()` factory wired with request-ID middleware, structlog JSON output, CSRF (Flask-WTF), CORS (Flask-CORS) allowlist, RFC 7807 Problem Details error envelope registry, and session cookie configuration,
so that every blueprint mounted afterwards inherits correct cross-cutting behavior without per-endpoint boilerplate.

## Acceptance Criteria

1. **Given** the Flask app factory is invoked via `create_app()`, **when** the app handles any request, **then** a UUIDv4 request ID is generated (or read from incoming `X-Request-ID`), bound to structlog, and returned on the response `X-Request-ID` header.
2. structlog emits one `INFO` JSON line per request at completion with keys `timestamp`, `level`, `request_id`, `event`, `method`, `path`, `status`, `duration_ms`.
3. CSRF is enabled on state-changing `/api/v1/*` endpoints and exempt for `POST /api/v1/polls/<uuid>/submit` (exemption pre-configured by route pattern).
4. CORS responses include the configured production origin allowlist (no wildcard), allow `Content-Type` and `X-CSRF-Token` headers, with 24h preflight cache.
5. Session cookies set in production carry `HttpOnly`, `Secure`, `SameSite=Lax` attributes; `Secure` is disabled automatically when `FLASK_ENV=development`.
6. Any unhandled domain exception routed via `@app.errorhandler` emits an RFC 7807 `application/problem+json` response with `type`, `title`, `status`, `detail`, `instance`, `request_id`.

## Tasks / Subtasks

- [ ] `src/kano/config.py` — env-driven `Config` class (AC: #4, #5)
  - [ ] Fields: `DATABASE_URL`, `SECRET_KEY`, `FLASK_ENV` (dev/prod), `CORS_ALLOWED_ORIGINS` (comma-split list), `SESSION_COOKIE_SECURE` (auto-derived: False when dev, True otherwise), `SESSION_COOKIE_HTTPONLY=True`, `SESSION_COOKIE_SAMESITE="Lax"`, `WTF_CSRF_TIME_LIMIT=None`, `KANO_VERSION` (git SHA injected at build time or from env)
  - [ ] Read all values from `os.environ`; raise `RuntimeError` at import if any required var is missing in prod mode
- [ ] `src/kano/middleware/request_id.py` (AC: #1, #2)
  - [ ] `before_request` hook: read `X-Request-ID` header if present and valid UUID; else generate `uuid4()`; store on `g.request_id` and bind to structlog contextvars via `structlog.contextvars.bind_contextvars(request_id=...)`
  - [ ] `after_request` hook: set `response.headers["X-Request-ID"] = g.request_id`
  - [ ] `teardown_request` hook: clear structlog contextvars
- [ ] `src/kano/middleware/structured_logging.py` (AC: #2)
  - [ ] Configure structlog processors: `contextvars.merge_contextvars`, `add_log_level`, `TimeStamper(fmt="iso", utc=True)`, `JSONRenderer()`
  - [ ] Output to stdout via `logging.StreamHandler`; set root logger level from config (`DEBUG` in dev, `INFO` in prod)
  - [ ] `before_request`: store `g.request_start = time.monotonic()`
  - [ ] `after_request`: compute `duration_ms = (time.monotonic() - g.request_start) * 1000`; emit one INFO log event `"request"` with `method`, `path`, `status`, `duration_ms`
- [ ] `src/kano/middleware/security.py` (AC: #3, #4, #5)
  - [ ] Initialize `CSRFProtect(app)` (Flask-WTF); exempt `POST /api/v1/polls/<uuid:poll_id>/submit` via `csrf.exempt` applied to the polls submission blueprint (blueprint itself lands in Epic 4; pre-register the exemption hook here so it works once the endpoint is added)
  - [ ] Initialize `CORS(app, resources={r"/api/*": {"origins": config.CORS_ALLOWED_ORIGINS, "allow_headers": ["Content-Type", "X-CSRF-Token", "X-Request-ID"], "max_age": 86400}})`
  - [ ] Apply session cookie config from `Config`
- [ ] `src/kano/exceptions.py` + `src/kano/api/errors.py` (AC: #6)
  - [ ] `exceptions.py`: define `KanoError(Exception)` base + placeholders `EpochBumpRequired`, `PollExpired`, `PartialSubmission`, `EntityNotFound` (shells — full use in later epics)
  - [ ] `api/errors.py`: `register_error_handlers(app)` function; registers handlers per domain exception type; each emits `application/problem+json` with `type` (URL like `https://kano.example.com/problems/<slug>`), `title`, `status`, `detail`, `instance = request.path`, `request_id = g.request_id`
  - [ ] Generic `Exception` handler → 500 with `title="Internal Server Error"`, `detail` omitted in prod (leak protection), `request_id` included
- [ ] `src/kano/__init__.py` — the factory itself (AC: #1–6)
  - [ ] `def create_app(config_class=Config) -> Flask:` — load config, init `db.init_app(app)` (using the SQLAlchemy instance from Story 1.2), call `configure_logging(app)`, `request_id.init_app(app)`, `security.init_app(app)`, `register_error_handlers(app)`
  - [ ] `create_app` must NOT auto-register any blueprints (those land in Epic 2+); it only wires cross-cutting behavior
- [ ] Integration tests
  - [ ] `tests/integration/test_app_factory.py` — boot app, assert `GET /api/v1/health` returns `X-Request-ID` (round-trips incoming header when provided; generates a new one when absent); assert one structlog line written with expected keys
  - [ ] `tests/integration/test_problem_details.py` — define a temporary route that raises `EpochBumpRequired`; assert response `Content-Type: application/problem+json`, status 409, body contains all six keys
  - [ ] `tests/integration/test_csrf.py` — POST to a protected route without token → 400 with Problem Details; POST to `/api/v1/polls/<uuid>/submit` (stubbed) without token → 404 (not yet implemented) but NOT 400 (confirms exemption wiring)
  - [ ] `tests/integration/test_cors.py` — OPTIONS request asserts `Access-Control-Allow-Origin` matches config, allowed headers include `X-CSRF-Token`, `max-age: 86400`
  - [ ] `tests/integration/test_cookies.py` — assert `Set-Cookie` attributes on a session-issuing response include `HttpOnly`, `SameSite=Lax`; `Secure` present only when `FLASK_ENV != "development"`

## Dev Notes

### Problem Details format (architecture §API & Communication Patterns, lines 351–365)

Canonical example body:

```json
{
  "type": "https://kano.example.com/problems/epoch-bump-required",
  "title": "Feature change requires epoch bump",
  "status": 409,
  "detail": "This project has active polls on epoch 2. Editing this feature requires bumping to epoch 3.",
  "instance": "/api/v1/projects/abc-123/features/def-456",
  "request_id": "018f9a1b-..."
}
```

Exception → status-code map (lock in this story; Epic 2+ will reuse):

| Exception | HTTP | Problem type slug |
|---|---|---|
| `EpochBumpRequired` | 409 | `epoch-bump-required` |
| `PollExpired` | 409 | `poll-expired` |
| `PartialSubmission` | 422 | `partial-submission` |
| `EntityNotFound` | 404 | `entity-not-found` |
| `ValidationError` (Pydantic) | 400 | `validation-error` |
| `Exception` (fallback) | 500 | `internal-server-error` |

### Structlog schema (architecture §Logging, line 443)

Every log line is JSON; every request completion logs:

```json
{
  "timestamp": "2026-04-23T08:40:12.345Z",
  "level": "info",
  "event": "request",
  "request_id": "018f9a1b-...",
  "method": "GET",
  "path": "/api/v1/health",
  "status": 200,
  "duration_ms": 12.4
}
```

Additional log calls inside handlers (`log.info("feature_created", ...)`) inherit the bound `request_id` via structlog contextvars — no manual plumbing.

### CSRF exemption registration

The submission endpoint (`POST /api/v1/polls/<uuid:poll_id>/submit`) lands in Epic 4 Story 4-3. But the **exemption pattern** is defined here. Two approaches:

1. **Recommended**: expose a decorator `@public_endpoint` in `security.py` that the future submission blueprint imports and applies; the decorator calls `csrf.exempt` and adds the route to a registry for tests.
2. Alternative: globally exempt URL patterns matching `/api/v1/polls/<uuid>/submit` via a `before_request` short-circuit. Architecture recommends #1 (explicit at the endpoint).

Do **not** actually register the polls submission route in this story — only the exemption mechanism.

### CORS origin config

Local dev: `CORS_ALLOWED_ORIGINS=http://localhost:5173` (Vite dev server). Production: the Caddy-fronted domain. Never `*`. `flask-cors` handles `OPTIONS` preflight transparently — no manual routes needed.

### Session cookie attributes (NFR5, architecture §Authentication & Security, line 304)

Production attributes: `HttpOnly`, `Secure`, `SameSite=Lax`. `Secure=False` in dev so local HTTP localhost works. `SameSite=Lax` preferred over `Strict` to allow the PM SPA to navigate to the app from the marketing page (future-compatibility; PRD doesn't have a marketing page but Lax is the safe default).

### What this story does NOT do

- No `GET /api/v1/health` endpoint — that's Story 1.4.
- No blueprints for projects/features/polls — those are Epic 2+.
- No `epoch_service` or `kano_matrix` logic — Stories 2.6 / 1.5.
- No OpenAPI spec — hand-authored later per architecture D7.

### Testing standards

- Fixtures in `tests/conftest.py` (created in Story 1.2): `app` fixture that calls `create_app(TestConfig)`; `client` fixture yielding `app.test_client()`.
- Test config overrides: `WTF_CSRF_ENABLED=True` (default), a `TestConfigCsrfDisabled` variant for tests that don't care about CSRF.
- Structlog capture: use `structlog.testing.capture_logs()` context manager in `test_app_factory.py` to assert log line shape.
- All test DB needs from Story 1.2 still apply; ephemeral Postgres per test session.

### Project Structure Notes

Files created in this story:
- `kano-backend/src/kano/config.py`
- `kano-backend/src/kano/middleware/__init__.py`, `request_id.py`, `structured_logging.py`, `security.py`
- `kano-backend/src/kano/exceptions.py`
- `kano-backend/src/kano/api/__init__.py`, `errors.py`
- `kano-backend/src/kano/__init__.py` (replace Story 1.1's placeholder `create_app`)
- Five new test files under `kano-backend/tests/integration/`

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Authentication & Security] — CSRF, CORS, session cookie discipline
- [Source: _bmad-output/planning-artifacts/architecture.md#API & Communication Patterns] — Problem Details envelope contract
- [Source: _bmad-output/planning-artifacts/architecture.md#Frontend Architecture] — request-id client-side generation (companion to server middleware here)
- [Source: _bmad-output/planning-artifacts/architecture.md#Process Patterns] — backend error handling flow
- [Source: _bmad-output/planning-artifacts/prd.md#NFR4–6] — CSRF / cookie / CORS requirements
- [Source: _bmad-output/planning-artifacts/prd.md#NFR15] — structured request logs contract
- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.3] — original AC source

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
