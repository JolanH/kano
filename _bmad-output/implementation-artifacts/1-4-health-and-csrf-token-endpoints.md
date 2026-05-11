# Story 1.4: Health and CSRF-token endpoints

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a CI pipeline or SPA bootstrapper,
I want `GET /api/v1/health` for liveness checking and `GET /api/v1/csrf-token` for SPA CSRF-token bootstrap,
so that the CI smoke test has a stable assertion target and the PM SPA has a clean way to obtain its token before any non-GET call.

## Acceptance Criteria

1. **Given** the Flask app is running, **when** I `GET /api/v1/health`, **then** the response is 200 with body `{"status": "ok", "version": "<git-sha>", "db": "connected"}` (version read from `KANO_VERSION` env var) **and** when the database is unreachable, the response is 503 with `{"status": "degraded", "db": "unreachable"}`.
2. **Given** a PM SPA client with no session cookie, **when** I `GET /api/v1/csrf-token`, **then** the response is 200 with body `{"csrf_token": "..."}` **and** a session cookie is set with the configured attributes from Story 1.3 **and** the returned token is subsequently accepted as `X-CSRF-Token` on state-changing requests.

## Tasks / Subtasks

- [x] Create health blueprint (AC: #1)
  - [x] `src/kano/api/health.py` — `health_bp = Blueprint("health", __name__, url_prefix="/api/v1")`
  - [x] `@health_bp.get("/health")` — handler:
    - Read `KANO_VERSION` from config/env (falls back to `"unknown"` if unset)
    - Attempt a trivial DB roundtrip: `db.session.execute(text("SELECT 1"))`
    - On success: return `{"status": "ok", "version": version, "db": "connected"}`, 200
    - On `SQLAlchemyError`: return `{"status": "degraded", "db": "unreachable"}`, 503; log a warning via structlog (bound request_id already in context from Story 1.3 middleware)
  - [x] Health endpoint must NOT be CSRF-protected (it's a GET, but verify it's not swept into any global `before_request` gate that would reject it pre-app-ready)
- [x] Create CSRF-token blueprint (AC: #2)
  - [x] `src/kano/api/csrf.py` — `csrf_bp = Blueprint("csrf", __name__, url_prefix="/api/v1")`
  - [x] `@csrf_bp.get("/csrf-token")` — handler:
    - Call `flask_wtf.csrf.generate_csrf()` (this also sets the session CSRF secret if not already on the session)
    - Return `{"csrf_token": token}`, 200
  - [x] Endpoint is GET-only; not CSRF-protected (CSRF applies to state-changing requests per Story 1.3 config).
- [x] Register blueprints in `create_app()` (AC: #1, #2)
  - [x] Extend `src/kano/__init__.py` to import and register both blueprints after middleware init
- [x] Integration tests
  - [x] `tests/integration/test_health_endpoint.py`:
    - Happy path: 200 body with `status=ok`, `db=connected`; `version` key present and equals `KANO_VERSION` env var
    - Degraded path: monkeypatch `db.session.execute` to raise `OperationalError`; assert 503, `status=degraded`, `db=unreachable`
    - Assert `X-Request-ID` header on both responses (verifying middleware integration)
  - [x] `tests/integration/test_csrf_token_endpoint.py`:
    - First call: 200, response JSON contains `csrf_token` (non-empty string), `Set-Cookie` header present
    - Second call with the cookie: returns a token that validates on a subsequent CSRF-protected POST (use a one-off protected route registered in the test app, POST with `X-CSRF-Token` header + cookie → expect 200/404 but NOT 400 CSRF rejection)
    - Cookie attributes (from Story 1.3): `HttpOnly` and `SameSite=Lax` present

### Review Findings

- [x] [Review][Patch] Broaden `except SQLAlchemyError` in health endpoint to catch any probe failure [`kano-backend/src/kano/api/health.py:31`] — non-SA exceptions (RuntimeError, ArgumentError, raw driver errors) currently fall through to the generic 500 handler instead of returning the 503 body AC #1 requires. Resolved: changed to bare `except Exception`; added `test_health_returns_503_when_probe_raises_non_sqlalchemy_exception` exercising a `RuntimeError` path.
- [x] [Review][Patch] Add `db.session.rollback()` (or use an isolated `db.engine.connect()`) before `SELECT 1` [`kano-backend/src/kano/api/health.py:32`] — if a prior request left the session in a failed-transaction state, the probe raises `PendingRollbackError` and reports a connectivity outage that isn't real. Resolved: probe now calls `db.session.rollback()` immediately before `SELECT 1`.
- [x] [Review][Patch] Add a `connect_timeout` to the SQLAlchemy engine options in `Config` [`kano-backend/src/kano/config.py`] — without it, `/health` blocks for the OS-default ~75 s when Postgres is reachable at TCP but hung; defeats the `docker compose up --wait` consumer. Resolved: `Config.SQLALCHEMY_ENGINE_OPTIONS` now sets `connect_timeout=5` and `pool_pre_ping=True`.
- [x] [Review][Patch] Override `SQLALCHEMY_DATABASE_URI` in `TestConfig` to a hermetic value [`kano-backend/tests/conftest.py:30`] — the inherited dev default points at a real `localhost:5432`, so unguarded `client`-fixture tests can silently hit a developer's local Postgres or hang on CI. Resolved: set to `postgresql+psycopg2://nope:nope@127.0.0.1:1/nope` so any unintended call fails loudly.
- [x] [Review][Patch] Convert `app_with_db` to a `yield`-based fixture that calls `db.session.remove()` + disposes the engine on teardown [`kano-backend/tests/conftest.py:103-114`] — current fixture leaks pooled connections across tests, mirroring the cleanup pattern already in `alembic_head`. Resolved: fixture is now `Iterator[Flask]` with a `finally` block running session-remove + engine-dispose under `app_context`.

## Dev Notes

### Why these two endpoints exist

- **`/api/v1/health`**: smoke-test anchor for CI (Story 1.10's `docker compose up -d --wait` flow asserts against it). Also the standard liveness probe for any future orchestrator.
- **`/api/v1/csrf-token`**: the SPA's bootstrap path. On first PM-route entry, the `useApi` composable (Story 1.6) does `GET /api/v1/csrf-token`, stashes the returned token, and attaches it as `X-CSRF-Token` on every subsequent non-GET.

### Version identifier

`KANO_VERSION` is injected at container build time. Strategy (finalized in Story 1.9's Dockerfile):

```dockerfile
ARG KANO_VERSION
ENV KANO_VERSION=${KANO_VERSION}
```

And the GitHub Actions workflow (Story 7.3) passes `--build-arg KANO_VERSION=$(git rev-parse --short HEAD)`. For this story, reading from env is sufficient; the build-arg plumbing is downstream work.

### Database liveness check

Use `text("SELECT 1")`, not a query against a real table — the health check should succeed even before any migration has run (defensive for bootstrap ordering). Wrap in `try/except SQLAlchemyError`; do not leak exception messages to the response body (they could carry connection strings).

### Not in scope

- No readiness probe (vs. liveness) differentiation — v1 has one `/health` that's both. Add `/ready` only if Kubernetes lands.
- No auth/rate-limiting on these endpoints. Public by design — an attacker knowing the app is up is not a v1 concern (architecture D9).

### Testing standards

- Reuse `app` / `client` fixtures from `tests/conftest.py` (registered in Story 1.2 + extended in 1.3).
- For the degraded test, monkeypatch the `db.session.execute` call site specifically; do not kill the whole test DB.
- CSRF cookie test asserts attributes via the `Set-Cookie` header string parsing; Flask's test client exposes cookie attributes via `client.cookie_jar` (werkzeug).

### Project Structure Notes

Files created:
- `kano-backend/src/kano/api/health.py`
- `kano-backend/src/kano/api/csrf.py`
- Register both blueprints in `src/kano/__init__.py` (edit existing `create_app`)
- `kano-backend/tests/integration/test_health_endpoint.py`
- `kano-backend/tests/integration/test_csrf_token_endpoint.py`

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Authentication & Security] — CSRF session semantics (line 298 — "CSRF-only Flask session cookie issued on first GET of an `/app/*` page")
- [Source: _bmad-output/planning-artifacts/architecture.md#API & Communication Patterns] — endpoint map (line 330+)
- [Source: _bmad-output/planning-artifacts/prd.md#NFR17] — docker compose smoke test depends on `/health`
- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.4] — original AC source
- [Source: _bmad-output/implementation-artifacts/1-3-flask-app-factory-*.md] — middleware contract (request_id binding, session cookie attributes)

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (1M context)

### Debug Log References

- `poetry run pytest` — 26/26 passed (18 from Stories 1.2/1.3 + 8 new). Total runtime ~2.6 s including testcontainer startup.
- `poetry run ruff check src tests migrations` — clean across 32 files.
- `poetry run mypy src tests migrations` — clean. Initial errors: `Value of type variable "T_route" of function cannot be "Callable[[], object]"` on both blueprint handlers (Flask 3.1's `T_route` is constrained to `Callable[..., ResponseReturnValue]`, and `object` is too loose). Fixed by typing both handlers with `Response` (and `tuple[Response, int]` for the two-arm health response). The handlers always return `jsonify(...)` which is a `Response`, so the narrower annotation matches the actual call sites exactly.
- `poetry run black --check src tests migrations` — clean across 32 files.

### Completion Notes List

- Both ACs satisfied. 8 new integration tests pass: 4 in `test_health_endpoint.py` (happy 200/`status=ok`/`db=connected`/`version` echo, happy `X-Request-ID` header, degraded 503 with monkeypatched `OperationalError`, degraded `X-Request-ID` header) and 4 in `test_csrf_token_endpoint.py` (token + `Set-Cookie` with `HttpOnly`+`SameSite=Lax`, `X-Request-ID` header, returned token validates on subsequent POST, bootstrap call alone does not bypass CSRF protection on tokenless POSTs).
- **Wired Flask-SQLAlchemy in `kano.db`.** Story 1.3 explicitly deferred `db.init_app(app)` to "Story 2.1 (the first endpoint that actually needs a session)." Story 1.4 is that endpoint — `/health` runs `db.session.execute(text("SELECT 1"))`. The `kano.db` module now exports a module-level `db = SQLAlchemy(model_class=Base)` alongside the existing `Base` and `metadata`. The `Base` object stays the canonical declarative base for all five domain models (none of which import `db`), so the change is purely additive: every existing `from kano.db import Base` in models, migrations, and `kano.models.__init__` keeps working with the same metadata. `create_app` now calls `db.init_app(app)` after `security.init_app(app)` (engine creation is lazy — non-DB tests like `test_app_factory` don't trigger a connection). Story 2.1 will continue to layer on the first ORM model + Pydantic schemas without re-touching this wiring.
- **Two new infrastructure blueprints registered in `create_app`.** Story 1.3 said `create_app` "must NOT auto-register any blueprints (those land in Epic 2+)." Story 1.4 registers exactly two — `health_bp` and `csrf_bp` — because both exist for the platform itself rather than any one domain (CI smoke + SPA bootstrap). Future domain blueprints will still be mounted by their own `register_*` helpers per the Story 1.3 architecture pattern; the comment in `create_app` reflects this distinction.
- **Health endpoint version field reads from `app.config["KANO_VERSION"]`, not directly from `os.environ`.** Story 1.3's `Config` already pulls `KANO_VERSION` out of the environment at import time (defaulting to `"dev"`). Going through `current_app.config` rather than `os.environ` means `TestConfig` subclasses can override `KANO_VERSION` deterministically, and the test asserts the round-trip (the response body's `version` equals `app.config["KANO_VERSION"]`) rather than hard-coding `"dev"`.
- **Degraded-path test uses `unittest.mock.patch.object(db.session, "execute", ...)`.** SQLAlchemy 2.x `scoped_session` exposes `execute` as a regular method, so a context-manager-scoped patch isolates the failure to a single request without touching the actual DB connection. This lets the degraded test reuse the regular `client` fixture (no testcontainer needed) while the happy-path test uses the new `client_with_db` fixture that points at the live testcontainer. Both paths additionally assert the `X-Request-ID` header on the response, verifying that Story 1.3's middleware is still applied to these new blueprints (per the AC requirement that `/health` works "while the Flask app is running" — i.e. inside the same middleware stack).
- **New `app_with_db` / `client_with_db` fixtures in `conftest.py`.** Built with a `TestConfig` subclass whose `SQLALCHEMY_DATABASE_URI` is overridden with the running testcontainer URL. No migrations are applied — `SELECT 1` succeeds against an empty schema, which matches the architectural intent (health probe must work pre-migration). Existing tests that don't need a real DB keep using the cheap `app` / `client` fixtures.
- **CSRF endpoint's `Set-Cookie` carries `HttpOnly`+`SameSite=Lax` automatically.** `generate_csrf()` writes the per-session CSRF secret into Flask's session, which triggers Flask's session-cookie emission with whatever attributes are configured in `app.config` — and Story 1.3 already populated `SESSION_COOKIE_HTTPONLY=True` and `SESSION_COOKIE_SAMESITE="Lax"`. No additional code in the blueprint is needed; the test confirms the attributes flow through transparently.
- **Subsequent-POST validation test uses `app.test_client()`'s built-in cookie jar.** The Flask test client persists cookies across calls within the same client instance, so `client.get("/api/v1/csrf-token")` followed by `client.post("/test/protected", headers={"X-CSRF-Token": token})` exercises the same cookie-jar continuity the SPA's `useApi` composable will rely on (the SPA uses `credentials: "include"`).
- Lint/format/type gates: `ruff check` clean, `black --check` clean, `mypy --strict` clean across 32 source files. Full pytest run: 26/26 passing in ~2.6 s.
- No commits were created — per session policy commits are made only on explicit user request.

### File List

**Added**
- `kano-backend/src/kano/api/health.py`
- `kano-backend/src/kano/api/csrf.py`
- `kano-backend/tests/integration/test_health_endpoint.py`
- `kano-backend/tests/integration/test_csrf_token_endpoint.py`

**Modified**
- `kano-backend/src/kano/__init__.py` — added `db.init_app(app)` and registered `health_bp` + `csrf_bp`.
- `kano-backend/src/kano/db.py` — added module-level `db = SQLAlchemy(model_class=Base)` Flask-SQLAlchemy extension.
- `kano-backend/tests/conftest.py` — added `app_with_db` / `client_with_db` fixtures wired to the testcontainer URL.

**Sprint tracking**
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — `1-4-...` flipped `ready-for-dev → in-progress → review`; `last_updated` set to `2026-04-27`.

## Change Log

| Date       | Version | Change                                                                 | Author |
|------------|---------|------------------------------------------------------------------------|--------|
| 2026-04-27 | 0.1.0   | Added the two infrastructure endpoints required for CI smoke (`GET /api/v1/health` — returns `status`/`version`/`db` and probes the DB with `SELECT 1`, collapsing to 503 on `SQLAlchemyError`) and SPA bootstrap (`GET /api/v1/csrf-token` — emits a token and the session cookie carrying Story-1.3 attributes). Wired Flask-SQLAlchemy in `kano.db` (module-level `db` instance using the existing `Base`) and called `db.init_app(app)` in `create_app` — picking up the `db.init_app` step that Story 1.3 had deferred. Added `app_with_db` / `client_with_db` fixtures so DB-dependent tests get a live testcontainer URL while DB-free tests stay cheap. 8 new integration tests cover both AC arms; full test suite (26/26) green; ruff, mypy strict, and black all clean. | Amelia (dev agent) |
