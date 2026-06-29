# 00 — Lab setup

Every lesson runs against one small Docker Compose sandbox. Build it once; each
lesson swaps in a different `haproxy.cfg` and (occasionally) adds a backend.

## What's in the lab

- **HAProxy** — the thing we're learning. Bind-mounts a config you edit live.
- **Two app backends** (`app1`, `app2`) — tiny HTTP servers that echo which
  instance answered, so you can *see* load balancing happen.
- **A Postgres primary + replica** — used from lesson 09 onward for the
  database-exposition lessons.
- **A load generator** (`vegeta`/`hey` via a throwaway container) — for the
  traffic-shaping and observability labs.

## Directory layout

```
docs/haproxy/lab/
├── docker-compose.yml
├── haproxy/
│   └── haproxy.cfg        # the file you edit each lesson
├── app/
│   └── server.py          # 30-line echo server, run twice
└── certs/                 # generated in lesson 05
```

## The echo backend

A deliberately dumb HTTP server. It returns its hostname and the request path,
plus a configurable startup delay and a `/health` endpoint we'll abuse in the
health-check lesson.

```python
# app/server.py
import http.server, os, socket, time, json

NAME = os.environ.get("APP_NAME", socket.gethostname())
HEALTHY = True  # toggled via /toggle to simulate a sick backend

class H(http.server.BaseHTTPRequestHandler):
    def _send(self, code, body):
        payload = body.encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        global HEALTHY
        if self.path == "/health":
            return self._send(200 if HEALTHY else 503,
                              json.dumps({"status": "ok" if HEALTHY else "sick",
                                          "app": NAME}))
        if self.path == "/toggle":
            HEALTHY = not HEALTHY
            return self._send(200, json.dumps({"healthy": HEALTHY}))
        if self.path == "/slow":
            time.sleep(2)
        return self._send(200, json.dumps({"app": NAME, "path": self.path,
                                           "client": self.client_address[0]}))

    def log_message(self, *a):  # quieter logs
        pass

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    http.server.ThreadingHTTPServer(("0.0.0.0", port), H).serve_forever()
```

## Compose file

```yaml
# docker-compose.yml
name: haproxy-lab

services:
  haproxy:
    image: haproxytech/haproxy-alpine:3.0
    ports:
      - "8080:8080"     # the proxied frontend
      - "8404:8404"     # stats / metrics (lesson 07)
      - "5432:5432"     # db frontend (lesson 09)
    volumes:
      - ./haproxy:/usr/local/etc/haproxy:ro
      - ./certs:/etc/haproxy/certs:ro
    # validate config on boot; fail fast on typos
    command: ["haproxy", "-f", "/usr/local/etc/haproxy/haproxy.cfg", "-db"]
    depends_on: [app1, app2]

  app1:
    build: ./app
    environment: { APP_NAME: app1 }
  app2:
    build: ./app
    environment: { APP_NAME: app2 }

  # --- database tier, used from lesson 09 ---
  pg-primary:
    image: postgres:17
    environment:
      POSTGRES_USER: kano
      POSTGRES_PASSWORD: change-me
      POSTGRES_DB: kano
    command: >
      postgres -c wal_level=replica -c max_wal_senders=10
               -c hot_standby=on
    profiles: ["db"]    # only starts with `--profile db`

  pg-replica:
    image: postgres:17
    environment:
      POSTGRES_USER: kano
      POSTGRES_PASSWORD: change-me
    profiles: ["db"]
```

```dockerfile
# app/Dockerfile
FROM python:3.12-slim
COPY server.py /server.py
ENV PORT=8080
CMD ["python", "/server.py"]
```

> The replica wiring (base-backup + `standby.signal`) is fully fleshed out in
> [lesson 09](09-databases.md); for lessons 01–08 you only need `app1`/`app2`,
> so the DB tier is behind a Compose **profile** and stays stopped.

## Daily driver commands

```bash
cd docs/haproxy/lab

# bring up just the app tier (lessons 01–08)
docker compose up -d --build haproxy app1 app2

# validate a config WITHOUT restarting (do this after every edit)
docker compose exec haproxy haproxy -c -f /usr/local/etc/haproxy/haproxy.cfg

# apply a config change with a zero-downtime reload (see lesson 08)
docker compose kill -s HUP haproxy        # signal-based reload
# ...or just:
docker compose restart haproxy            # blunt, fine for the lab

# watch it work
for i in $(seq 1 6); do curl -s localhost:8080/ | jq -c .; done

# tail logs
docker compose logs -f haproxy
```

The single most useful habit in this whole course:

```bash
haproxy -c -f haproxy.cfg     # "check" mode — parse & validate, run nothing
```

Run it after **every** edit. HAProxy refuses to start on an invalid config, and
a typo in a bind line shouldn't be how you discover that in production.

## Verify the sandbox

```bash
docker compose up -d --build haproxy app1 app2
# (config from lesson 02 needed before :8080 answers — for now just check boot)
docker compose ps          # all three Up
docker compose logs haproxy | tail -n 5
```

You won't get a `200` on `:8080` until you drop in the lesson 02 config — that's
the next step.

Next: [01 — Architecture & mental model](01-architecture.md)
