---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
lastStep: 8
status: 'complete'
completedAt: '2026-04-21'
inputDocuments:
  - /home/tixeo/Projects/perso/kano/_bmad-output/planning-artifacts/prd.md
  - /home/tixeo/Projects/perso/kano/_bmad-output/planning-artifacts/prd-validation-report.md
  - /home/tixeo/Projects/perso/kano/_bmad-output/planning-artifacts/ux-design-specification.md
  - /home/tixeo/Projects/perso/kano/_bmad-output/planning-artifacts/ux-design-directions.html
workflowType: 'architecture'
project_name: 'kano'
user_name: 'Kanaud'
date: '2026-04-21'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements (39 total, 7 categories):**

- Project Management (FR1–7): CRUD surface for projects and features; epoch-neutral edits (name, version) vs epoch-bumping edits (features).
- Epoch Integrity (FR8–12): automatic epoch increment on any feature-set change; prior epochs frozen; soft-delete retained; explicit PM confirmation dialog required when prior polls exist (FR11).
- Poll Lifecycle (FR13–18): poll pinned to epoch at creation; 7-day TTL; expired-URL rejection; multiple polls per project allowed; project-level poll list.
- Respondent Participation (FR19–27): no-auth landing, plain-language feature rendering, 2-question × 5-Likert per feature, progress indicator, full-completion enforcement with silent discard of partials (FR25), confirmation page, expired-poll page with off-ramp.
- Categorization (FR28–30): deterministic Kano matrix FQ×DQ → {M,L,E,I,C,D} stored with each response; response linked to exactly one poll instance.
- Analysis & Visualization (FR31–37): public analysis per poll, per-feature horizontal stacked bar, dominant category + %, tie-case shows both dominants with shared %, per-category panels, zero-response empty state.
- Guidance (FR38–39): human-readable category names with on-demand explanatory tooltips.

**Non-Functional Requirements (18 total, 6 categories):**

- Performance: analysis page 3s p95 (20 feat × 500 resp); respondent < 3 min; **analysis endpoint single SQL round-trip** (NFR3 — schema-shaping constraint).
- Security: CSRF on all state-changing requests; `SameSite=Lax`/Secure cookies; CORS origin allowlist (no wildcard); server-side validation + safe rendering; no respondent PII stored.
- Accessibility: WCAG 2.1 AA across both surfaces; accessible data-table fallback for the stacked-bar SVG (NFR10); axe-core in CI, violations block merge.
- Reliability & Durability: daily `pg_dump` to separate volume; restore-test before first PM study; `TIMESTAMPTZ` UTC throughout.
- Observability: structured request logs (request ID, method, path, status, duration); PostgreSQL slow-query log @ 500ms threshold in production.
- Portability & Deployment: `docker compose up` single-command boot on a clean checkout; Alembic managing all schema from commit #1; forward+rollback smoke test per migration in CI.

**Scale & Complexity:**

- Project complexity: **medium** — small CRUD surface, raised bar via epoch-versioning invariants, single-SQL aggregation constraint, dual-surface responsive split, and WCAG 2.1 AA.
- Primary domain: full-stack web (Vue 3 SPA + Flask REST + PostgreSQL).
- Expected load: low concurrency (internal tool, 3-poll/quarter cadence), analysis correctness matters more than throughput.
- Deployment posture: publicly reachable over internet (not intranet/VPN); hosting/TLS/DNS deferred to architecture.
- Estimated architectural components: ~8 logical services on the backend (projects, features, epoch-service, polls, responses, categorization, analysis, expiry-filter), plus 10 custom Vue components layered on Vuetify 3 per the UX spec.

### Technical Constraints & Dependencies

**Locked stack (PRD-mandated):**

- Frontend: Vue 3 composition API + Vuetify 3 (single theme, two registers).
- Backend: Python Flask + Poetry for dependency management.
- Database: PostgreSQL single-node (changed from MongoDB in the initial spec — rationale: relational domain model, GROUP BY analysis, SQL-verifiable epoch integrity).
- Migrations: Alembic from commit #1; no hand-edited schema permitted.
- Orchestration: docker-compose for local and production; single `docker compose up` boot.
- Browser matrix: latest-two stable of Chrome, Firefox, Edge, Safari; no IE, no legacy Edge.

**Explicit deferrals to this architecture phase:**

- Hosting provider, TLS termination mechanism, DNS strategy.
- Poll-URL opacity strategy — PRD says "plain URL" but URL-unguessability vs. the public-access model is an open design question (PRD Growth Features lists "token-based URLs" as post-MVP; v1 posture needs explicit architectural choice).
- QR-code generation approach (client library vs server render).
- Secrets/config management for a public-internet deployment.
- Backup target location (separate volume is named; cross-host replication is not).

### Cross-Cutting Concerns Identified

1. **Epoch-invariant enforcement.** Single centralized `bump_epoch_on_feature_change()` service; every feature-mutation endpoint routes through it; FK topology pins polls to `(project_id, epoch)`; parametrized bump-matrix fixtures assert epoch-N rows remain byte-identical after an N→N+1 bump.
2. **Single-query analysis aggregation (NFR3).** Analysis endpoint MUST be one SQL round-trip (`GROUP BY feature_id, category`). This constraint shapes the response/feature schema — per-feature iteration in Python is forbidden.
3. **Dual-surface bundle strategy.** Route-level code splitting between `/app/*` (PM bundle, desktop) and `/poll/*` (respondent bundle, mobile, <150 KB gzipped JS initial load). Respondent routes must not import PM-only Vuetify components.
4. **Security posture for public Flask/Vue split.** CSRF on state-changing requests from the SPA, SameSite=Lax/Secure cookies in production, CORS origin allowlist (no wildcard), server-side input validation and safe rendering across all user-provided strings.
5. **UTC time discipline.** `TIMESTAMPTZ` everywhere in schema; application-layer UTC always; 7-day TTL boundary tests.
6. **Copy-deck centralization.** All user-facing strings sourced via string keys, not inline literals. Material for both data quality (Kano signal integrity) and i18n readiness.
7. **Accessibility implementation.** SVG stacked bar paired with a hidden accessible `<table>` fallback from the same grouped result; WCAG 2.1 AA on focus, contrast, keyboard, ARIA, reduced-motion; axe-core in CI as a merge gate.
8. **Operational observability.** Structured request logs from day one + slow-query log @ 500ms; scaffolded during initial stack-up, not retrofitted.
9. **Migration + restore discipline.** Alembic forward+rollback CI smoke per migration; `pg_dump` daily to a separate volume; restore-test once before first PM study.
10. **Testing discipline as a first-class concern.** ≥85% line / 100% branch on `epoch_service`, `kano_matrix`, `poll_expiry`; Playwright E2E keyboard-only critical paths; contrast tests at build time; colorblind-simulator pre-lock on Kano palette; `axe-core` per PR.

## Starter Template Evaluation

### Primary Technology Domain

Full-stack web application:

- Frontend: Vue 3 SPA (Vuetify component framework, Vite build).
- Backend: Python Flask REST API (Poetry dependency management, SQLAlchemy ORM, Alembic migrations).
- Database: PostgreSQL 17 single-node.
- Orchestration: docker-compose for local development and production deployment.

### Starter Options Considered

**Frontend:**

- `npm create vuetify@latest` (**selected**) — official scaffolder. One-step Vite + Vue 3 + Vuetify project with optional TypeScript / Vue Router / Pinia / Vitest / ESLint / Prettier. Matches the UX spec's Vuetify-centric component strategy directly.
- `npm create vue@latest` + manual Vuetify install — rejected: adds a step with no benefit; `create vuetify` already wraps the Vue scaffolder.

**Backend:**

- `cookiecutter-flask` (Bootstrap + Flask-Login registration) — rejected: carries auth, Bootstrap assets, WTForms-driven server-rendering, Factory-Boy — none of which we use (PRD is no-auth, SPA-only, pytest-driven).
- `cookiecutter-flask-restful` (Flask-RESTful + JWT) — rejected: JWT/auth baggage we don't need; flask-restful is a layer we'd prefer to skip in favor of plain Flask blueprints.
- Microsoft `cookiecutter-python-flask-clean-architecture` — rejected: over-engineered for a medium-complexity internal tool; mandates a layering we'd just tear down.
- `poetry new kano-backend --src` + manual Flask app-factory (**selected**) — minimal, explicit, matches PRD scope exactly. Wiring time is lower than template-reduction time.

**Infra:**

- No pre-made docker-compose starter matched this exact shape (Flask + Poetry + PostgreSQL 17 + Vite SPA static-served) closely enough. Hand-authored compose file (**selected**).

### Selected Scaffolds

**Frontend initialization command:**

```bash
npm create vuetify@latest kano-frontend -- \
  --typescript \
  --router \
  --store pinia \
  --tests vitest \
  --lint eslint \
  --format prettier
```

**Vuetify version: TBD (Kanaud selects between v3 and v4 — see "Open Questions" below).**

**Backend initialization command:**

```bash
poetry new kano-backend --src
cd kano-backend
poetry add flask flask-sqlalchemy flask-migrate flask-cors flask-wtf psycopg2-binary
poetry add --group dev pytest pytest-cov pytest-flask factory-boy alembic
```

Flask app-factory, blueprints, SQLAlchemy declarative base, and Alembic `env.py` wired manually against the PRD/UX constraints (single-query analysis, epoch FK topology, CSRF+CORS).

**Architectural decisions provided by these scaffolds:**

**Language & runtime:**

- Frontend: Vue 3.5+, TypeScript (recommended for large SPA + Vuetify typing), Vite 6+.
- Backend: Python 3.12 (mainstream stable in 2026), Flask 3.1.x, SQLAlchemy 2.x.
- Database: PostgreSQL 17.x via official `postgres:17` Docker image.

**Styling solution:**

- Vuetify's themed token system (single `createVuetify()` instance; Tixeo palette tokens per UX spec §8). No Tailwind, no CSS-in-JS. SCSS overrides only where Vuetify defaults conflict with Tixeo register.

**Build tooling:**

- Frontend: Vite — route-level code splitting enforced to keep the respondent bundle lean (NFR-relevant). Separate chunks for `/app/*` (PM) and `/poll/*` (respondent).
- Backend: Poetry for dependency locking (`poetry.lock` committed); Alembic for migrations.

**Testing framework:**

- Frontend: Vitest (component unit tests), Playwright (E2E per PRD §Readiness Gates), `axe-core` via `@axe-core/playwright` (NFR11).
- Backend: `pytest` + `pytest-cov` + `pytest-flask`; factory-boy for fixtures; parametrized matrix tests for Kano categorization and epoch-bump.

**Code organization:**

