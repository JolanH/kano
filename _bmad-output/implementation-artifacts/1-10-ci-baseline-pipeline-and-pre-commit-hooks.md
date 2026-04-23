# Story 1.10: CI baseline pipeline and pre-commit hooks

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a solo dev,
I want `.github/workflows/ci.yml` running lint, typecheck, pytest, Vitest, Alembic forward+rollback smoke, `docker compose up -d --wait` smoke, and size-limit bundle check on every PR, plus pre-commit hooks mirroring the linters,
so that no regression lands on main and the CI gates are in place for every downstream epic.

## Acceptance Criteria

1. **Given** a PR is opened, **when** the CI workflow triggers, **then** the pipeline runs ESLint + Prettier on frontend, Ruff + Black on backend, vue-tsc typecheck, mypy typecheck.
2. pytest runs unit + integration tests; Vitest runs frontend specs.
3. An Alembic roundtrip step executes `alembic upgrade head && alembic downgrade -1 && alembic upgrade head` against a throwaway PostgreSQL 17 service container.
4. A compose-smoke step runs `docker compose up -d --wait` followed by an HTTP check on `/api/v1/health`.
5. A size-limit step runs `npx size-limit` against the frontend build output (configuration in `kano-frontend/.size-limit.json` with entries for PM and respondent bundles; respondent initial bundle capped at 150 KB gzipped).
6. Any failing gate blocks the PR from merging.
7. **Given** I set up pre-commit locally via `pre-commit install`, **when** I attempt a commit, **then** ESLint, Prettier, Ruff, Black, vue-tsc, mypy, and an accessibility-lint plugin run on staged files; failing any blocks the commit.

## Tasks / Subtasks

