# Story 1.3: Flask app factory with CSRF, CORS, request-ID, structured logging, and Problem Details middleware

Status: review

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

- [x] `src/kano/config.py` — env-driven `Config` class (AC: #4, #5)
  - [x] Fields: `DATABASE_URL`, `SECRET_KEY`, `FLASK_ENV` (dev/prod), `CORS_ALLOWED_ORIGINS` (comma-split list), `SESSION_COOKIE_SECURE` (auto-derived: False when dev, True otherwise), `SESSION_COOKIE_HTTPONLY=True`, `SESSION_COOKIE_SAMESITE="Lax"`, `WTF_CSRF_TIME_LIMIT=None`, `KANO_VERSION` (git SHA injected at build time or from env)
  - [x] Read all values from `os.environ`; raise `RuntimeError` at import if any required var is missing in prod mode
- [x] `src/kano/middleware/request_id.py` (AC: #1, #2)
  - [x] `before_request` hook: read `X-Request-ID` header if present and valid UUID; else generate `uuid4()`; store on `g.request_id` and bind to structlog contextvars via `structlog.contextvars.bind_contextvars(request_id=...)`
  - [x] `after_request` hook: set `response.headers["X-Request-ID"] = g.request_id`
  - [x] `teardown_request` hook: clear structlog contextvars
- [x] `src/kano/middleware/structured_logging.py` (AC: #2)
  - [x] Configure structlog processors: `contextvars.merge_contextvars`, `add_log_level`, `TimeStamper(fmt="iso", utc=True)`, `JSONRenderer()`
  - [x] Output to stdout via `logging.StreamHandler`; set root logger level from config (`DEBUG` in dev, `INFO` in prod)
  - [x] `before_request`: store `g.request_start = time.monotonic()`
  - [x] `after_request`: compute `duration_ms = (time.monotonic() - g.request_start) * 1000`; emit one INFO log event `"request"` with `method`, `path`, `status`, `duration_ms`
- [x] `src/kano/middleware/security.py` (AC: #3, #4, #5)
  - [x] Initialize `CSRFProtect(app)` (Flask-WTF); exempt `POST /api/v1/polls/<uuid:poll_id>/submit` via `csrf.exempt` applied to the polls submission blueprint (blueprint itself lands in Epic 4; pre-register the exemption hook here so it works once the endpoint is added)
  - [x] Initialize `CORS(app, resources={r"/api/*": {"origins": config.CORS_ALLOWED_ORIGINS, "allow_headers": ["Content-Type", "X-CSRF-Token", "X-Request-ID"], "max_age": 86400}})`
  - [x] Apply session cookie config from `Config`
- [x] `src/kano/exceptions.py` + `src/kano/api/errors.py` (AC: #6)
  - [x] `exceptions.py`: define `KanoError(Exception)` base + placeholders `EpochBumpRequired`, `PollExpired`, `PartialSubmission`, `EntityNotFound` (shells — full use in later epics)
  - [x] `api/errors.py`: `register_error_handlers(app)` function; registers handlers per domain exception type; each emits `application/problem+json` with `type` (URL like `https://kano.example.com/problems/<slug>`), `title`, `status`, `detail`, `instance = request.path`, `request_id = g.request_id`
  - [x] Generic `Exception` handler → 500 with `title="Internal Server Error"`, `detail` omitted in prod (leak protection), `request_id` included
- [x] `src/kano/__init__.py` — the factory itself (AC: #1–6)
  - [x] `def create_app(config_class=Config) -> Flask:` — load config, call `configure_logging(app)`, `request_id.init_app(app)`, `security.init_app(app)`, `register_error_handlers(app)`. (Deviation: `db.init_app(app)` skipped — see Completion Notes.)
  - [x] `create_app` must NOT auto-register any blueprints (those land in Epic 2+); it only wires cross-cutting behavior
- [x] Integration tests
  - [x] `tests/integration/test_app_factory.py` — boot app, assert `GET /test/ping` returns `X-Request-ID` (round-trips incoming header when provided; generates a new one when absent); assert one structlog line written with expected keys. (Test path differs from spec; see Completion Notes.)
  - [x] `tests/integration/test_problem_details.py` — define a temporary route that raises `EpochBumpRequired`; assert response `Content-Type: application/problem+json`, status 409, body contains all six keys
  - [x] `tests/integration/test_csrf.py` — POST to a protected route without token → 403 with Problem Details (per Story 2.2 AC #4); POST to `/api/v1/polls/<uuid>/submit` (stubbed) without token → 404 (not yet implemented) but NOT 403 (confirms exemption wiring)
  - [x] `tests/integration/test_cors.py` — OPTIONS request asserts `Access-Control-Allow-Origin` matches config, allowed headers include `X-CSRF-Token`, `max-age: 86400`
  - [x] `tests/integration/test_cookies.py` — assert `Set-Cookie` attributes on a session-issuing response include `HttpOnly`, `SameSite=Lax`; `Secure` present only when `FLASK_ENV != "development"`

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

claude-opus-4-7 (1M context)

### Debug Log References

- `poetry run pytest tests/integration/` — 18/18 passed (5 from Story 1.2 + 13 new). Full suite runs in ~2.6 s; new app-factory tests are sub-millisecond per case (no Postgres dependency).
- `poetry run ruff check src tests migrations` — initially flagged 6 issues across the new files: 4 × N818 ("exception name should end in Error") on `EpochBumpRequired`/`PollExpired`/`PartialSubmission`/`EntityNotFound`, 1 × UP038 (`isinstance(x, (int, float))`), 1 × I001 (import order in `test_problem_details.py`). The N818 cases were suppressed with `# noqa: N818` per class — the names are spec-locked (story Tasks line 41, architecture Problem-Details slug column, future PR API surface) and renaming would diverge from the documented `type` URL slugs (`epoch-bump-required` vs. an `Error`-suffixed name). UP038 fixed by switching to `int | float`. Import order fixed by `ruff --fix` (one blank line removed).
- `poetry run mypy src tests migrations` — initially flagged 6 errors: 4 × `import-untyped` for `flask_cors` and `flask_wtf.csrf` (no PEP 561 marker), 1 × `attr-defined` on `caplog: logging.LogRecord` (wrong type), 1 × `no-any-return` on `csrf.exempt(view)` returning `Any`. Fixed by (a) adding `flask_cors.*` and `flask_wtf.*` to the existing `[[tool.mypy.overrides]]` block alongside `testcontainers.*` (same pattern Story 1.2 used), (b) re-typing the test fixture to `pytest.LogCaptureFixture`, and (c) `cast(F, csrf.exempt(view))` to preserve the decorator's narrowed type. Final: clean across 28 source files in strict mode.
- `poetry run black src tests migrations` — `test_problem_details.py` reformatted once after ruff's import-fix; black removed an extra blank line. All 28 files clean afterward.

### Completion Notes List

- All 6 ACs satisfied. 13 new integration tests pass against the configured Flask app: `test_app_factory.py` (4 tests covering AC #1, #2 — request-ID generation, propagation, invalid-UUID replacement, structured-log shape with all 8 expected keys), `test_problem_details.py` (2 tests covering AC #6 — `EpochBumpRequired` → 409 problem+json with all 6 keys, generic `Exception` → 500 with no detail-leak path), `test_csrf.py` (3 tests covering AC #3 — protected-route rejection with problem+json envelope, `public_endpoint` decorator allowing exempt POSTs, polls-submit URL pattern returning 404 not 400), `test_cors.py` (2 tests covering AC #4 — preflight headers include configured origin / `X-CSRF-Token` / `max-age=86400`, never `*`), `test_cookies.py` (2 tests covering AC #5 — `HttpOnly`+`SameSite=Lax` always, `Secure` only when `FLASK_ENV != "development"`).
- **Deviation from spec — `db.init_app(app)` skipped in `create_app()`.** The story task literally specifies `init db.init_app(app) (using the SQLAlchemy instance from Story 1.2)`, but Story 1.2 did **not** deliver a Flask-SQLAlchemy `db = SQLAlchemy()` instance — it delivered a SQLAlchemy 2.x `DeclarativeBase` (`kano.db.Base`) plus the Alembic migration. Adding a Flask-SQLAlchemy instance now would (a) drag a `SQLALCHEMY_DATABASE_URI` requirement into every test that doesn't touch the database (all 13 of mine), and (b) widen Story 1.3's surface area beyond what its 6 ACs need. None of AC #1-6 reference the database; Story 2.1 ("Project SQLAlchemy model and Pydantic schemas") is the natural home for wiring Flask-SQLAlchemy when the first endpoint actually needs a session. **Reviewer decision needed:** accept this deferral (recommended), or wire Flask-SQLAlchemy now via a `kano.extensions` module and update tests to set `SQLALCHEMY_DATABASE_URI` to a placeholder.
- **Deviation from spec — `test_app_factory.py` uses `/test/ping` and `/test/logged` instead of `/api/v1/health`.** The spec text is `assert GET /api/v1/health returns X-Request-ID`, but `/api/v1/health` is owned by Story 1.4 — I cannot import a non-existent endpoint without coupling stories. The test instead registers ad-hoc routes inside each test via `@app.route(...)`, which exercises the same middleware chain at the same WSGI dispatch points. The "Dev Notes → What this story does NOT do" section already says "No `GET /api/v1/health` endpoint — that's Story 1.4," confirming the per-test stub is the intended pattern.
- **Deviation from spec — `Config.FLASK_ENV` validated only when value ≠ `"development"`.** Spec says "raise `RuntimeError` at import if any required var is missing in prod mode." I read `prod mode` as "any non-development value" (matches the architecture's two-environment model: dev locally, prod in Caddy). Setting `FLASK_ENV=development` (or unsetting it) skips validation; setting it to anything else (`production`, `staging`) requires `SECRET_KEY`, `DATABASE_URL`, `CORS_ALLOWED_ORIGINS`. This keeps the CI test suite working without environment plumbing while still failing-fast on real deploys. Validation runs at module-import time per the spec.
- **`public_endpoint` decorator chosen over global URL-pattern exemption.** The story Dev Notes call out two CSRF-exemption patterns and recommend #1 (per-route decorator). Implemented as `kano.middleware.security.public_endpoint = cast(F, csrf.exempt(view))`. The future Story 4-3 polls-submission view will decorate itself; the decorator is exported from `kano.middleware.security` for that import. The integration test confirms the decorator works on a stub `/api/v1/exempted` route, and the parallel test confirms the un-routed `/api/v1/polls/<uuid>/submit` URL falls through to a 404 (Flask-WTF's CSRFProtect.protect short-circuits when `request.endpoint is None` — a mismatched URL never reaches the CSRF check, so the 404-not-400 result is structural, not contingent on exemption wiring).
- **`HTTPException` and `CSRFError` handlers added beyond the spec's domain-exception list.** The spec lists 5 domain exceptions plus a generic `Exception` fallback. Without an `HTTPException` handler, Werkzeug-emitted 404 / 405 / 413 responses would carry the default HTML body — breaking the architecture's "everything is application/problem+json" promise on the API surface. Without a `CSRFError` handler, Flask-WTF's default response is also HTML, so the CSRF integration test would fail to find a `problem+json` content-type. Both handlers emit the same 6-key envelope as the domain handlers; their `type` slug is `http-<code>` and `csrf-validation-failed` respectively. The CSRF handler emits **403 Forbidden** to align with Story 2.2 AC #4 — RFC 9110 §15.5.4 is the natural fit for "request understood but rejected by cross-origin protection". This stays inside AC #6's "Any unhandled domain exception ... emits an RFC 7807" wording — the keyword is "any," and HTTPException is the natural superclass for all framework errors.
- **Hook registration order: request_id → structured_logging → security → error_handlers.** Flask runs `before_request` in registration order and `after_request` in reverse order, so this pinning gives: (a) `before`: bind ID → start timer, (b) `after`: emit log (with bound ID via contextvars) → set `X-Request-ID` header → CORS headers, (c) `teardown`: clear contextvars (registered in `request_id.init_app`). The structured-log line picks up `request_id` automatically through `structlog.contextvars.merge_contextvars`, no manual plumbing per call site.
- **`structlog.stdlib.LoggerFactory()` chosen over `PrintLoggerFactory()`.** Spec says "Output to stdout via `logging.StreamHandler`." A `PrintLoggerFactory` writes directly via `print()`, bypassing the stdlib logging hierarchy entirely — that breaks `caplog`-based tests and breaks any future structured emission from a Flask extension that uses stdlib logging. The `stdlib.LoggerFactory` instead funnels every structlog call through the configured root logger, so structlog-native and stdlib-native log lines flow through the same `StreamHandler` to the same stdout — exactly what the spec asks for.
- **`KANO_VERSION` defaults to `"dev"`.** No CI git-SHA injection wired yet (Story 1.10 owns CI). The Config attribute exists; downstream stories that read it (e.g. `/health` response in Story 1.4) get a stable string today and the real SHA once 1.10 lands.
- **`SQLALCHEMY_DATABASE_URI` mirrors `DATABASE_URL` in Config.** Even with `db.init_app` skipped, populating the standard Flask-SQLAlchemy key now means Story 2.1's wiring step is a one-line `db.init_app(app)` — no Config edit needed. `SQLALCHEMY_TRACK_MODIFICATIONS = False` set to suppress the long-standing Flask-SQLAlchemy deprecation warning.
- **`supports_credentials=True` added to the CORS config.** Cookie-based session auth (NFR4-6) requires the SPA to send `credentials: "include"` on cross-origin requests; flask-cors emits `Access-Control-Allow-Credentials: true` only when `supports_credentials=True`. Without this, browsers reject the response and the SPA can't read its session cookie. Not in the spec's literal CORS dict but implied by the cookie-based architecture.
- Lint/format/type gates: `ruff check` clean, `black --check` clean, `mypy --strict` clean across all 28 source files. No regressions in the 5 pre-existing Story 1.2 tests; full suite (5 schema + 13 middleware) passes in 2.6 s.
- **Modified Story 1.2 file: `tests/conftest.py`** — added `app` and `client` fixtures, a `TestConfig(Config)` subclass, and renamed the local `Config` import to `AlembicConfig` to disambiguate from `kano.config.Config`. The Alembic-config fixture chain is otherwise untouched. The story spec says "Fixtures in tests/conftest.py (created in Story 1.2): app fixture that calls create_app(TestConfig); client fixture yielding app.test_client()" — explicitly authorizing the modification.
- No commits were created — per session policy commits are made only on explicit user request. The diff is ready for review as a single "feat(api): wire Flask app factory with CSRF/CORS/request-ID/structlog/Problem-Details middleware" commit.

### File List

**Added**
- `kano-backend/src/kano/config.py`
- `kano-backend/src/kano/middleware/__init__.py`
- `kano-backend/src/kano/middleware/request_id.py`
- `kano-backend/src/kano/middleware/structured_logging.py`
- `kano-backend/src/kano/middleware/security.py`
- `kano-backend/src/kano/exceptions.py`
- `kano-backend/src/kano/api/__init__.py`
- `kano-backend/src/kano/api/errors.py`
- `kano-backend/tests/integration/test_app_factory.py`
- `kano-backend/tests/integration/test_problem_details.py`
- `kano-backend/tests/integration/test_csrf.py`
- `kano-backend/tests/integration/test_cors.py`
- `kano-backend/tests/integration/test_cookies.py`

**Modified**
- `kano-backend/src/kano/__init__.py` — replaced Story 1.1's placeholder `create_app` with the real factory.
- `kano-backend/tests/conftest.py` — added `TestConfig`, `app`, `client` fixtures; renamed `alembic.config.Config` import to `AlembicConfig` to disambiguate from `kano.config.Config`.
- `kano-backend/pyproject.toml` — extended `[[tool.mypy.overrides]]` with `flask_cors.*` and `flask_wtf.*` to suppress missing-stub errors (same pattern Story 1.2 used for `testcontainers.*`).

**Sprint tracking**
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — `1-3-...` flipped `ready-for-dev → in-progress → review`; `last_updated` set to `2026-04-27`.

## Change Log

| Date       | Version | Change                                                                 | Author |
|------------|---------|------------------------------------------------------------------------|--------|
| 2026-04-27 | 0.1.0   | Wired the Flask `create_app()` factory with full cross-cutting middleware: env-driven `Config` (with prod-mode fail-fast validation), request-ID propagation (UUIDv4 generated or round-tripped via `X-Request-ID` header), structured JSON logging via structlog (with per-request access log carrying `timestamp`, `level`, `request_id`, `event`, `method`, `path`, `status`, `duration_ms`), CSRF protection via Flask-WTF (with a `public_endpoint` exemption decorator pre-staged for Story 4-3's poll-submission route), CORS via Flask-CORS (origin allowlist + credentials support, no wildcard, 24h preflight cache), session cookie discipline (`HttpOnly`, `SameSite=Lax` always; `Secure` only outside development), and an RFC 7807 `application/problem+json` error envelope registry covering 4 domain exceptions plus `ValidationError`, `CSRFError`, `HTTPException`, and a 500 fallback. Documented one deviation from spec: `db.init_app(app)` deferred to Story 2.1 because Story 1.2 did not deliver a Flask-SQLAlchemy instance and none of AC #1-6 require database access. | Amelia (dev agent) |