- Frontend (`kano-frontend/src/`): `routes/` for route components, `layouts/` per surface (pm-layout, respondent-layout), `components/` for custom UX components (`<kano-likert>`, `<kano-stacked-bar>`, etc. — see UX spec §11), `composables/` for reusable logic, `stores/` for Pinia, `api/` for the REST client, `copy/` for the string-key copy deck.
- Backend (`kano-backend/src/kano/`): `models/` for SQLAlchemy declarative models, `services/` for domain services (`epoch_service`, `kano_matrix`, `poll_expiry`), `api/` for Flask blueprints, `schemas/` for request/response validation, `migrations/` for Alembic, `config.py` for environment-driven configuration.

**Development experience:**

- `docker compose up` single-command boot per NFR17.
- Hot reload on both frontend (Vite HMR) and backend (Flask debug mode behind a dev flag).
- Pre-commit hooks: ESLint + Prettier (frontend), Ruff + Black (backend), accessibility-lint plugin.
- `alembic upgrade head` runs automatically on backend container start in dev; manual in prod.

### Open Questions Flagged for Later Steps

- **Vuetify 3 vs Vuetify 4:** UX spec references Vuetify 3; Vuetify 4 became stable Feb 2026. Decide in step 4 (architectural decisions).
- **Python version:** 3.12 recommended; 3.13 possible. Confirm at decisions step.
- **PostgreSQL version:** 17.x recommended; 18.x available. Confirm at decisions step.

### Note

Project initialization using these commands should be the first implementation story.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**

