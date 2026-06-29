# 07 — Observability

You can't operate what you can't see. HAProxy exposes four observability
surfaces: the **stats page** (humans), the **Runtime API** (scripts), the **log
line** (the richest per-request record in the business), and **Prometheus
metrics** (dashboards/alerts). This lesson covers all four and how to read them.

## The stats page

A built-in HTML dashboard of every frontend/backend/server with live counters.

```haproxy
frontend stats
    bind :8404
    mode http
    stats enable
    stats uri /stats
    stats refresh 5s
    stats show-legends
    stats admin if LOCALHOST        # enable click-to-drain controls (guard it!)
    # auth — never expose the stats page unauthenticated
    stats auth admin:supersecret
```

Better: keep credentials in a `userlist` and restrict by source:

```haproxy
userlist stats_users
    user admin password $6$rounds=...   # mkpasswd -m sha-512
    # or: user admin insecure-password supersecret   (dev only)

frontend stats
    bind :8404
    mode http
    acl trusted src 10.0.0.0/8 127.0.0.1
    http-request deny unless trusted
    stats enable
    stats uri /stats
    stats refresh 5s
    stats http-request auth realm Stats unless { http_auth(stats_users) }
```

Browse `http://localhost:8404/stats`. What to read:

- **Sessions**: `cur` (current), `max`, `limit` (your `maxconn`), `total`.
- **Queue**: `cur`/`max` — non-zero means you're hitting per-server `maxconn`
  and requests are waiting. A persistent queue = under-capacity backend.
- **Errors**: `Req`/`Resp`/`cR` (client) / `cW` etc. — connection and request
  errors per object.
- **Server health**: state (UP/DOWN/DRAIN/MAINT), check status (`L7OK/200`,
  `L4CON`, `L7STS/503`), last change, downtime.
- **Bytes In/Out**, **rate** (sessions/s), **LastChk** (why a check failed).

The stats page is the fastest "what's broken right now" view. The `admin`
controls let you drain/disable a server by clicking — handy in an incident,
scriptable via the Runtime API for automation.

## The Runtime API

The control plane on the `stats socket` (lesson 02). It's how you operate
HAProxy live. Essential commands:

```bash
SOCK=/var/run/haproxy.sock
S() { docker compose exec -T haproxy sh -c "echo '$1' | socat - $SOCK"; }

S 'show info'                       # process: version, uptime, conns, mem, threads
S 'show stat'                       # CSV of ALL counters (the stats page, machine-readable)
S 'show servers state'             # per-server state (for warm reloads, lesson 08)
S 'show table be_app'              # stick-table contents (rate limiting, lesson 10)
S 'show sess'                       # live sessions (debugging a stuck connection)
S 'show errors'                     # captured malformed requests/responses

# operate:
S 'set server be_app/app1 state drain'
S 'set server be_app/app1 weight 50%'
S 'disable server be_app/app1'      # == maint
S 'enable server be_app/app1'
S 'set maxconn server be_app/app1 100'
S 'clear counters'                  # reset stats
```

`show stat` is the same data as the stats page in CSV — pipe it into anything.
`show errors` is gold: it captures the exact bytes of a request/response HAProxy
rejected, so you can see *why* a backend returned a malformed response.

There's also the **Data Plane API** — a REST/JSON service that wraps config +
runtime management (transactions, structured edits), used by control planes and
GitOps tooling. Overkill for a single node; worth knowing it exists.

## The log line — read it like a pro

With `option httplog`, each request logs a line packed with timers. Learn to
decode it; it answers "where did the latency go?" without a tracer.

Example line (trimmed):

```
fe_app be_app/app2 0/0/1/15/16 200 412 - - ---- 3/3/0/1/0 0/0 "GET /api/things HTTP/1.1"
```

Field by field:

| Token | Meaning |
|---|---|
| `fe_app` | frontend that accepted the request |
| `be_app/app2` | backend / server chosen |
| `0/0/1/15/16` | **timers** `Tq/Tw/Tc/Tr/Tt` (ms) — see below |
| `200` | HTTP status returned to client |
| `412` | bytes returned |
| `----` | **termination state** (4 chars) — *the most useful field* |
| `3/3/0/1/0` | conn counts: process / frontend / backend / server / retries |
| `0/0` | server queue / backend queue at dequeue time |
| `"GET ..."` | the request line |

**The timers `Tq/Tw/Tc/Tr/Tt`:**
- `Tq` — time to receive the full client request (high = slow client / slowloris).
- `Tw` — time **waiting in queue** (high = backend at `maxconn`, under-capacity).
- `Tc` — time to **connect** to the server (high = network/server saturation).
- `Tr` — time for the **server to respond** (high = slow application/DB). **This
  is your app latency.**
