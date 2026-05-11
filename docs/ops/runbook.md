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

First boot takes **1–3 minutes** end-to-end (frontend `npm ci` dominates;
DB healthcheck + Alembic upgrade + Flask boot together are ~10 s on the
critical path). Subsequent boots reuse cached layers and the named
`frontend_node_modules` volume — typically <15 s.

| Service | URL | Notes |
|---|---|---|
| `web`   | http://localhost:5173/  | Vue SPA, Vite HMR enabled |
| `api`   | http://localhost:5000/api/v1/health | Flask `--debug`, hot-reload on src edits |
| `db`    | `psql postgresql://kano:change-me@localhost:5432/kano` | Postgres 17, slow-query log ≥500 ms, bound to **127.0.0.1 only** (DSN matches `.env.example`) |

## Smoke checklist (manual day-zero verification)

1. `cp .env.example .env`
2. `docker compose up --build` — all four services start, no fatal logs
3. `curl -s http://localhost:5000/api/v1/health | jq .status` → `"ok"`
4. `curl -sI http://localhost:5173/` → `HTTP/1.1 200 OK`
5. `curl -s http://localhost:5173/api/v1/health | jq .status` → `"ok"` (Vite proxy round-trip)
6. Edit `kano-backend/src/kano/api/health.py` (e.g. add a no-op log line) — Flask --debug reloads within 2 s; new request hits the new code
7. Edit `kano-frontend/src/main.ts` (any change) — Vite HMR pushes the change within 1 s
8. `docker compose down -v` — all containers stop, named volumes (`kano_db_data`, `kano_backup_data`, `kano_frontend_node_modules`) removed; next `docker compose up` is fully fresh

> **`docker compose down -v` destroys all DB data.** Use it freely during
> day-zero verification; once real response data is in the DB, run
> `docker compose exec db pg_dump -U kano kano > /tmp/kano-$(date +%F).sql`
> first or use the `backup` service (Story 6-1 once implemented).

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

### `api` port 5000 collides with an existing service

On macOS 12+, **AirPlay Receiver binds 5000** by default. On Linux dev
machines, a common collision is a local `docker registry` container or
another Python service. Two options:

- Stop the offender: `sudo lsof -i :5000` to find it, then stop it.
- Or, for a one-off, edit `docker-compose.yml`'s `api` ports line to
  `"5001:5000"` and hit the API at `http://localhost:5001/api/v1/health`.
  (Vite proxy uses internal Docker DNS via `VITE_API_PROXY`, so the SPA
  surface is unaffected.)

### `api` fails with `database "kano_v2" does not exist`

You changed `POSTGRES_DB` (or `POSTGRES_USER`) in `.env` after the initial
boot. Postgres's official image creates the role + DB **only on first
init** — subsequent boots reuse what's on the named volume. Reset:

```bash
docker compose down -v          # destroys db_data (back up first if needed)
docker compose up --build
```

### `web` exits with `EACCES: permission denied, mkdir '/app/node_modules'`

The host's `node_modules` is shadowing the container's volume. Wipe **only**
the frontend modules volume (not the whole stack — that would lose DB
data):

```bash
docker compose down
docker volume rm kano_frontend_node_modules
docker compose up --build
```

### `api` reports `connection refused` to the database

The DB healthcheck normally gates this. The entrypoint also retries the
Alembic upgrade up to 15× with a 2 s sleep between attempts — even a slow
laptop should ride through bootstrap. If you still see a stuck container,
check `docker compose logs db` for an init error (commonly a malformed
`POSTGRES_PASSWORD` containing shell metacharacters in `.env`).

### Slow first boot

The frontend `npm ci` step can take 1–3 minutes on first build. Subsequent
boots use the named `frontend_node_modules` volume and are sub-second.

## CI baseline

Owned by **Story 1.10**. The CI pipeline runs lint + typecheck + tests +
size-limit + Playwright + migration roundtrip + a `docker compose up -d
--build --wait` smoke against this very stack. The job list, branch
protection setup, and pre-commit configuration land alongside that story —
this section will reference `.github/workflows/ci.yml` and
`.pre-commit-config.yaml` once they exist.

## Things this story does NOT do

- No production overlay (`docker-compose.prod.yml`) — Story 7.1 (Caddy +
  TLS).
- No automated CI smoke (`docker compose up -d --wait`) — Story 1.10.
- No backup cron — Story 6-1 attaches `pg_dump` + retention to the `backup`
  service.
- No reverse proxy in dev — Vite handles `/api` proxying; Caddy is
  production-only.
