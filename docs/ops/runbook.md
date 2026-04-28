# Kano local-stack runbook

> Story 1.9 ships the day-zero `docker compose up` flow. Story 1.10 wires the
> same flow into CI as a smoke test. Story 6-1 attaches real backup logic to
> the `backup` service. Story 7-1 swaps the frontend container's `target` to
> `runtime` for the production overlay.

## Quickstart

```bash
cp .env.example .env          # placeholders are dev-safe; tighten for non-dev
docker compose up --build     # first run: builds three images
```

After ~30 s (DB healthcheck + migrations + frontend npm-ci) the stack is up:

| Service | URL | Notes |
|---|---|---|
| `web`   | http://localhost:5173/  | Vue SPA, Vite HMR enabled |
| `api`   | http://localhost:5000/api/v1/health | Flask `--debug`, hot-reload on src edits |
| `db`    | `psql postgresql://kano:change-me@localhost:5432/kano` | Postgres 17, slow-query log ≥500 ms (DSN matches `.env.example`) |

## Smoke checklist (manual day-zero verification)

1. `cp .env.example .env`
2. `docker compose up --build` — all four services start, no fatal logs
3. `curl -s http://localhost:5000/api/v1/health | jq .status` → `"ok"`
4. `curl -sI http://localhost:5173/` → `HTTP/1.1 200 OK`
5. `curl -s http://localhost:5173/api/v1/health | jq .status` → `"ok"` (Vite proxy round-trip)
6. Edit `kano-backend/src/kano/api/health.py` (e.g. add a no-op log line) — Flask --debug reloads within 2 s; new request hits the new code
7. Edit `kano-frontend/src/main.ts` (any change) — Vite HMR pushes the change within 1 s
8. `docker compose down -v` — all containers stop, named volumes (`db_data`, `backup_data`, `frontend_node_modules`) removed; next `docker compose up` is fully fresh

## Common operations

### Tail logs

```bash
docker compose logs -f api          # Flask request log + structlog JSON
docker compose logs -f db           # Postgres + slow-query log
docker compose logs -f web          # Vite dev-server output
```

### Open a psql shell

```bash
docker compose exec db psql -U kano kano
```

### Re-run migrations manually

```bash
docker compose exec api alembic upgrade head
docker compose exec api alembic downgrade base       # nuke + replay
```

### Re-build a single image

```bash
docker compose build api            # after pyproject.toml changes
docker compose build web            # after package.json changes
```

### Smoke /health from inside the network

```bash
docker compose exec web wget -qO- http://api:5000/api/v1/health
```

## Troubleshooting

### `web` exits with `EACCES: permission denied, mkdir '/app/node_modules'`

Means the host's `node_modules` is shadowing the container's volume. Wipe the
named volume and rebuild:

```bash
docker compose down -v
docker compose up --build
```

### `api` reports `connection refused` to the database

The DB healthcheck normally gates this, but if your machine is slow on first
boot the API may race ahead. Either:

- `docker compose restart api` — by now the DB is up and Alembic completes
- or rely on the `depends_on: condition: service_healthy` clause; that's the
  canonical fix and it's already configured

### Slow first boot

The frontend `npm ci` step can take 1–2 minutes on first build. Subsequent
boots use the named `frontend_node_modules` volume and are sub-second.

## CI baseline (Story 1.10)

`.github/workflows/ci.yml` runs on every PR and push to `main`:

| Job | What it gates |
|---|---|
| `lint-frontend`         | `npm run lint` (ESLint flat config + `vue/no-bare-strings-in-template`) |
| `typecheck-frontend`    | `vue-tsc --build --force` |
| `test-frontend`         | `vitest run` (unit specs under `tests/unit/**`) |
| `size-limit`            | Bundle size against `.size-limit.json` (respondent ≤150 KB gz, PM ≤400 KB gz, runtime ≤200 KB gz) |
| `e2e-playwright`        | Theme-audit spec — zero console errors, zero axe-core violations, screenshot diff |
| `lint-backend`          | `ruff check` + `black --check` over `src tests migrations` |
| `typecheck-backend`     | `mypy --strict` |
| `test-backend`          | `pytest --cov=kano --cov-branch`; enforces 100 % line + branch on `kano.services.kano_matrix` |
| `migration-roundtrip`   | `alembic upgrade head && alembic downgrade -1 && alembic upgrade head` against a Postgres 17 service container |
| `compose-smoke`         | `docker compose up -d --build --wait` then probes `/api/v1/health` and the SPA root |

### Branch protection — one-time setup

In GitHub → repository → **Settings → Branches → Branch protection rules**:

1. Pattern: `main`
2. Require a pull request before merging
3. Require status checks to pass: tick **every** job name from the table above
4. Require conversation resolution before merging
5. Disallow force pushes
6. Disallow deletions

The job names appear in the dropdown only after the workflow has run once on
any branch — push a no-op commit to a feature branch first to populate them.

### Pre-commit (local mirror of CI)

```bash
pip install pre-commit
pre-commit install                  # one-time per clone
pre-commit run --all-files          # exercise the full hook suite
```

`.pre-commit-config.yaml` runs Ruff, Black, ESLint, vue-tsc, mypy, and
generic-hygiene hooks. The TypeScript/mypy hooks are scoped to the package
root so they pick up cross-module errors.

## Things this story does NOT do

- No production overlay (`docker-compose.prod.yml`) — Story 7.1 (Caddy +
  TLS).
- No automated CI smoke (`docker compose up -d --wait`) — Story 1.10.
- No backup cron — Story 6-1 attaches `pg_dump` + retention to the `backup`
  service.
- No reverse proxy in dev — Vite handles `/api` proxying; Caddy is
  production-only.