- `Tt` — total time the request was alive.

So a slow request with high `Tr` → blame the app/DB; high `Tw` → add capacity;
high `Tc` → network or server is refusing/slow to accept; high `Tq` → client/
network. One log line localizes the fault.

**The termination state** (e.g. `----`, `sH--`, `cD--`, `SC--`): two important
chars. First = *how the session ended*, second = *the session state when it
ended*. A few you'll see constantly:

- `----` — normal completion. 
- `sH` — **s**erver timeout while waiting for headers (`timeout server` fired →
  504). Backend too slow.
- `cD` — **c**lient aborted/closed during **D**ata transfer.
- `SC` — **S**erver refused the **C**onnection (down/maxed) → 503.
- `sQ` — request **Q**ueued too long then timed out (`timeout queue`).
- `PR`/`PH` — HAProxy itself denied/blocked at the **P**roxy (an ACL `deny`, or
  a malformed request).

Memorize `sH`, `SC`, `sQ`, `PR` — they instantly tell you whether the problem is
the backend, capacity, or your own rules. Full table is in the HAProxy docs
("Session state at disconnection").

### Customizing the log format

Add fields you care about (request ID, TLS version, captured headers):

```haproxy
    log-format "%ci:%cp [%tr] %ft %b/%s %TR/%Tw/%Tc/%Tr/%Ta %ST %B %tsc %{+Q}r id=%ID"
    http-request capture req.hdr(X-Request-ID) len 36
    capture request header Host len 64
    capture request header User-Agent len 128
```

For JSON logs (ingest into Loki/ELK):

```haproxy
    log-format "{\"client\":\"%ci\",\"backend\":\"%b\",\"server\":\"%s\",\"status\":%ST,\"Tr\":%Tr,\"Tt\":%Ta,\"tsc\":\"%tsc\",\"req\":\"%{+Q}r\"}"
```

## Prometheus metrics

HAProxy ships a native Prometheus exporter — no sidecar needed:

```haproxy
frontend metrics
    bind :8405
    mode http
    http-request use-service prometheus-exporter if { path /metrics }
    http-request deny unless { src 10.0.0.0/8 127.0.0.1 }
    no log
```

`curl localhost:8405/metrics` yields `haproxy_*` series. The ones to alert on:

- `haproxy_server_up` — per-server health (alert if a backend has 0 up).
- `haproxy_backend_current_queue` / `haproxy_server_current_queue` — queuing =
  under capacity.
- `haproxy_frontend_http_responses_total{code="5xx"}` — error rate.
- `haproxy_backend_response_time_average_seconds` / the response-time buckets —
  latency SLOs.
- `haproxy_frontend_current_sessions` vs `..._limit` — headroom to `maxconn`.
- `haproxy_server_check_failures_total` — flapping health checks.

Scrape it, build a dashboard (Grafana has community HAProxy dashboards), and
alert on `up`, `5xx` rate, and queue depth. These three catch the majority of
real incidents.

## Lab

```bash
# add to docker-compose.yml haproxy ports: "8404:8404" and "8405:8405"
# add the stats + metrics frontends to haproxy.cfg, then:
docker compose restart haproxy

# stats page (auth admin:supersecret)
open http://localhost:8404/stats     # or curl -su admin:supersecret localhost:8404/stats | head

# runtime API
docker compose exec -T haproxy sh -c "echo 'show info' | socat - /var/run/haproxy.sock" | head
docker compose exec -T haproxy sh -c "echo 'show stat' | socat - /var/run/haproxy.sock" | cut -d, -f1,2,18 | head

# read a real log line — generate traffic then look at the timers/termination state
curl -s localhost:8080/slow >/dev/null
docker compose logs --tail=3 haproxy

# metrics
curl -s localhost:8405/metrics | grep -E 'haproxy_server_up|current_queue' | head
```

Trigger a `504` to see `sH`: set `timeout server 1s`, hit `/slow` (sleeps 2s),
and watch the log line end in `sH--` with status `504`.

## Cheat sheet

- **Stats page** for humans (auth it, restrict source). **Runtime API** for
  scripts (`show stat/info/sess/errors`, `set server ...`).
- Read the **log line**: `Tq/Tw/Tc/Tr/Tt` localize latency; `Tr` = app latency;
  termination state (`sH`/`SC`/`sQ`/`PR`) names the culprit.
- Use `log-format` to add request IDs / JSON for log pipelines.
- Native **Prometheus** exporter via `use-service prometheus-exporter`; alert on
  `haproxy_server_up`, 5xx rate, queue depth, sessions-vs-limit.

Next: [08 — High availability & zero-downtime reloads](08-ha-reloads.md)
