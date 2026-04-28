# syntax=docker/dockerfile:1.7
#
# Placeholder image for the `backup` compose service. Story 1.9 reserves the
# service slot + named volume mount point so downstream stories can hang real
# `pg_dump` cron jobs off it (Story 6-1 — backups & restore tooling).
#
# In dev, the container idles on `sleep infinity` and consumes negligible
# resources; the `backup_data` named volume comes into existence purely so
# Story 6-1's first run does not need to bootstrap the volume itself.
#
# `pg_dump` / `psql` clients are intentionally NOT installed yet — picking a
# specific Postgres-client minor at a placeholder layer ties this story to
# a moving Alpine-package target. Story 6-1 will pick the matching client
# version when it wires real backup logic.

FROM alpine:3.20

RUN apk add --no-cache tini

ENTRYPOINT ["tini", "--"]
CMD ["sleep", "infinity"]
