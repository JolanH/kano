#!/usr/bin/env bash
# Alembic forward+rollback+forward smoke. Used by CI (Story 1.10) and run
# locally before any migration PR lands. Failure of any step exits non-zero.
#
# Requires: $DATABASE_URL points at a writable Postgres 17 instance, and
# `poetry install` has already been done in the working tree.

set -euo pipefail

cd "$(dirname "$0")/.."

echo "[roundtrip] upgrade to head..."
poetry run alembic upgrade head

echo "[roundtrip] downgrade by one revision..."
poetry run alembic downgrade -1

echo "[roundtrip] upgrade back to head..."
poetry run alembic upgrade head

echo "[roundtrip] success"
