#!/bin/sh
# Kano API container entrypoint.
#
# Applies pending Alembic migrations against the database, then launches
# Flask. Failure of either step exits non-zero so the orchestrator can
# decide whether to restart or surface the failure (compose: depends_on +
# healthcheck; CI: `--wait` flips red on a non-200 /health).
#
# Even with compose's `depends_on: db: condition: service_healthy`, the DB
# can still race ahead of us during initial bootstrap: the healthcheck
# returns green when Postgres accepts TCP, but the role/database creation
# from the official postgres image's `docker-entrypoint.sh` runs slightly
# after that and is non-atomic. The retry loop below bounded-retries the
# migration so a 1-3 second race doesn't require manual `docker compose
# restart api` (the previous failure mode).
set -eu

MAX_ATTEMPTS="${ALEMBIC_RETRY_ATTEMPTS:-15}"
SLEEP_SECONDS="${ALEMBIC_RETRY_SLEEP:-2}"

echo "[entrypoint] applying alembic migrations (up to ${MAX_ATTEMPTS} attempts)..."
attempt=1
while [ "${attempt}" -le "${MAX_ATTEMPTS}" ]; do
    if alembic upgrade head; then
        echo "[entrypoint] alembic upgrade succeeded on attempt ${attempt}."
        break
    fi
    if [ "${attempt}" -eq "${MAX_ATTEMPTS}" ]; then
        echo "[entrypoint] alembic upgrade failed after ${MAX_ATTEMPTS} attempts; exiting." >&2
        exit 1
    fi
    echo "[entrypoint] alembic upgrade attempt ${attempt}/${MAX_ATTEMPTS} failed; sleeping ${SLEEP_SECONDS}s..." >&2
    sleep "${SLEEP_SECONDS}"
    attempt=$((attempt + 1))
done

echo "[entrypoint] starting flask (env=${FLASK_ENV:-development})..."
exec flask --app kano run --host=0.0.0.0 --port=5000 --debug
