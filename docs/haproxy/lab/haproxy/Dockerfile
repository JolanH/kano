# Lab HAProxy image: the official alpine build + socat, so the runtime-API
# snippets used throughout the course work out of the box:
#   docker compose exec haproxy sh -c "echo 'show info' | socat - /var/run/haproxy.sock"
# (the stock haproxy-alpine image ships neither socat nor a unix-socket nc.)
FROM haproxytech/haproxy-alpine:3.0
USER root
RUN apk add --no-cache socat
