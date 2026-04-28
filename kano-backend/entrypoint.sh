#!/bin/sh
# Kano API container entrypoint.
#
# Applies pending Alembic migrations against the database, then launches
# Flask. Failure of either step exits non-zero so the orchestrator can
# decide whether to restart or surface the failure (compose: depends_on +
# healthcheck; CI: `--wait` flips red on a non-200 /health).
set -eu

echo "[entrypoint] applying alembic migrations..."
alembic upgrade head

echo "[entrypoint] starting flask (env=${FLASK_ENV:-development})..."
exec flask --app kano run --host=0.0.0.0 --port=5000 --debug
