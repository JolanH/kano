# Story 1.4: Health and CSRF-token endpoints

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a CI pipeline or SPA bootstrapper,
I want `GET /api/v1/health` for liveness checking and `GET /api/v1/csrf-token` for SPA CSRF-token bootstrap,
so that the CI smoke test has a stable assertion target and the PM SPA has a clean way to obtain its token before any non-GET call.

## Acceptance Criteria

1. **Given** the Flask app is running, **when** I `GET /api/v1/health`, **then** the response is 200 with body `{"status": "ok", "version": "<git-sha>", "db": "connected"}` (version read from `KANO_VERSION` env var) **and** when the database is unreachable, the response is 503 with `{"status": "degraded", "db": "unreachable"}`.
2. **Given** a PM SPA client with no session cookie, **when** I `GET /api/v1/csrf-token`, **then** the response is 200 with body `{"csrf_token": "..."}` **and** a session cookie is set with the configured attributes from Story 1.3 **and** the returned token is subsequently accepted as `X-CSRF-Token` on state-changing requests.

## Tasks / Subtasks

- [ ] Create health blueprint (AC: #1)
  - [ ] `src/kano/api/health.py` — `health_bp = Blueprint("health", __name__, url_prefix="/api/v1")`
  - [ ] `@health_bp.get("/health")` — handler:
    - Read `KANO_VERSION` from config/env (falls back to `"unknown"` if unset)
    - Attempt a trivial DB roundtrip: `db.session.execute(text("SELECT 1"))`
    - On success: return `{"status": "ok", "version": version, "db": "connected"}`, 200
    - On `SQLAlchemyError`: return `{"status": "degraded", "db": "unreachable"}`, 503; log a warning via structlog (bound request_id already in context from Story 1.3 middleware)
  - [ ] Health endpoint must NOT be CSRF-protected (it's a GET, but verify it's not swept into any global `before_request` gate that would reject it pre-app-ready)
- [ ] Create CSRF-token blueprint (AC: #2)
  - [ ] `src/kano/api/csrf.py` — `csrf_bp = Blueprint("csrf", __name__, url_prefix="/api/v1")`
  - [ ] `@csrf_bp.get("/csrf-token")` — handler:
    - Call `flask_wtf.csrf.generate_csrf()` (this also sets the session CSRF secret if not already on the session)
    - Return `{"csrf_token": token}`, 200
  - [ ] Endpoint is GET-only; not CSRF-protected (CSRF applies to state-changing requests per Story 1.3 config).
- [ ] Register blueprints in `create_app()` (AC: #1, #2)
  - [ ] Extend `src/kano/__init__.py` to import and register both blueprints after middleware init
- [ ] Integration tests
  - [ ] `tests/integration/test_health_endpoint.py`:
    - Happy path: 200 body with `status=ok`, `db=connected`; `version` key present and equals `KANO_VERSION` env var
    - Degraded path: monkeypatch `db.session.execute` to raise `OperationalError`; assert 503, `status=degraded`, `db=unreachable`
    - Assert `X-Request-ID` header on both responses (verifying middleware integration)
  - [ ] `tests/integration/test_csrf_token_endpoint.py`:
    - First call: 200, response JSON contains `csrf_token` (non-empty string), `Set-Cookie` header present
    - Second call with the cookie: returns a token that validates on a subsequent CSRF-protected POST (use a one-off protected route registered in the test app, POST with `X-CSRF-Token` header + cookie → expect 200/404 but NOT 400 CSRF rejection)
    - Cookie attributes (from Story 1.3): `HttpOnly` and `SameSite=Lax` present

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

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