- D4. Data schema for epoch-versioned features — per-epoch feature rows with stable `feature_key` (PRD's named most-irreversible decision).
- D5. Poll URL opacity — UUIDv4 exposed in `/poll/<uuid>`.
- D1. Vuetify 4.x.
- D11. Hosting — Hetzner Cloud + Caddy + docker-compose.

**Important Decisions (Shape Architecture):**

- D6. Pydantic 2 for request/response validation.
- D7. Hand-rolled REST blueprints + manually-authored `openapi.yaml`.
- D8. RFC 7807 Problem Details for error envelopes.
- D10. Native `fetch` wrapped in a thin composable on the frontend.
- D12. GitHub Actions for CI/CD.
- D13. `.env`-based configuration, host-env secrets in production.
- D14. structlog JSON to stdout with request-ID middleware.
- D16. Client-side QR rendering via the `qrcode` lib.

**Deferred Decisions (Post-MVP):**

- D9. Rate limiting — not needed in v1; v2 candidate if abuse patterns emerge.
- Cross-host backup replication — v2; v1 uses a separate Hetzner Volume on the same host.
- Signal-integrity guardrails (ballot-stuffing prevention) — PRD Growth Features.
- Token-based poll URLs (additional layer beyond UUIDv4) — PRD Growth Features.
- Custom question sets — PRD Growth Features.
- Dark mode — UX spec §6 flagged.
- i18n runtime — v1 copy deck is i18n-ready; runtime switch deferred.

### Data Architecture

**Database engine (locked by PRD):** PostgreSQL 17.x single-node via `postgres:17` Docker image. Rationale: relational domain (projects → features → polls → responses), SQL-verifiable epoch invariants, natural GROUP BY aggregation for NFR3.

**ORM:** SQLAlchemy 2.x (declarative imperative mapping, type-annotated `Mapped[T]` columns). Flask-SQLAlchemy for Flask session integration.

**Schema approach — per-epoch feature rows with stable `feature_key`:**

```
project (id UUID PK, name TEXT, version TEXT, current_epoch INT NOT NULL DEFAULT 1,
         created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ)

feature (id UUID PK,
         project_id UUID FK project(id),
         epoch INT NOT NULL,
         feature_key UUID NOT NULL,
         name TEXT NOT NULL, description TEXT,
         is_active BOOL NOT NULL DEFAULT TRUE,
         created_at TIMESTAMPTZ,
         UNIQUE (project_id, epoch, feature_key))

poll (id UUID PK,
      project_id UUID, epoch INT NOT NULL,
      created_at TIMESTAMPTZ, expires_at TIMESTAMPTZ NOT NULL,
      FOREIGN KEY (project_id, epoch) pins to an immutable feature set snapshot)

submission (id UUID PK,
            poll_id UUID FK poll(id),
            submitted_at TIMESTAMPTZ)

response (submission_id UUID FK submission(id),
          feature_id UUID FK feature(id),
          fq_answer SMALLINT NOT NULL CHECK (fq_answer BETWEEN 1 AND 5),
          dq_answer SMALLINT NOT NULL CHECK (dq_answer BETWEEN 1 AND 5),
          category CHAR(1) NOT NULL CHECK (category IN ('M','L','E','I','C','D')),
          PRIMARY KEY (submission_id, feature_id))
```

Key properties:

- **Epoch isolation by construction.** `poll` FKs the `(project_id, epoch)` pair — once created, the feature set for a poll is immutable because the `feature` rows for that epoch are immutable. An epoch bump creates new `feature` rows with a new `epoch` value; prior rows are never mutated.
- **Stable cross-epoch identity via `feature_key`.** Enables future v2 cross-epoch comparison without schema change.
- **Soft-delete via `is_active`.** A feature deleted from the active set marks `is_active=FALSE` in the current epoch; on the next epoch bump, inactive features are not cloned into epoch N+1. Prior polls pinned to epoch N still see them.
- **Atomic submission via `submission` row.** FR25 (discard partials) becomes trivially enforceable: create the `submission` + all 8-feature `response` rows inside a single transaction, or none at all.
- **Single-query analysis (NFR3):**
  ```sql
  SELECT f.id, f.name, f.description, r.category, COUNT(*) AS cnt
  FROM feature f
  LEFT JOIN submission s ON s.poll_id = :poll_id
  LEFT JOIN response r ON r.submission_id = s.id AND r.feature_id = f.id
  WHERE f.project_id = :project_id AND f.epoch = :epoch
  GROUP BY f.id, f.name, f.description, r.category
  ORDER BY f.id, r.category;
  ```
  One round-trip; per-feature category distributions computed in Python from the grouped result.

**Indexes (required from commit #1):**

- `feature (project_id, epoch)` — covers the analysis query and epoch lookups.
- `poll (project_id, epoch)` — FK + poll-list-for-project queries.
- `poll (expires_at)` — partial index on non-expired polls for the read-path filter.
- `submission (poll_id)` — response aggregation.
- `response (submission_id, feature_id)` — PK already covers.

**Validation strategy:**

- Server-side: Pydantic 2 schemas validate all inbound bodies before reaching blueprint handlers; `CHECK` constraints at the DB level as a second line for `fq_answer`, `dq_answer`, `category`.
- Client-side: lightweight Vue composables validate happy-path input (non-empty, length); server is the source of truth for rejection. No client/server shared schema library in v1.

**Migration approach:**

- Alembic from commit #1. Every schema change ships as a migration; hand-edited schema is forbidden.
- CI gate: `alembic upgrade head && alembic downgrade -1 && alembic upgrade head` on every migration-touching PR.

**Caching strategy:**

- None in v1. Single-query analysis + Postgres page cache handles the p95 target; introducing Redis would be premature. Named as v2 candidate only if NFR1 misses on real traffic.

### Authentication & Security

**Authentication:** None. Fully public per PRD — anyone can create projects, any link-holder can answer or view analysis. No accounts, no sessions with user identity.

**Session cookies (PM CSRF only):** A CSRF-only Flask session cookie is issued to PM SPA clients on first GET of an `/app/*` page, carrying a server-signed CSRF token. Attributes: `HttpOnly`, `Secure` (production), `SameSite=Lax`. No user identity in the session. Respondent routes under `/poll/*` do not issue or require this cookie — submissions are allowed from any origin with a valid UUIDv4 poll ID.

**CSRF (NFR4):** Flask-WTF `CSRFProtect` enabled on all state-changing `/app/*` endpoints. SPA reads the CSRF token from a meta tag (or a `/api/csrf-token` endpoint) and sends it on every non-GET as `X-CSRF-Token`. Respondent submission endpoint (`POST /api/polls/<uuid>/submit`) is CSRF-exempt by design (no cross-origin cookie confusion attack possible on an un-authed public endpoint; body is the only state).

**CORS (NFR6):** Flask-CORS configured with an explicit origin allowlist (production domain only). No wildcards. Allow `Authorization`-less requests; `Content-Type: application/json` and `X-CSRF-Token` in `Access-Control-Allow-Headers`. Preflight-cached for 24h.

**Cookie attributes (NFR5):** `Secure`, `HttpOnly`, `SameSite=Lax` in production. `Secure` off in local dev for localhost (auto-flipped via `FLASK_ENV`).

**Input validation (NFR7):**

- All inputs validated via Pydantic 2 models (max lengths, pattern constraints, enum for `category`, range 1–5 for Likert).
- All server-rendered text in HTML templates is auto-escaped via Jinja2 defaults. All JSON responses are content-type `application/json` with `nosniff`.
- Parameterized queries only (SQLAlchemy Core/ORM — raw SQL forbidden outside migrations).

**No PII (NFR8):** Respondent submissions carry only the 16 Likert answers + derived category + a UTC submission timestamp. No email, no name, no IP logged in application logs. (NGINX/Caddy access logs may contain client IPs for operational troubleshooting — flagged for the retention/operations section.)

**Poll URL unguessability (D5):** UUIDv4 exposed as `/poll/<uuid>`. ~122 bits of entropy eliminates the random-URL-discovery attack surface.

**Rate limiting (D9):** None in v1. Flagged for v2 if abuse is observed. Primary abuse surface (guessing poll URLs) is mitigated by UUIDv4.

**Secrets management (D13):** `.env.example` checked in with placeholders; `.env` gitignored; local dev via docker-compose `env_file`; production secrets injected via host environment variables (Hetzner server `/etc/environment` or systemd EnvironmentFile). No Vault, no Secrets Manager.

**TLS:** Caddy terminates TLS automatically via Let's Encrypt — zero-config for a single-domain deployment. HTTP→HTTPS redirect enforced; HSTS header with 1-year max-age after first successful TLS cycle.

### API & Communication Patterns

**Style:** REST with resource-oriented URLs, JSON request/response bodies. No GraphQL, no tRPC, no WebSockets (no real-time per PRD).

**Version prefix:** `/api/v1/` — single version in v1; v2 is a rename event, not a per-endpoint concern.

**Endpoint map (v1):**

```
PM-facing (CSRF-protected):
  GET    /api/v1/projects
  POST   /api/v1/projects
  GET    /api/v1/projects/:id
  PATCH  /api/v1/projects/:id              (name/version; no epoch bump)
  GET    /api/v1/projects/:id/epochs/:epoch/features
  POST   /api/v1/projects/:id/features     (bumps epoch if current epoch has polls)
  PATCH  /api/v1/projects/:id/features/:featureKey
  DELETE /api/v1/projects/:id/features/:featureKey   (soft-delete, epoch bump gating applies)
  POST   /api/v1/projects/:id/polls        (pins to current epoch)
  GET    /api/v1/projects/:id/polls

Public (no CSRF, no auth):
  GET    /api/v1/polls/:uuid               (respondent landing — feature list for the pinned epoch)
  POST   /api/v1/polls/:uuid/submit        (full submission or reject)
  GET    /api/v1/polls/:uuid/analysis      (public analysis for any URL-holder)
```

**Documentation (D7):** Hand-maintained `openapi.yaml` checked into the repo, served at `/api/docs` via Swagger UI (static). No `flask-smorest`. The small endpoint count doesn't justify the coupling.

**Error envelope (D8):** RFC 7807 Problem Details — `application/problem+json`:

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

Standard errors: 400 (validation), 404 (not found), 409 (conflict — epoch-bump required, expired poll), 422 (submission shape valid but semantically rejected — partial submission), 500 (server error; no stack traces in the body).

**Request ID propagation (D14):** Middleware generates a UUIDv4 per request, attaches to `request.request_id`, emits on every structured log line, returns on response header `X-Request-ID`, included in every Problem Details response.

**Rate limiting:** None in v1 (D9).

**Frontend→backend communication (D10):** Native `fetch` wrapped in a thin composable:

- Prepends `/api/v1/` base.
- Injects `X-CSRF-Token` header on non-GETs from the PM session cookie.
- Generates an `X-Request-ID` client-side (UUIDv4) so client logs and server logs correlate.
- Parses JSON response or Problem Details; throws typed errors for the UI layer.
- Zero deps; ~40 LoC.

### Frontend Architecture

**Framework (locked):** Vue 3.5+ composition API, Vuetify 4.x.

**State management:** Pinia stores per domain — `projectsStore`, `pollsStore`, `responseDraftStore` (respondent-side, in-memory only per FR25 silent-discard). No global app-state store; per-domain.

**Routing:**

- `/app/projects` — PM home (poll list)
- `/app/projects/:projectId` — project detail (feature authoring)
- `/app/projects/:projectId/polls/:pollId/analysis?epoch=N` — analysis page
- `/poll/:uuid` — respondent landing
- `/poll/:uuid/q/:featureIndex` — respondent per-question screen
- `/poll/:uuid/thanks` — respondent confirmation
- `/poll/:uuid/expired` — expired-link page

**Layouts:** Two route-level layout wrappers — `PmLayout` (dark sidebar + top bar, container 1440px) and `RespondentLayout` (chromeless, container 480px). Route meta selects the layout; no conditional logic inside components.

**Route-level code splitting (load-bearing for NFR):** Vite dynamic imports per route. The respondent routes (`/poll/*`) must not statically import PM-only components (`v-data-table`, PM layout, Pinia `projectsStore`). Target: respondent initial bundle <150KB gzipped JS.

**Component architecture:** Per UX spec §11 — 10 custom components layered on Vuetify primitives. Copy-deck integration via a central `copy/` module (string keys only; no inline literals).

**HTTP client:** Native `fetch` composable (D10).

**Performance optimization:**

- Respondent bundle: lean; only Vuetify components used on `/poll/*` routes (button, radio-group primitive for `<kano-likert>`, progress-linear, alert, card). Custom Vite chunk strategy splits by route prefix.
- Lazy-load the `qrcode` library (D16) only in `<poll-share-panel>` — respondent bundle never imports it.
- Analysis-page `<kano-stacked-bar>` SVG rendered inline, no charting library.

**Accessibility (NFR9–11):**

- Vuetify 4's ARIA/keyboard defaults used as-is unless the UX spec calls for override.
- Every custom component ships with its ARIA / focus / keyboard contract per UX spec §11.
- `axe-core` via `@axe-core/playwright` runs on every PR; violations block merge.

### Infrastructure & Deployment

**Hosting (D11):** Hetzner Cloud — single VPS (CX22 or similar). EU data residency (relevant for French customer base). Docker installed; docker-compose for service orchestration. Single-host deployment; no orchestrator.

**Services topology (docker-compose):**

```
services:
  web:        caddy serving the built Vue SPA + reverse-proxying /api/* to flask
  api:        kano-backend — Flask + gunicorn, mounts on :8000 internally
  db:         postgres:17, volume-mounted /var/lib/postgresql/data
  backup:     lightweight cron container running nightly pg_dump to a separate volume
```

**TLS termination:** Caddy as the edge — automatic Let's Encrypt renewal, zero-config HTTP→HTTPS redirect, HSTS. Single `Caddyfile` in the repo.

**Container images:**

- API: multi-stage build on `python:3.12-slim`; Poetry exports to requirements for the runtime stage; runs under `gunicorn` with a modest worker count (2 workers × 2 threads — low concurrent load per PRD).
- Web: multi-stage build on `node:24-alpine` (build) + `caddy:2-alpine` (serve); serves the Vite-built `/dist` and proxies `/api/*`.
- DB: official `postgres:17` with `POSTGRES_*` env + a named volume.

**CI/CD (D12):** GitHub Actions, one workflow file:

- **On PR:** lint (ESLint, Prettier, Ruff, Black), typecheck (vue-tsc, mypy), unit tests (pytest, Vitest), E2E (Playwright headless + axe-core), migration forward+rollback smoke, `docker compose up -d --wait` smoke.
- **On merge to main:** build images, push to GitHub Container Registry, SSH to Hetzner host, `docker compose pull && docker compose up -d && docker compose exec api alembic upgrade head`.

**Environment configuration (D13):** `.env.example` checked in; `.env` gitignored; docker-compose `env_file: .env`; production secrets injected via host environment.

**Logging (D14):** structlog → JSON to stdout. Each request logs one line at completion: `request_id`, `method`, `path`, `status`, `duration_ms`, plus any structured event keys. Collected via `docker logs` + Docker's default logging driver in v1; a log-shipping sidecar is v2 if needed.

**PostgreSQL slow-query log (NFR16):** `log_min_duration_statement = 500ms` in the Postgres container config; slow queries land in the same stdout stream.

**Backups (D15, NFR12–13):**

- Nightly cron inside a dedicated `backup` service: `pg_dump -Fc` writes to a separate Hetzner Volume mounted at `/backups`.
- Retention: 14 days (rolling).
- Restore drill: executed once before the first PM study per NFR13. The restore-test procedure is documented in the repo `docs/ops/restore-drill.md` and re-executed before any major migration.

**Monitoring:** Minimal in v1 — `docker logs` + `docker stats` + Hetzner's built-in uptime graph. Real observability (Prometheus, Grafana, paging) deferred to when operational pain justifies it.

**Scaling strategy:** Vertical only in v1 (bigger VPS if CX22 saturates). Horizontal scaling, read replicas, CDN — all deferred. The PRD's ~3-poll-per-quarter cadence doesn't need any of it.

### Decision Impact Analysis

**Implementation Sequence:**

1. Scaffold both halves via the commands from the Starter Template step.
2. Lock the domain schema (D4) via Alembic migration #1 — this is the single most irreversible artifact in the project.
3. Implement the `epoch_service` with the centralized `bump_epoch_on_feature_change()` contract. Bind every feature-mutation endpoint through it.
4. Implement the Kano matrix as a pure-function module with parametrized matrix tests (25 cells).
5. Implement the analysis endpoint with the single GROUP BY query (NFR3 gate).
6. Build the PM-side UI flows from the UX spec (home → project → share → analysis).
7. Build the respondent flow (landing → Likert → submit → thanks / expired).
8. Wire CSRF, CORS, Problem Details, request-ID middleware, structured logging.
9. Stand up docker-compose for local dev; extend for production with Caddy.
10. GitHub Actions pipeline (lint + tests + E2E + migration smoke + deploy).
11. Seed the restore-drill; execute before first PM study.
12. First real PM study.

**Cross-Component Dependencies:**

- **Schema (D4) → Analysis query → NFR3.** The schema's shape forces the single-GROUP-BY pattern. If the schema is wrong, the query becomes awkward and NFR3 silently drifts.
- **Epoch service → every feature-mutation endpoint.** Adding a new feature-touching endpoint without routing it through `bump_epoch_on_feature_change` breaks epoch integrity. Linter rule + code review checklist enforce this.
- **UUIDv4 poll URL (D5) → no rate limiting needed in v1 (D9).** These two decisions compose; removing D5 would require adding D9.
- **CSRF scope (PM-only) → route structure.** PM routes live under `/api/v1/*` when mounted from `/app/*`; public respondent endpoints are `/api/v1/polls/:uuid/*` and are CSRF-exempt by design.
- **Route-level code splitting → bundle size (respondent lean).** Accidentally importing a PM component from a respondent route silently busts the <150KB target. CI bundle-size check enforces this.
- **Pydantic schemas + DB CHECK constraints.** Defense in depth — Pydantic validates the JSON body shape; the DB rejects any accidental bypass via its CHECK constraints on `fq_answer`, `dq_answer`, `category`.
- **Caddy TLS + HSTS → production-only.** HSTS must never be on for local dev; config is environment-gated.
- **structlog request-ID → Problem Details.** Every error response carries the request-ID that correlates to the log line — makes root-cause investigation single-query.

## Implementation Patterns & Consistency Rules

These patterns lock decisions where AI agents (or a solo dev across sessions) could otherwise make divergent choices. They are mandatory for all code that lands in this repo.

### Pattern Categories Defined

Twelve categories covered:

1. JSON wire format
2. Database naming
3. API endpoints
4. Python naming
5. TypeScript/Vue naming
6. File & folder organization
7. Error handling
8. Date format
9. UUID format
10. Logging levels
11. Test organization
12. Loading state

### Naming Patterns

**Database (PostgreSQL + SQLAlchemy + Alembic):**

- **Tables:** `snake_case`, **plural** — `projects`, `features`, `polls`, `submissions`, `responses`.
- **Columns:** `snake_case` — `created_at`, `feature_key`, `expires_at`, `current_epoch`.
- **Primary key:** always `id` (UUID v4 generated by the application layer, never DB `DEFAULT gen_random_uuid()` — application ownership of IDs).
- **Foreign keys:** `<referenced_table_singular>_id` — `project_id`, `poll_id`, `submission_id`, `feature_id`.
- **Booleans:** predicate prefix — `is_active`, `is_expired`. Never a noun like `active`.
- **Timestamps:** always `TIMESTAMPTZ`, suffix `_at` for single events (`created_at`, `updated_at`, `expires_at`, `submitted_at`).
- **Indexes:** Alembic default naming convention via `naming_convention` in `MetaData` — `ix_<table>_<columns>`, `uq_<table>_<columns>`, `ck_<table>_<check>`, `fk_<table>_<columns>_<referenced_table>`, `pk_<table>`.
- **Enum-like fields:** `CHECK` constraints, not PostgreSQL `ENUM` types (easier to migrate; no enum-type migrations).
- **No `NULL` unless semantically required.** Every column is `NOT NULL` + explicit default unless the absence itself carries meaning.

**API (HTTP + JSON):**

- **URL paths:** `/api/v1/<plural-resource>[/<param>[/...]]`. Multi-word resource segments in `kebab-case` — none in v1 but `/api/v1/poll-templates` would be the shape.
- **Path parameters:** UUIDs parsed via Flask's `<uuid:project_id>` converter. Never raw strings.
- **Query parameters:** `snake_case` — `?epoch=2&since=2026-01-01`.
- **Custom headers:** `X-Request-ID`, `X-CSRF-Token` — `X-` prefix, `Title-Case-Hyphen`.
- **HTTP status codes:**
  - `200 OK` — successful GET/PATCH.
  - `201 Created` — successful POST creating a new entity; `Location` header points to the new resource.
  - `204 No Content` — successful DELETE.
  - `400 Bad Request` — Pydantic validation failure.
  - `404 Not Found` — entity doesn't exist.
  - `409 Conflict` — epoch-bump required, expired poll, duplicate feature_key.
  - `422 Unprocessable Entity` — submission semantically rejected (partial submission per FR25).
  - `500 Internal Server Error` — unexpected failure; body contains request_id but no stack trace.

**Python (backend):**

- **Files:** `snake_case.py`.
- **Modules:** `snake_case`.
- **Classes:** `PascalCase` — `EpochService`, `ProjectCreate`, `KanoMatrix`.
- **Functions / methods / variables:** `snake_case` — `bump_epoch_on_feature_change`, `compute_category`.
- **Constants:** `UPPER_SNAKE_CASE` — `MAX_FEATURES_PER_PROJECT`, `POLL_TTL_DAYS`.
- **Private module members:** `_leading_underscore`.
- **SQLAlchemy models:** class name singular, matching the singular form of the table (`Project`, `Feature`, `Poll`, `Submission`, `Response`). Set `__tablename__` explicitly to the plural snake_case (`"projects"`).
- **Pydantic models:** class name ends in suffix describing use — `ProjectCreate` (inbound create body), `ProjectUpdate` (inbound PATCH body), `ProjectResponse` (outbound response), `ProjectSummary` (list-item projection).
- **Service modules:** verb-first function names — `bump_epoch_on_feature_change`, `categorize_response`, `filter_non_expired_polls`. No classes unless state is required.
- **Blueprints:** module named by resource (`api/projects.py`); blueprint variable `projects_bp = Blueprint("projects", __name__, url_prefix="/api/v1/projects")`.

**TypeScript / Vue (frontend):**

- **Component files:** `PascalCase.vue` — `KanoLikert.vue`, `PollSharePanel.vue`, `EpochBumpDialog.vue`.
- **Template usage:** `<PascalCase />` form — `<KanoLikert :feature="f" />`. Never `<kano-likert>`.
- **Composables:** `use` prefix, `camelCase` — `useApi()`, `useCopy()`, `useResponseDraft()`. File name matches: `useApi.ts`.
- **Pinia stores:** `useFooStore` — file `src/stores/foo.ts`.
- **Routes:** `kebab-case` in URL paths; `PascalCase` for component names loaded by the route.
- **TypeScript interfaces / types:** `PascalCase` — `interface Project { ... }`, `type Category = "M" | "L" | ...`.
- **Functions / variables:** `camelCase`.
- **Constants:** `UPPER_SNAKE_CASE`.

### Structure Patterns

**Backend (`kano-backend/`):**

```
src/kano/
  __init__.py              # create_app() — the Flask app factory
  config.py                # environment-driven Config class
  db.py                    # SQLAlchemy engine + session factory
  models/                  # one file per aggregate root
    __init__.py            # re-exports + Base declarative
    project.py
    feature.py
    poll.py
    submission.py
    response.py
  schemas/                 # Pydantic; one file per resource
    project.py
    feature.py
    poll.py
    submission.py
  services/                # domain logic (pure functions where possible)
    epoch_service.py       # bump_epoch_on_feature_change() — the single contract
    kano_matrix.py         # compute_category(fq, dq) -> Category
    poll_expiry.py         # filter_non_expired_polls()
    analysis.py            # build_analysis(poll_id) — runs the single GROUP BY
  api/                     # Flask blueprints; one file per resource
    projects.py
    features.py
    polls.py
    responses.py
    analysis.py
    errors.py              # error-handler registry: domain exceptions → Problem Details
  middleware/
    request_id.py          # UUIDv4 per request; bind to structlog
    structured_logging.py  # structlog configuration
  exceptions.py            # domain exceptions (EpochBumpRequired, PollExpired, ...)
migrations/                # Alembic
tests/
  unit/
  integration/
  conftest.py
openapi.yaml               # hand-maintained API spec
pyproject.toml
poetry.lock
```

**Frontend (`kano-frontend/`):**

```
src/
  main.ts                  # createApp + Vuetify + Pinia + Router wiring
  router.ts                # route definitions with meta.layout
  App.vue                  # <router-view /> inside <component :is="layout">
  layouts/
    PmLayout.vue           # dark sidebar + top bar, 1440px container
    RespondentLayout.vue   # chromeless, 480px container
  routes/                  # page-level components, organized by URL prefix
    app/
      Projects.vue         # /app/projects
      ProjectDetail.vue    # /app/projects/:id
      Analysis.vue         # /app/projects/:id/polls/:pollId/analysis
    poll/
      Landing.vue          # /poll/:uuid
      Question.vue         # /poll/:uuid/q/:featureIndex
      Thanks.vue           # /poll/:uuid/thanks
      Expired.vue          # /poll/:uuid/expired
  components/              # custom UX components per UX spec §11
    KanoLikert.vue
    KanoStackedBar.vue
    KanoStackedBarTable.vue
    CatBadge.vue
    PollSharePanel.vue
    EpochSelector.vue
    EpochBumpDialog.vue
    EpochBumpBanner.vue
    PerCategoryPanels.vue
    FeatureListEditor.vue
  composables/
    useApi.ts              # fetch composable
    useCopy.ts             # copy-deck string-key lookup
    useResponseDraft.ts    # in-memory respondent draft
  stores/                  # Pinia
    projects.ts
    polls.ts
  api/                     # API client types + wrapper
    types.ts
    client.ts
  copy/                    # copy deck
    index.ts               # string-key registry + lookup
    en.ts                  # English strings
  theme/
    tixeo.ts               # Vuetify theme tokens
    overrides.scss
tests/
  (Vitest specs co-located next to components as *.spec.ts)
e2e/                       # Playwright
  pm/
  respondent/
package.json
tsconfig.json
vite.config.ts
```

### Format Patterns

**JSON wire format (L1): snake_case end-to-end.** All JSON bodies use `snake_case` keys on both request and response. Neither Pydantic aliasing nor frontend key conversion — the same key names flow DB → ORM → Pydantic → JSON → Vue template.

Example `POST /api/v1/projects` request:

```json
{ "name": "Q3 Prioritization", "version": "1.0" }
```

Example `201 Created` response:

```json
{
  "id": "018f9a1b-3c4d-7e5f-abcd-ef0123456789",
  "name": "Q3 Prioritization",
  "version": "1.0",
  "current_epoch": 1,
  "created_at": "2026-04-21T15:30:00Z",
  "updated_at": "2026-04-21T15:30:00Z"
}
```

**Error envelope: RFC 7807 Problem Details** (repeated from Core Decisions §API for mandatory reference):

```json
{
  "type": "https://kano.example.com/problems/epoch-bump-required",
  "title": "Feature change requires epoch bump",
  "status": 409,
  "detail": "This project has active polls on epoch 2. Editing this feature requires bumping to epoch 3.",
  "instance": "/api/v1/projects/018f9a1b-.../features/018f9a2c-...",
  "request_id": "018f9a3d-..."
}
```

**Dates (L8):** ISO 8601 UTC with explicit `Z` — `"2026-04-21T15:30:00Z"` or `"2026-04-21T15:30:00.123Z"` with sub-second precision when relevant. Never epoch millis. Never local-time strings. Application code never constructs timestamps without explicit UTC.

**UUIDs (L9):** canonical lowercase hyphenated — `"018f9a1b-3c4d-7e5f-abcd-ef0123456789"`. Never uppercase. Never stripped-hyphen format.

**Booleans:** `true` / `false` JSON literals. Never `0/1`, never strings.

**Null handling:** Pydantic models use `Optional[T]` only when the field can legitimately be absent. Empty strings and empty arrays are never `null` — use `""` or `[]`.

**Arrays vs objects for single items:** list endpoints return a plain JSON array (`GET /api/v1/projects` → `[{...}, {...}]`); item endpoints return a bare object (`GET /api/v1/projects/:id` → `{...}`). No wrapping envelope like `{"data": ...}`.

### Communication Patterns

**Event system:** none. No event bus, no async pub/sub. Vue component tree uses props/emits; Pinia stores mediate cross-component state. Backend has no internal event bus — service functions call each other directly.

**State management (frontend):**

- **Pinia stores mediate domain state.** `projectsStore`, `pollsStore`, `responseDraftStore`.
- **Immutable updates.** Stores expose actions that replace state references; no direct mutation on reactive refs from outside the store's own actions.
- **Action naming:** verb-first `camelCase` — `createProject`, `loadProjects`, `refreshAnalysis`.
- **Selectors:** expose computed getters from stores for derived state.
- **No global app state.** Session/config lives in component-local refs where needed.

### Process Patterns

**Error handling (L7):**

- **Backend:** domain operations raise typed exceptions defined in `src/kano/exceptions.py` (`EpochBumpRequired`, `PollExpired`, `PartialSubmission`, `EntityNotFound`). A single `@app.errorhandler` per exception type converts to a specific Problem Details response with the correct status code and `type` URL. Generic `Exception` handler catches unexpected errors → 500 with request_id only.
- **Frontend:** `useApi()` composable throws typed errors (`ValidationError`, `ConflictError`, `NotFoundError`, `ServerError`) carrying the Problem Details payload. Component-level `try/catch` at the action site handles each case with specific UI (toast, inline banner, dialog, etc.). No global error boundary in v1 beyond a final router-level handler for route-load failures.

**Loading states (L12):**

- **Minimize per UX spec §12.** Most actions resolve under 300 ms on PM and 150 ms on respondent; no spinner needed.
- **Vuetify skeleton loaders** only on the analysis-page initial fetch (`v-skeleton-loader`). Not a `v-progress-circular`, not a full-screen blocking overlay.
- **Per-action loading state** lives in the Pinia store action using a local boolean ref (`isLoadingProjects: Ref<boolean>`). Component accesses the store ref; no prop-drilling.

**Logging (L10):**

- **Backend:** structlog emits one JSON line per request at `INFO`. Any `logger.warning` or `logger.error` inside a handler adds context but does not duplicate the request-completion line. Log keys: `timestamp`, `level`, `request_id`, `event`, plus event-specific keys. No PII in log lines.
- **Frontend:** `console.error` only for unhandled errors (Vue `app.config.errorHandler`). `console.log` is not used in committed code (ESLint `no-console: error`).

### Enforcement Guidelines

**All contributors (human or AI) MUST:**

- Route every feature-mutation through `epoch_service.bump_epoch_on_feature_change()`. Adding a feature-touching endpoint that bypasses this service is an architectural error. Code review checklist enforces.
- Add a CHECK constraint for any enum-like column in the migration that creates it.
- Use the app's ID-generation helper (`uuid4()`) — never DB-generated UUIDs.
- Emit a structlog line on every request completion; log business events at `INFO` with the request_id bound.
- Validate every inbound body with a Pydantic schema before the handler body runs.
- Render every user-facing string via the copy-deck `useCopy()` composable — never inline literal strings in Vue templates.
- Respect route-level code-split boundaries: respondent routes must not import from `src/routes/app/**` or PM-only components.
- Use `TIMESTAMPTZ` for every timestamp column; never `TIMESTAMP` (no tz), never `DATE`+`TIME` split.
- Rebase migrations cleanly — never edit a merged migration; always create a new one.

**Pattern enforcement mechanisms:**

- **Pre-commit hooks:** ESLint, Prettier, Ruff, Black, accessibility-lint, `vue-tsc`, `mypy`.
- **CI gates:** lint + typecheck + pytest + Vitest + Playwright + axe-core + Alembic forward+rollback + docker-compose smoke.
- **Bundle-size budget:** respondent initial bundle <150 KB gzipped — CI check via `rollup-plugin-visualizer` + assertion step.
- **Code review:** `.github/PULL_REQUEST_TEMPLATE.md` checklist covers epoch-service routing, migration forward/rollback, copy-deck usage, bundle-size.

### Pattern Examples

**Good — creating a project:**

```python
# src/kano/api/projects.py
projects_bp = Blueprint("projects", __name__, url_prefix="/api/v1/projects")

@projects_bp.post("/")
@csrf.require()
def create_project() -> tuple[dict, int]:
    body = ProjectCreate.model_validate(request.get_json())
    project = project_service.create_project(body)
    return ProjectResponse.model_validate(project).model_dump(mode="json"), 201
```

**Good — respondent submit (no CSRF, atomic transaction):**

```python
@polls_bp.post("/<uuid:poll_id>/submit")
@csrf.exempt
def submit_poll(poll_id: UUID) -> tuple[dict, int]:
    body = PollSubmission.model_validate(request.get_json())
    poll_service.record_full_submission(poll_id, body)  # raises PollExpired / PartialSubmission
    return {}, 204
```

**Anti-pattern — direct feature mutation bypassing epoch service:**

```python
# FORBIDDEN
@features_bp.patch("/<uuid:feature_key>")
def update_feature(feature_key: UUID):
    feature = Feature.query.filter_by(feature_key=feature_key).first()
    feature.name = request.json["name"]   # does NOT go through epoch_service!
    db.session.commit()                    # silently corrupts epoch isolation
```

**Anti-pattern — camelCase JSON key snuck in:**

```json
{ "createdAt": "2026-04-21T15:30:00Z" }
```

Should be `"created_at"` per L1.

**Anti-pattern — DB-generated UUID:**

```python
# FORBIDDEN in models
id = Column(UUID, server_default=text("gen_random_uuid()"))
```

Should be application-generated (`default=uuid4` on the Mapped column or explicitly set in service layer).

**Anti-pattern — inline literal user-facing string:**

```vue
<!-- FORBIDDEN -->
<template><h1>Your projects</h1></template>
```

Should be `<h1>{{ copy('pm.projects.title') }}</h1>` with the string in `src/copy/en.ts`.

## Project Structure & Boundaries

### Repository Strategy

**Monorepo.** Single git repository containing `kano-frontend/`, `kano-backend/`, infra (docker-compose, Caddy, backup), and shared ops documentation. Atomic commits across frontend and backend changes; no cross-repo version sync cost for a solo-dev team.

### Complete Project Directory Structure

```
kano/
├── README.md
├── LICENSE                                # if applicable
├── .gitignore
├── .gitattributes
├── .editorconfig
├── .env.example                           # placeholder values; actual .env gitignored
├── docker-compose.yml                     # local dev: web + api + db + backup
├── docker-compose.prod.yml                # production overrides
├── Caddyfile                              # TLS termination + reverse proxy
├── .github/
│   ├── PULL_REQUEST_TEMPLATE.md           # epoch-service, migration, copy-deck, bundle-size checks
│   └── workflows/
│       ├── ci.yml                         # lint + typecheck + tests + E2E + axe + migration smoke
│       └── deploy.yml                     # on merge-to-main: build, push, SSH deploy
│
├── kano-backend/
│   ├── pyproject.toml                     # Poetry config
│   ├── poetry.lock
│   ├── Dockerfile                         # multi-stage: builder (Poetry) → runtime (python:3.12-slim)
│   ├── .python-version
│   ├── alembic.ini
│   ├── openapi.yaml                       # hand-maintained API spec
│   ├── src/
│   │   └── kano/
│   │       ├── __init__.py                # create_app() — the Flask app factory
│   │       ├── config.py                  # env-driven Config class
│   │       ├── db.py                      # SQLAlchemy engine + session factory + naming_convention
│   │       ├── exceptions.py              # domain exceptions
│   │       ├── models/
│   │       │   ├── __init__.py            # Base declarative + re-exports
│   │       │   ├── project.py
│   │       │   ├── feature.py
│   │       │   ├── poll.py
│   │       │   ├── submission.py
│   │       │   └── response.py
│   │       ├── schemas/                   # Pydantic
│   │       │   ├── __init__.py
│   │       │   ├── project.py
│   │       │   ├── feature.py
│   │       │   ├── poll.py
│   │       │   ├── submission.py
│   │       │   └── analysis.py
│   │       ├── services/                  # domain logic
│   │       │   ├── __init__.py
│   │       │   ├── epoch_service.py       # bump_epoch_on_feature_change() — the single contract
│   │       │   ├── kano_matrix.py         # 25-cell matrix, compute_category(fq, dq)
│   │       │   ├── poll_expiry.py
│   │       │   ├── poll_service.py        # record_full_submission, etc.
│   │       │   ├── project_service.py
│   │       │   └── analysis.py            # build_analysis(poll_id) — single GROUP BY
│   │       ├── api/                       # Flask blueprints, one per resource
│   │       │   ├── __init__.py            # blueprint registration
│   │       │   ├── projects.py
│   │       │   ├── features.py
│   │       │   ├── polls.py
│   │       │   ├── submissions.py
│   │       │   ├── analysis.py
│   │       │   └── errors.py              # domain exception → Problem Details registry
│   │       └── middleware/
│   │           ├── __init__.py
│   │           ├── request_id.py
│   │           ├── structured_logging.py
│   │           └── security.py            # CSRF wiring, CORS config, security headers
│   ├── migrations/                        # Alembic
│   │   ├── env.py
│   │   ├── script.py.mako
│   │   └── versions/
│   │       └── 0001_initial_schema.py     # lock the core domain schema here
│   ├── tests/
│   │   ├── conftest.py                    # shared fixtures: app, db session, client
│   │   ├── unit/
│   │   │   ├── test_kano_matrix.py        # 25-cell parametrized matrix test
│   │   │   ├── test_epoch_service.py      # bump matrix fixture
│   │   │   └── test_poll_expiry.py
│   │   └── integration/
│   │       ├── test_projects_api.py
│   │       ├── test_features_api.py       # epoch-bump route gating
│   │       ├── test_polls_api.py          # 7-day TTL boundary
│   │       ├── test_submissions_api.py    # partial-submission discard
│   │       ├── test_analysis_api.py       # single-query assertion
│   │       ├── test_timestamptz.py        # schema-level TIMESTAMPTZ assertion
│   │       └── test_alembic_roundtrip.py  # upgrade head → downgrade -1 → upgrade head
│   └── scripts/
│       ├── seed.py                        # seed sample data for local dev
│       └── bump_epoch_cli.py              # ops helper (optional)
│
├── kano-frontend/
│   ├── package.json
│   ├── package-lock.json
│   ├── Dockerfile                         # multi-stage: builder (node:24-alpine) → caddy:2-alpine
│   ├── tsconfig.json
│   ├── vite.config.ts                     # route-level code-split strategy
│   ├── vitest.config.ts
│   ├── playwright.config.ts
│   ├── .eslintrc.cjs
│   ├── .prettierrc
│   ├── index.html
│   ├── public/
│   │   ├── favicon.ico
│   │   └── robots.txt                     # Disallow: / (internal tool)
│   ├── src/
│   │   ├── main.ts                        # createApp + Vuetify + Pinia + Router
│   │   ├── App.vue                        # <router-view /> inside layout shell
│   │   ├── router.ts
│   │   ├── layouts/
│   │   │   ├── PmLayout.vue               # dark sidebar + top bar, 1440px container
│   │   │   └── RespondentLayout.vue       # chromeless, 480px container
│   │   ├── routes/                        # page-level components, by URL prefix
│   │   │   ├── app/
│   │   │   │   ├── Projects.vue           # /app/projects
│   │   │   │   ├── ProjectDetail.vue      # /app/projects/:id
│   │   │   │   └── Analysis.vue           # /app/projects/:id/polls/:pollId/analysis
│   │   │   ├── poll/
│   │   │   │   ├── Landing.vue            # /poll/:uuid
│   │   │   │   ├── Question.vue           # /poll/:uuid/q/:featureIndex
│   │   │   │   ├── Thanks.vue             # /poll/:uuid/thanks
│   │   │   │   └── Expired.vue            # /poll/:uuid/expired
│   │   │   └── NotFound.vue
│   │   ├── components/                    # custom UX components per UX spec §11
│   │   │   ├── KanoLikert.vue
│   │   │   ├── KanoLikert.spec.ts
│   │   │   ├── KanoStackedBar.vue
│   │   │   ├── KanoStackedBar.spec.ts
│   │   │   ├── KanoStackedBarTable.vue
│   │   │   ├── CatBadge.vue
│   │   │   ├── PollSharePanel.vue         # lazy-loads qrcode lib
│   │   │   ├── EpochSelector.vue
│   │   │   ├── EpochBumpDialog.vue
│   │   │   ├── EpochBumpBanner.vue
│   │   │   ├── PerCategoryPanels.vue
│   │   │   └── FeatureListEditor.vue
│   │   ├── composables/
│   │   │   ├── useApi.ts                  # fetch wrapper: request-id, CSRF, Problem Details
│   │   │   ├── useCopy.ts                 # copy-deck string-key lookup
│   │   │   └── useResponseDraft.ts        # in-memory respondent draft (no persistence, FR25)
│   │   ├── stores/                        # Pinia
│   │   │   ├── projects.ts
│   │   │   └── polls.ts
│   │   ├── api/
│   │   │   ├── client.ts                  # base URL, header injection, error mapping
│   │   │   └── types.ts                   # API response types (Project, Feature, Poll, ...)
│   │   ├── copy/
│   │   │   ├── index.ts                   # string-key registry + lookup
│   │   │   └── en.ts                      # English strings (Must-have, Delighter, Likert labels, ...)
│   │   └── theme/
│   │       ├── tixeo.ts                   # Vuetify theme tokens (colors, typography, spacing)
│   │       └── overrides.scss             # Vuetify-default overrides
│   └── e2e/                               # Playwright
│       ├── pm/
│       │   ├── create-project.spec.ts
│       │   ├── generate-poll.spec.ts
│       │   ├── analysis-scan.spec.ts
│       │   └── epoch-bump.spec.ts
│       └── respondent/
│           ├── complete-poll.spec.ts      # 16 answers via keyboard 1-5
│           ├── expired-link.spec.ts
│           └── partial-abandon.spec.ts
│
├── ops/
│   ├── backup/
│   │   ├── Dockerfile                     # tiny cron container
│   │   ├── pg_dump.sh                     # nightly pg_dump -Fc
│   │   └── crontab
│   ├── restore-drill.md                   # documented restore procedure (NFR13)
│   └── runbook.md                         # deploy, rollback, diagnose
│
└── docs/
    ├── architecture.md                    # ← this document (planning-artifacts mirror)
    ├── prd.md                             # planning-artifacts mirror
    ├── ux-design-specification.md         # planning-artifacts mirror
    ├── adr/                               # optional lightweight ADRs for post-v1 changes
    └── copy-deck.md                       # canonical copy-deck reference (matches src/copy/en.ts)
```

### Architectural Boundaries

**API boundary (the only inter-service contract):**

- REST over HTTPS, JSON bodies, snake_case wire format, RFC 7807 Problem Details errors.
- All endpoints mounted under `/api/v1/`.
- PM-facing endpoints (`/api/v1/projects/*`, `/api/v1/features/*`, `/api/v1/polls` POST) require the CSRF token from the PM session cookie.
- Public respondent endpoints (`GET /api/v1/polls/:uuid`, `POST /api/v1/polls/:uuid/submit`, `GET /api/v1/polls/:uuid/analysis`) are CSRF-exempt and require no auth — the UUIDv4 poll ID is the access credential.
- The OpenAPI spec in `kano-backend/openapi.yaml` is the single source of truth for the contract; TypeScript types in `kano-frontend/src/api/types.ts` are hand-maintained to match (no codegen in v1).

**Backend service boundaries (inside `kano-backend/src/kano/`):**

- **`api/`** is the only layer that touches HTTP. It parses Pydantic schemas, invokes services, formats responses. No business logic here.
- **`services/`** is the only layer that calls multiple models or encodes business rules. Pure functions where possible. No HTTP awareness.
- **`models/`** is the only layer that defines persistence schema. No business logic; only relationships, constraints, and column definitions.
- **`schemas/`** is the only layer that defines wire format. Decoupled from `models/` — a Pydantic `ProjectResponse` is not a SQLAlchemy `Project`.
- **`middleware/`** handles cross-cutting concerns (request-id, logging, security) exactly once per request; never duplicated across blueprints.
- **`exceptions.py`** is the only place domain exceptions are defined; `api/errors.py` is the only place they're mapped to HTTP status codes.

**Frontend component boundaries (inside `kano-frontend/src/`):**

- **`routes/`** contains page-level components; they own data-fetching lifecycle and compose domain components.
- **`components/`** contains reusable custom UI primitives from the UX spec. Props-in, emits-out, no data fetching.
- **`stores/`** mediate domain state across multiple components; actions handle API calls. Components never call `useApi()` directly outside of stores (exception: `useResponseDraft` which is explicitly in-memory and single-component).
- **`composables/`** wrap cross-cutting concerns (API, copy, response draft). No domain knowledge.
- **`layouts/`** own surface-level chrome (sidebar, top bar, containers). Routes declare their layout via route meta; components never reach into the layout.
- **`copy/`** is the only place user-facing strings live. Components call `useCopy("pm.projects.title")`.

**Data boundaries (PostgreSQL schema):**

- **`projects`** owns its identity; everything else foreign-keys into it.
- **`features`** belong to a project-epoch pair; a `(project_id, epoch)` tuple owns a specific feature set snapshot.
- **`polls`** pin to a `(project_id, epoch)` — the FK guarantees epoch isolation at the DB level.
- **`submissions`** belong to a poll; `responses` belong to a submission. This is the atomic unit per FR25.
- No cross-project references; no shared reference tables with external systems.

### Requirements to Structure Mapping

**FR → directory mapping (39 FRs across 7 categories):**

| FR Category | Primary backend location | Primary frontend location |
|---|---|---|
| Project Management (FR1–7) | `services/project_service.py`, `api/projects.py`, `api/features.py`, `models/project.py`, `models/feature.py` | `routes/app/Projects.vue`, `routes/app/ProjectDetail.vue`, `components/FeatureListEditor.vue`, `stores/projects.ts` |
| Epoch Integrity (FR8–12) | `services/epoch_service.py`, `models/feature.py` (epoch col + unique), `api/features.py` (bump gating) | `components/EpochBumpDialog.vue`, `components/EpochBumpBanner.vue`, `components/EpochSelector.vue`, `routes/app/ProjectDetail.vue` |
| Poll Lifecycle (FR13–18) | `services/poll_service.py`, `services/poll_expiry.py`, `api/polls.py`, `models/poll.py` | `components/PollSharePanel.vue`, `routes/app/ProjectDetail.vue` (poll list section) |
| Respondent Participation (FR19–27) | `api/submissions.py`, `services/poll_service.record_full_submission`, `schemas/submission.py` | `routes/poll/Landing.vue`, `routes/poll/Question.vue`, `routes/poll/Thanks.vue`, `routes/poll/Expired.vue`, `components/KanoLikert.vue`, `composables/useResponseDraft.ts` |
| Categorization (FR28–30) | `services/kano_matrix.py`, `models/response.py` | — (server-computed; frontend reads `category` from analysis response) |
| Analysis & Visualization (FR31–37) | `services/analysis.py`, `api/analysis.py` | `routes/app/Analysis.vue`, `components/KanoStackedBar.vue`, `components/KanoStackedBarTable.vue`, `components/CatBadge.vue`, `components/PerCategoryPanels.vue` |
| Guidance & Onboarding (FR38–39) | — (server returns category codes; labels are frontend copy) | `src/copy/en.ts` (category labels + tooltip copy), `components/CatBadge.vue`, Vuetify `v-tooltip` usage in `Analysis.vue` |

**NFR → location mapping:**

| NFR | Where enforced |
|---|---|
| NFR1 (analysis p95 < 3s) | `services/analysis.py` (single-query), `e2e/pm/analysis-scan.spec.ts` (Playwright navigation timing assertion) |
| NFR3 (single SQL round-trip) | `services/analysis.py` + `tests/integration/test_analysis_api.py` (query-count assertion) |
| NFR4–6 (CSRF, cookies, CORS) | `middleware/security.py`, `tests/integration/test_submissions_api.py` (CSRF-exempt assertion) |
| NFR7 (input validation) | `schemas/*.py` (Pydantic) + DB CHECK constraints in `migrations/versions/0001_initial_schema.py` |
| NFR8 (no PII) | `models/submission.py` and `models/response.py` column list (audit via code review) |
| NFR9–11 (WCAG AA, a11y fallback, axe-core) | `components/KanoStackedBarTable.vue`, `.github/workflows/ci.yml` axe-core step, `playwright.config.ts` |
| NFR12–13 (backups, restore drill) | `ops/backup/`, `ops/restore-drill.md`, `docker-compose.yml` backup service |
| NFR14 (TIMESTAMPTZ) | `tests/integration/test_timestamptz.py`, `migrations/versions/0001_initial_schema.py` |
| NFR15 (structured logs) | `middleware/structured_logging.py`, `middleware/request_id.py` |
| NFR16 (PG slow-query log) | `docker-compose.yml` postgres config (`command: -c log_min_duration_statement=500`) |
| NFR17 (`docker compose up`) | repo root `docker-compose.yml`, `.github/workflows/ci.yml` compose-smoke step |
| NFR18 (Alembic from commit #1) | `kano-backend/alembic.ini`, `migrations/versions/0001_*.py`, `tests/integration/test_alembic_roundtrip.py` |

**Cross-cutting concerns:**

- **Epoch invariant enforcement** → `services/epoch_service.py` is the single mutation path; `api/features.py` (all three FR5/6/7 endpoints) must call through it. Checked in code review via PR template.
- **Copy deck** → `src/copy/en.ts` (frontend) + `docs/copy-deck.md` (canonical reference). Every user-facing string keyed; no inline literals.
- **Request-ID correlation** → backend `middleware/request_id.py` generates UUIDv4, binds to structlog, returns `X-Request-ID`. Frontend `useApi` composable generates a client-side ID and sends `X-Request-ID` header; backend prefers incoming value if present.
- **Problem Details envelope** → backend `api/errors.py` converts domain exceptions; frontend `api/client.ts` parses and throws typed errors.
- **Structured logging** → `middleware/structured_logging.py` is imported once in `create_app()`; structlog emits one JSON line per request.

### Integration Points

**Internal communication:**

- Frontend ↔ Backend: REST/JSON over HTTPS, ingressed by Caddy, reverse-proxied to Flask's gunicorn socket. No other channel.
- Backend → PostgreSQL: SQLAlchemy session via connection pool (default QueuePool, size 5, overflow 5). No raw psycopg2 usage outside migrations.
- Backend → Logs: stdout JSON → `docker logs` → host journal.
- Backup → PostgreSQL: read-only `pg_dump` over the docker network; writes `.dump` files to the `/backups` volume.

**External integrations:**

- **TLS certificate authority:** Let's Encrypt via Caddy's built-in ACME client. Zero-config.
- **Container registry:** GitHub Container Registry (ghcr.io) for built image storage.
- **No third-party APIs consumed in v1.** No payment, no email, no analytics, no auth provider.

**Data flow:**

1. **PM authoring flow:** Browser → Vite dev server or Caddy → Flask → SQLAlchemy → PostgreSQL. Response traces backward, JSON-serialized via Pydantic.
2. **Respondent submit flow:** Browser → Caddy → Flask `POST /api/v1/polls/:uuid/submit` → `poll_service.record_full_submission()` → single transaction creating `submission` row + N `response` rows → 204 response.
3. **Analysis read flow:** Browser → Caddy → Flask `GET /api/v1/polls/:uuid/analysis` → `analysis.build_analysis(poll_id)` → single GROUP BY query to PostgreSQL → Python shapes the grouped result into `AnalysisResponse` Pydantic schema → JSON.
4. **Backup flow:** nightly cron inside `backup` service → `pg_dump -Fc` → `/backups/YYYY-MM-DD.dump` on the separate Hetzner Volume → retention pruner removes dumps older than 14 days.

### File Organization Patterns

**Configuration files:**

- **Root:** docker-compose files, Caddyfile, `.env.example`, `.gitignore`, GitHub Actions YAMLs, PR template.
- **Backend:** `pyproject.toml` (Poetry + tool configs for Ruff, Black, mypy, pytest), `alembic.ini`, `.python-version`.
- **Frontend:** `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `.eslintrc.cjs`, `.prettierrc`.
- **Linting rules are centralized** in the tool-specific config at the service root — no per-file overrides unless truly necessary.

**Source organization:**

- **Backend:** layered (`api/` → `services/` → `models/`), one-file-per-resource in each layer. Not feature-sliced — the domain is small enough that layered reads more cleanly.
- **Frontend:** feature-light, route-first. `routes/` maps 1:1 to URL prefixes; `components/` is a flat list of custom UX components. No `features/` folder — domains don't cross-cut enough to justify one.

**Test organization:**

- **Backend:** `tests/unit/` (pure functions, no DB) + `tests/integration/` (real Postgres). `conftest.py` fixtures at each level. Mirrors source layout loosely (one test file per source module when practical).
- **Frontend:** Vitest specs co-located next to the component under test (`KanoLikert.vue` + `KanoLikert.spec.ts`). Playwright `e2e/` at the frontend root, organized by surface (`pm/`, `respondent/`).

**Asset organization:**

- **Frontend `public/`:** static assets served as-is (favicon, robots.txt). No large images; icons come from Material Design Icons (mdi) as a font/SVG set installed via npm.
- **Backend:** no static assets served by Flask. Swagger UI at `/api/docs` is served via Caddy from a small static copy of Swagger UI Dist.

### Development Workflow Integration

**Development server structure:**

- Local dev: `docker compose up` from repo root. Starts `db` (postgres:17), `api` (Flask dev server via `flask run --debug`), `web` (Vite dev server on :5173 with HMR), `backup` (idle in dev). Caddy not needed for local (access services directly on mapped ports or Vite's proxy).
- Hot reload: Vite HMR on frontend; Flask debug on backend with volume-mounted source directory.
- Alembic: `docker compose exec api alembic upgrade head` run automatically on backend container start in dev via entrypoint; manual in prod.

**Build process structure:**

- **Frontend:** `npm run build` (Vite) → `dist/` with route-split chunks. CI asserts `<150 KB gzipped` on the respondent-bundle chunk.
- **Backend:** `poetry build` not used; the Dockerfile multi-stage builds directly (Poetry install in the builder stage; copy `/app` + exported requirements into the runtime stage).
- **Images:** both services produce Docker images tagged `ghcr.io/<org>/kano-api:<sha>` and `ghcr.io/<org>/kano-web:<sha>`, pushed on merge to `main`.

**Deployment structure:**

- **Hetzner host layout:**
  ```
  /opt/kano/
  ├── docker-compose.yml           # symlink or checkout of repo's prod compose
  ├── docker-compose.prod.yml
  ├── Caddyfile
  ├── .env                         # host-specific secrets
  └── volumes/
      ├── postgres/                # primary data volume
      └── backups/                 # separate Hetzner Volume mounted here (NFR12)
  ```
- **Deploy sequence (GitHub Actions):**
  1. SSH to `/opt/kano`
  2. `docker compose -f docker-compose.yml -f docker-compose.prod.yml pull`
  3. `docker compose -f ... up -d --no-deps api web`
  4. `docker compose exec api alembic upgrade head`
  5. Sanity-hit `/api/v1/health` (future endpoint) or `/api/v1/projects` and check 2xx.
  6. Rollback = re-deploy previous tagged images.
- **Caddyfile** directs `kano.example.com` to the `web` container (which serves the SPA and reverse-proxies `/api/*` to `api:8000`).

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:**

All technology choices are compatible as of April 2026:

- Vue 3.5+ + Vuetify 4.0.x + TypeScript 5+ + Vite 6+ on the frontend — canonical, supported combination.
- Flask 3.1.x + SQLAlchemy 2.x + Pydantic 2 + Alembic on the backend — canonical, supported combination on Python 3.12.
- PostgreSQL 17.x + `postgres:17` Docker image → Python 3.12 + psycopg2-binary 2.9.x → SQLAlchemy 2.x adapter — all known-good.
- Caddy 2 TLS + docker-compose on Hetzner Cloud — no compatibility issues; Caddy's Let's Encrypt integration works on any Debian/Ubuntu host.

No contradictory decisions found. The most sensitive compatibility edge — `snake_case` JSON on the wire (pattern L1) — is explicitly implemented by using Pydantic defaults (no `alias_generator=to_camel`) and accepting snake_case keys in Vue templates; nothing else in the stack fights this choice.

**Pattern Consistency:**

Implementation patterns align with architectural decisions:

- `snake_case` on the wire (L1) matches `snake_case` in PostgreSQL (L2) and Python (L4). The frontend accepts the cost of snake_case in TypeScript/Vue code to remove the conversion layer and its associated bug surface.
- UUIDv4 end-to-end: application-generated (L Enforcement) → Flask `<uuid:>` converter (L3) → PostgreSQL `UUID` column → JSON `"018f9a1b-..."` (L9) → TypeScript `string` (because a UUID is opaque to the frontend).
- `TIMESTAMPTZ` on disk (L2) + ISO 8601 `Z` on the wire (L8) + UTC in application code (NFR14) — single timezone regime across all three layers.
- RFC 7807 Problem Details (D8) + request_id middleware (D14) compose: every error response carries a correlation ID that matches the log line.
- Epoch service (D4/cross-cutting) is the only mutation path for feature-set changes; enforced at the pattern level (L Enforcement "All contributors MUST route").

**Structure Alignment:**

Project structure supports every architectural decision:

- Route-level code splitting (D Frontend) maps directly to `src/routes/app/**` and `src/routes/poll/**` directory split — Vite chunks naturally on that boundary.
- Epoch service centralization maps to exactly one file (`services/epoch_service.py`), bound by imports from every feature-mutation blueprint (`api/features.py`).
- CSRF scope split (PM-only vs public respondent) maps to exactly two blueprint registrations (`projects_bp`, `features_bp`, `polls_bp` create/admin endpoints) vs one (`submissions_bp`, `analysis_bp` public endpoints); `middleware/security.py` binds CSRF to only the former.
- Single-SQL analysis constraint maps to exactly one file (`services/analysis.py`) with an integration test that asserts query count == 1.
- Backup-volume separation maps to the docker-compose `/backups` volume on a distinct Hetzner Volume mount.

### Requirements Coverage Validation ✅

**Functional Requirements Coverage (39/39):**

All 39 FRs are architecturally supported. Spot-check of load-bearing cases:

| FR | How supported |
|---|---|
| FR8 (auto epoch increment) | `services/epoch_service.py` invoked by every feature mutation blueprint; enforced via PR checklist. |
| FR11 (confirmation before epoch bump) | Frontend `<EpochBumpDialog>` (firm register) + `<EpochBumpBanner>` (soft register), driven by backend 409 `epoch-bump-required` Problem Details. |
| FR15 (7-day TTL) | `poll.expires_at` `TIMESTAMPTZ` column; `services/poll_expiry.py` read-path filter; integration test at 7-day boundary. |
| FR25 (discard partial) | Atomic transaction in `poll_service.record_full_submission()`: creates `submission` + all N `response` rows, or nothing. Any failure → rollback → 422. |
| FR28 (categorization matrix) | `services/kano_matrix.py` as pure function; 25-cell parametrized matrix test. |
| FR35 (tie display) | Frontend computes tie state from the `category→count` map returned by the single GROUP BY; `<CatBadge>` renders joint-dominant badges. |
| FR37 (empty state) | Frontend `Analysis.vue` detects response count == 0 and renders empty-state copy; no empty bars or zero-percent dominants ever rendered. |

**Non-Functional Requirements Coverage (18/18):**

| NFR | How supported | Verifiable where |
|---|---|---|
| NFR1 (3s p95 analysis) | Single GROUP BY + lean response payload | `e2e/pm/analysis-scan.spec.ts` Playwright navigation timing on seeded 20×500 dataset |
| NFR2 (<3 min respondent) | Auto-advance Likert, lean respondent bundle | measured post-first-study |
| NFR3 (single SQL round-trip) | `services/analysis.py` structure | `tests/integration/test_analysis_api.py` query-count == 1 assertion |
| NFR4 (CSRF) | Flask-WTF on `/app/*` endpoints | `tests/integration/test_submissions_api.py` asserts CSRF-exempt on public endpoints |
| NFR5 (SameSite/Secure) | `middleware/security.py` cookie config | integration test |
| NFR6 (CORS allowlist) | `middleware/security.py` | integration test |
| NFR7 (input validation) | Pydantic schemas + DB CHECK constraints | schema tests + `tests/integration/test_submissions_api.py` |
| NFR8 (no PII) | Schema excludes identifying columns | schema inspection test + code review |
| NFR9 (WCAG 2.1 AA) | Vuetify defaults + UX spec component contracts | axe-core in CI |
| NFR10 (accessible viz fallback) | `KanoStackedBarTable.vue` | Playwright screen-reader smoke test |
| NFR11 (axe-core in CI) | `.github/workflows/ci.yml` | merge gate |
| NFR12 (daily pg_dump separate volume) | `ops/backup/` + docker-compose volume | restore-drill |
| NFR13 (restore-tested) | `ops/restore-drill.md` | manual gate before first PM study |
| NFR14 (TIMESTAMPTZ UTC) | Schema column types | `tests/integration/test_timestamptz.py` |
| NFR15 (structured logs) | `middleware/structured_logging.py` | log inspection |
| NFR16 (slow query log 500ms) | `docker-compose.yml` postgres command | log inspection |
| NFR17 (docker compose up) | repo root | `.github/workflows/ci.yml` compose-up smoke step |
| NFR18 (Alembic from commit #1) | `migrations/versions/0001_*.py` | `tests/integration/test_alembic_roundtrip.py` |

### Implementation Readiness Validation ✅

**Decision Completeness:**

All 16 core decisions (D1–D16) documented with rationale and cross-component implications. Minor additions from this validation (G1–G4 below) close the last specificity gaps.

**Pattern Completeness:**

Twelve pattern categories cover the full surface where AI agents could diverge:

1. JSON wire format ✓
2. Database naming ✓
3. API endpoints ✓
4. Python naming ✓
5. TypeScript/Vue naming ✓
6. File & folder organization ✓
7. Error handling ✓
8. Date format ✓
9. UUID format ✓
10. Logging levels ✓
11. Test organization ✓
12. Loading state ✓

Enforcement mechanisms (pre-commit, CI, PR template, bundle-size budget) make the patterns verifiable, not aspirational.

**Structure Completeness:**

Every file and directory in the monorepo tree is named. FR→directory and NFR→location mappings are explicit. No "TBD" placeholders remain in the structure section.

### Gap Analysis & Resolutions

**G1 — Health check endpoint missing.**

The deploy step references `/api/v1/health` as a post-deploy sanity check; no functional requirement introduced it. Resolution:

- Add endpoint: `GET /api/v1/health` → `200 OK { "status": "ok", "version": "<git-sha>", "db": "connected" }`. No auth, no CSRF.
- Location: new file `src/kano/api/health.py`, blueprint `health_bp` mounted at `/api/v1/health`.
- Version injected via environment variable `KANO_VERSION` set to the git SHA at image build.
- DB check: lightweight `SELECT 1` — fails closed if the DB is unreachable (`503 Service Unavailable`).

**G2 — CSRF token distribution unspecified.**

The Security section mentions "meta tag or endpoint" without choosing. Resolution:

- Add endpoint: `GET /api/v1/csrf-token` → `200 OK { "csrf_token": "..." }`. Requires the PM session cookie; sets it on first call if absent.
- SPA calls this on first navigation into `/app/*` via a Pinia-side-effect-free composable (`useCsrf()`).
- `useApi()` reads the cached token and sends it on every non-GET request to `/api/v1/*` from the PM routes.
- Respondent routes neither call the endpoint nor read the cookie.

**G3 — OpenAPI ↔ TypeScript types drift risk.**

Both `kano-backend/openapi.yaml` and `kano-frontend/src/api/types.ts` are hand-maintained. Drift is silent and will surface as runtime errors. Resolution:

- PR checklist item: "If `openapi.yaml` changed, `src/api/types.ts` was updated to match. If reverse, same."
- Explicit future-enhancement flag (not v1): migrate to codegen via `openapi-typescript` to eliminate the risk entirely. Named in v2 candidates.
- v1 mitigation: endpoint contract tests that round-trip through the full stack catch mismatches at test time, not runtime.

**G4 — Bundle-size budget measurement tool unspecified.**

Resolution:

- Pin `size-limit` npm package in `kano-frontend/package.json` dev dependencies.
- Configuration in `kano-frontend/.size-limit.json`:
  ```json
  [
    { "path": "dist/assets/poll-*.js", "limit": "150 KB", "gzip": true },
    { "path": "dist/assets/app-*.js", "limit": "500 KB", "gzip": true }
  ]
  ```
- `.github/workflows/ci.yml` runs `npx size-limit` as a merge gate.

### Future Enhancements (Not v1 Gaps)

- **OpenAPI→TypeScript codegen** via `openapi-typescript` — eliminates G3 drift entirely. Deferred to v2 when endpoint count grows.
- **Observability upgrade path** — Promtail → Loki → Grafana for multi-host log aggregation. v1 uses `docker logs` + journalctl.
- **Analysis-query performance budget at DB level** — `EXPLAIN ANALYZE` assertion on the GROUP BY for the 20×500 dataset. v1 relies on Playwright navigation timing only.
- **ADR (Architecture Decision Records)** — lightweight `docs/adr/0001-*.md` files for post-v1 architectural changes. Folder scaffolded; no ADRs in v1 itself.
- **Cross-host backup replication** — offsite copy via rclone to an S3-compatible bucket. v1 is single-host separate-volume only.
- **Scheduled cleanup of expired polls** — PRD flagged this as Phase 2. v1 filters expired polls at read time; storage growth is negligible.

### Architecture Completeness Checklist

**✅ Requirements Analysis**

- [x] Project context thoroughly analyzed (39 FRs + 18 NFRs mapped)
- [x] Scale and complexity assessed (medium, full-stack, greenfield)
- [x] Technical constraints identified (PRD-locked stack, NFR3 single-SQL)
- [x] Cross-cutting concerns mapped (10 identified)

**✅ Architectural Decisions**

- [x] Critical decisions documented with versions (D1–D16)
- [x] Technology stack fully specified (Python 3.12, Flask 3.1.x, SQLAlchemy 2.x, Vue 3.5+, Vuetify 4.0.x, Postgres 17, Alembic, Poetry)
- [x] Integration patterns defined (REST/JSON, Problem Details, CSRF scope split)
- [x] Performance considerations addressed (NFR1 via Playwright timing, NFR3 via schema + query-count test, bundle-size via size-limit)

**✅ Implementation Patterns**

- [x] Naming conventions established (L2–L5 across DB, API, Python, Vue)
- [x] Structure patterns defined (L6 + full tree in Structure section)
- [x] Communication patterns specified (L7 error handling, state management, no event bus)
- [x] Process patterns documented (logging L10, testing L11, loading state L12)

**✅ Project Structure**

- [x] Complete directory structure defined (monorepo tree; no TBDs)
- [x] Component boundaries established (api/services/models/schemas on backend; routes/components/stores/composables on frontend)
- [x] Integration points mapped (REST boundary, docker-compose service topology, deploy sequence)
- [x] Requirements to structure mapping complete (FR + NFR tables)

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION

**Confidence Level:** HIGH

Rationale:

- The single most irreversible decision (schema shape, D4) is locked with an explicit FK topology, a test strategy (parametrized bump-matrix fixture), and an operational contract (one mutation path via `epoch_service`).
- The single most performance-critical constraint (NFR3 single SQL round-trip) has a matching test (`test_analysis_api.py` query-count == 1) that makes regressions visible at commit time, not production.
- The security posture is deliberately conservative in the right places (CSRF, CORS allowlist, UUIDv4 URLs, no PII) and deliberately thin where PRD says "fully public" (no auth, no rate limit) — consistent with the product scope, not over-engineered.
- Two-surface responsive split is route-deep: Vite's code splitting naturally cuts at the `routes/app/**` vs `routes/poll/**` boundary, and the size-limit CI gate makes the respondent-lean-bundle constraint a hard merge gate rather than a hope.
- The testing pyramid (pytest unit + pytest integration + Playwright E2E + axe-core + Alembic forward+rollback + docker-compose smoke + size-limit) covers every correctness-critical dimension.

**Key Strengths:**

- **Epoch model FK topology** makes epoch isolation structurally impossible to violate at the DB level, not a runtime invariant.
- **Single-query analysis** is schema-enforced — the per-epoch feature rows shape makes the GROUP BY natural; any divergence would show up as an awkward schema review.
- **Snake_case end-to-end** removes a category of bugs at the cost of TypeScript aesthetics.
- **Hand-maintained OpenAPI + TS types** trades drift risk for zero build-toolchain surface; acceptable at the v1 endpoint count.
- **Single-node PostgreSQL + docker-compose + Hetzner** keeps the production surface radically small for solo operations.
- **Alembic from commit #1 + forward/rollback CI gate** prevents the most common greenfield schema-migration pain.

**Areas for Future Enhancement:**

- OpenAPI→TS codegen to eliminate drift (v2).
- Observability upgrade beyond `docker logs` (v2).
- Rate limiting if abuse patterns emerge (v2).
- Cross-host backup replication (v2).
- Scheduled cleanup of expired polls if storage growth becomes visible (per PRD).

### Implementation Handoff

**AI Agent Guidelines:**

- Follow all architectural decisions (D1–D16) exactly as documented; deviations require an ADR.
- Apply all pattern conventions (L1–L12) in every new file. Pre-commit hooks + CI gates make most violations visible immediately.
- Respect the monorepo structure and component boundaries. The four load-bearing boundaries — API layer vs service layer, feature-mutation via epoch service, CSRF scope split, respondent vs PM bundle isolation — are architectural invariants, not stylistic preferences.
- Refer to this document for all architectural questions before consulting external guidance. External guidance that conflicts with a locked decision here is wrong for this project.

**First Implementation Priorities (ordered):**

1. **Scaffold both services** via the commands in the Starter Template section.
2. **Lock the core schema** in Alembic migration `0001_initial_schema.py` — the five tables, all FK and CHECK constraints, indexes, `TIMESTAMPTZ` columns. This is the single most irreversible artifact in the project.
3. **Implement `services/epoch_service.py`** with the `bump_epoch_on_feature_change()` contract + parametrized bump-matrix test.
4. **Implement `services/kano_matrix.py`** + 25-cell parametrized matrix test.
5. **Implement `services/analysis.py`** + query-count == 1 integration test.
6. **Wire `middleware/security.py`** (CSRF, CORS, cookie attributes) + integration tests asserting CSRF-exempt on public endpoints and allowlist on CORS.
7. **Wire `middleware/request_id.py`** + `middleware/structured_logging.py` + verify one JSON line per request.
8. **Stand up docker-compose** with all four services (web, api, db, backup) and verify `docker compose up` green on a clean checkout.
9. **Build the PM SPA surface** (routes/app/**) with the 10 custom components per UX spec §11.
10. **Build the respondent SPA surface** (routes/poll/**) with bundle-size CI gate active from the start.
11. **GitHub Actions pipeline** (lint + typecheck + pytest + Vitest + Playwright + axe-core + Alembic roundtrip + docker-compose smoke + size-limit).
12. **Seed and execute the restore drill** per NFR13 before the first PM study.
13. **First real PM study** — the ultimate acceptance test.
