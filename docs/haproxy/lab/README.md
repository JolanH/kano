# HAProxy lab sandbox

The runnable sandbox for the [HAProxy course](../README.md). Built once,
reused by every lesson — you edit `haproxy/haproxy.cfg` and reload.

## Layout

```
lab/
├── docker-compose.yml      # haproxy + 2 echo apps + (profiled) postgres tier
├── haproxy/haproxy.cfg     # THE file you edit each lesson (starts == lesson 02)
├── app/                    # 30-line echo backend, run as app1 + app2
│   ├── server.py
│   └── Dockerfile
└── certs/                  # generated in lesson 05 (git-ignored)
```

## Quickstart

```bash
cd docs/haproxy/lab

# app tier (lessons 01–08)
docker compose up -d --build haproxy app1 app2

# it works:
for i in $(seq 1 6); do curl -s localhost:8080/ | jq -c .; done   # alternates app1/app2
```

## The loop you'll repeat every lesson

```bash
# 1. edit haproxy/haproxy.cfg per the lesson
# 2. validate (do this EVERY time)
docker compose exec haproxy haproxy -c -f /usr/local/etc/haproxy/haproxy.cfg
# 3. apply with a seamless reload (lesson 08)
docker compose kill -s HUP haproxy
#    ...or a blunt restart if you prefer:
docker compose restart haproxy
# 4. observe
docker compose logs -f haproxy
```

## Runtime API helper

Many lessons drive HAProxy live over its unix socket:

```bash
docker compose exec -T haproxy sh -c "echo 'show info'  | socat - /var/run/haproxy.sock"
docker compose exec -T haproxy sh -c "echo 'show stat'  | socat - /var/run/haproxy.sock"
docker compose exec -T haproxy sh -c "echo 'set server be_app/app1 state drain' | socat - /var/run/haproxy.sock"
```

## Database tier (lesson 09)

Behind a Compose profile so it stays stopped for lessons 01–08:

```bash
docker compose --profile db up -d pg-primary pg-replica
```

Replica wiring (base-backup + `standby.signal`) is described in
[lesson 09](../09-databases.md).

## Published ports

| Host port | Purpose | Lesson |
|---|---|---|
| 8080 | proxied HTTP frontend | 02+ |
| 8081 / 8443 | http / https (TLS) | 05 |
| 8404 | stats page | 07 |
| 8405 | prometheus exporter | 07 |
| 5432 / 5433 | db write / read endpoints | 09 |

## Reset

```bash
docker compose down -v        # stop everything + drop volumes
```