- [ ] `.github/workflows/ci.yml` — single workflow, multiple jobs (AC: #1–6)
  - [ ] Trigger: `on: [pull_request]` + `on: push: branches: [main]`
  - [ ] Jobs (run in parallel except where noted):
    1. **lint-frontend**: `node:24-alpine` runner; `cd kano-frontend && npm ci && npm run lint && npm run format:check`
    2. **lint-backend**: `python:3.12` runner; install Poetry; `cd kano-backend && poetry install --with dev && poetry run ruff check . && poetry run black --check .`
    3. **typecheck-frontend**: `cd kano-frontend && npm ci && npm run typecheck` (runs `vue-tsc --noEmit`)
    4. **typecheck-backend**: `cd kano-backend && poetry install --with dev && poetry run mypy src/`
    5. **test-backend**: with a Postgres 17 service container (`services: postgres: image: postgres:17 ...`); `poetry run pytest --cov=kano --cov-branch --cov-report=xml` — uploads coverage artifact; enforces ≥85% line on critical modules (kano_matrix, epoch_service, poll_expiry) via `--cov-fail-under` per-module or a tail assertion step
    6. **test-frontend**: `cd kano-frontend && npm ci && npm run test:unit` (Vitest)
    7. **migration-roundtrip**: Postgres 17 service; runs `poetry run alembic upgrade head && poetry run alembic downgrade -1 && poetry run alembic upgrade head`
    8. **e2e-playwright**: Postgres service + starts frontend+backend; `cd kano-frontend && npm ci && npx playwright install --with-deps && npm run test:e2e` — includes the axe-core gate on every E2E spec
    9. **compose-smoke**: full Docker setup; `docker compose up -d --wait`; `curl --fail http://localhost:5000/api/v1/health`; tear down
    10. **size-limit**: `cd kano-frontend && npm ci && npm run build && npx size-limit`
  - [ ] Branch protection rules on `main`: require all of the above job statuses to succeed before merge; configure via GitHub UI (document setup in `docs/ops/runbook.md`)
- [ ] Frontend CI scripts (AC: #1, #2, #5)
  - [ ] `kano-frontend/package.json` scripts: `"lint": "eslint src/ --max-warnings 0"`, `"format:check": "prettier --check src/"`, `"typecheck": "vue-tsc --noEmit"`, `"test:unit": "vitest run"`, `"test:e2e": "playwright test"`, `"build": "vite build"`, `"size": "size-limit"`
  - [ ] `kano-frontend/.size-limit.json`:
    ```json
    [
      {
        "name": "PM bundle (desktop)",
        "path": "dist/assets/pm-*.js",
        "limit": "400 KB",
        "gzip": true
      },
      {
        "name": "Respondent bundle (mobile)",
        "path": "dist/assets/respondent-*.js",
        "limit": "150 KB",
        "gzip": true
      }
    ]
    ```
    (Exact chunk filename patterns depend on Story 1.6's `manualChunks` naming — adjust globs to match `dist/assets/*` output.)
- [ ] Backend CI test invocation (AC: #2, #3)
  - [ ] `kano-backend/pyproject.toml` pytest config includes `markers` for `unit` and `integration`; coverage config for critical modules per PRD Technical Success
  - [ ] Alembic roundtrip script: `scripts/alembic_roundtrip.sh` — `set -e; alembic upgrade head; alembic downgrade -1; alembic upgrade head` — called from CI job
- [ ] Pre-commit hooks (AC: #7)
  - [ ] `.pre-commit-config.yaml` at repo root:
    - `repos:`
      - `- repo: https://github.com/pre-commit/mirrors-eslint` — staged Vue/TS files
      - `- repo: https://github.com/pre-commit/mirrors-prettier` — staged Vue/TS/JSON/MD files
      - `- repo: https://github.com/astral-sh/ruff-pre-commit` — staged Python files
      - `- repo: https://github.com/psf/black-pre-commit-mirror` — staged Python files
      - `- repo: https://github.com/vuejs/vue-tsc` — OR run via `npx vue-tsc --noEmit` as `local` hook scoped to `.vue`/`.ts`
      - `- repo: https://github.com/pre-commit/mirrors-mypy` — staged Python files
      - Accessibility lint: `- repo: local` hook running `npx @axe-core/cli` on changed `.vue` files — caveat: axe-cli is DOM-based, not AST-based; the lint hook may fall back to `eslint-plugin-vuetify` rules + `eslint-plugin-jsx-a11y` equivalents for Vue. Evaluate at implementation time; the AC permits either approach as long as some a11y gate runs on staged files.
  - [ ] `README.md` quickstart: document `pip install pre-commit && pre-commit install` as the one-time local setup
- [ ] PR template integration (AC: #6, #7)
  - [ ] Confirm the PR template from Story 1.1 lists each gate (bundle size, migration roundtrip, copy-deck, epoch-service routing) — the CI enforces these automatically; the template is the human-readable reminder

## Dev Notes

### CI job topology

Jobs are parallelized where possible — linters and typecheckers are independent; Postgres-backed jobs share a service container pattern. Target CI total wall time: <8 min for a green PR. If it grows beyond 10 min, revisit caching (Poetry cache, npm cache, Playwright browser cache).

### GitHub Actions service containers

For Postgres-needing jobs:

```yaml
services:
  postgres:
    image: postgres:17
    env:
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test
      POSTGRES_DB: kano_test
    options: >-
      --health-cmd pg_isready
      --health-interval 5s
      --health-timeout 3s
      --health-retries 5
    ports:
      - 5432:5432
```

Resolve `DATABASE_URL=postgresql+psycopg2://test:test@localhost:5432/kano_test` in the job env.

### Coverage gate strategy

PRD Technical Success (line 95): "≥85% line coverage, 100% branch coverage on epoch-versioning and categorization modules". Implementation:

- Global coverage floor: `--cov-fail-under=80` (generous overall floor)
- Per-module gates via a post-test script that runs `coverage report --include="src/kano/services/kano_matrix.py" --fail-under=100` (branch-100% via `--cov-branch`) and similarly for `epoch_service.py` (arrives in Epic 2) and `poll_expiry.py` (Epic 3). In Story 1.10, only `kano_matrix.py` exists; gate only that one and leave comments for when the others land.

### Compose-smoke in CI

```yaml
- name: Compose smoke
  run: |
    cp .env.example .env
    docker compose up -d --wait
    curl --fail --retry 3 --retry-delay 2 http://localhost:5000/api/v1/health
    docker compose down -v
```

The `--wait` flag in modern docker-compose (v2.22+) blocks until services report healthy. Install the latest compose: GitHub Actions `ubuntu-latest` runners already ship it.

### size-limit placement

Size-limit runs against `dist/` after `vite build`. Verify the chunk-name globs in `.size-limit.json` match the actual output filenames — depends on Vite's `output.chunkFileNames` pattern. If needed, set `output.chunkFileNames: 'assets/[name]-[hash].js'` in `vite.config.ts` (Story 1.6) to get predictable patterns.

### Pre-commit mypy caveat

`mypy` on staged Python files in isolation can miss cross-module type errors. Scope the pre-commit mypy to `--install-types --non-interactive src/` for the whole backend package rather than only staged files. If this makes commits too slow (>5s), demote to CI-only — AC #7 requires it on pre-commit but "fast enough to run on every commit" is a practical constraint worth discussing with Kanaud at implementation time.

### Accessibility-lint plugin selection

Options, pick one:

1. `eslint-plugin-vuejs-accessibility` — Vue-template a11y rules (no-autofocus, alt-text, valid ARIA, etc.). AST-based, fast. **Recommended.**
2. `@axe-core/cli` on the built HTML — DOM-based, accurate, but needs a running dev server. CI-only realistically.
3. Both — plugin at pre-commit, axe-core runtime check at CI (already covered by the Playwright+axe step).

Go with #1 for pre-commit. Axe-core at runtime is already the gate per NFR11 via Playwright.

### What this story does NOT do

- No deploy pipeline — Story 7-3 handles CD (build images, push, SSH deploy).
- No coverage-badge publication — nice-to-have, not required.
- No release-notes automation — future concern.

### Testing standards

- CI config lives outside the normal test suites; verify by opening a draft PR and confirming all jobs run and pass on a clean commit.
- For pre-commit, test locally: `pre-commit run --all-files` should pass on the currently-committed codebase.

### Project Structure Notes

Files created:
- `.github/workflows/ci.yml`
- `.pre-commit-config.yaml` (repo root)
- `kano-frontend/.size-limit.json`
- `kano-backend/scripts/alembic_roundtrip.sh`
- `README.md` — extend quickstart with pre-commit install step
- `docs/ops/runbook.md` — branch-protection rules + CI job descriptions

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#CI/CD] — workflow shape (D12, line 436)
- [Source: _bmad-output/planning-artifacts/architecture.md#Pattern enforcement mechanisms] — pre-commit + CI gate list (line 756)
- [Source: _bmad-output/planning-artifacts/architecture.md#Testing discipline] — coverage gates on critical modules (line 82)
- [Source: _bmad-output/planning-artifacts/prd.md#NFR11] — axe-core in CI blocks merge on new violations
- [Source: _bmad-output/planning-artifacts/prd.md#NFR17] — compose-smoke gate
- [Source: _bmad-output/planning-artifacts/prd.md#MVP Readiness Gates] — full gate list before first PM study
- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.10] — original AC source
- [Source: _bmad-output/implementation-artifacts/1-1-monorepo-scaffold-*.md] — scaffolder produces the lint configs and scripts
- [Source: _bmad-output/implementation-artifacts/1-9-docker-compose-local-boot-*.md] — compose-smoke target (`/health` assertion)

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
