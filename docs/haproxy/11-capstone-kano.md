# 11 — Capstone: the Kano stack behind HAProxy

Time to assemble everything into one realistic edge for a stack that looks like
Kano's: a **Vue SPA**, a **Flask/Gunicorn API** (`/api/v1/*`), and **Postgres**
(primary + replica). One HAProxy fronts the HTTP tier (L7) and another listener
fronts the database tier (L4) — combining lessons 02–10.

> This is a teaching reference, not a drop-in for the existing Compose stack in
> [`docs/ops/runbook.md`](../ops/runbook.md). The runbook notes that the
> production overlay (Caddy + TLS) is owned by Story 7.1; this capstone shows
> what the equivalent **HAProxy** edge would look like if you chose HAProxy over
> Caddy. Adapt service names/ports to your actual Compose project.

## Target architecture

```
                         ┌───────────────────────── HAProxy ─────────────────────────┐
  browser ──TLS:443──────▶ fe_https (L7)                                              │
                         │   ├─ /api/v1/*  ─▶ be_api   (Flask/Gunicorn, leastconn)    │
                         │   ├─ /metrics    ─▶ denied (internal only)                  │
                         │   └─ everything  ─▶ be_web  (Vue SPA static / dev server)  │
                         │                                                            │
  app pods ──TCP:5432────▶ pg_write (L4) ─▶ current primary (httpchk GET /primary)   │
  app pods ──TCP:5433────▶ pg_read  (L4) ─▶ replicas (leastconn, GET /replica)       │
                         │                                                            │
  ops ──────TCP:8404─────▶ stats (auth + source ACL)                                 │
  prom ─────TCP:8405─────▶ /metrics (prometheus-exporter, internal only)             │
                         └────────────────────────────────────────────────────────────┘
```

## The full `haproxy.cfg`

```haproxy
#====================================================================
# GLOBAL
#====================================================================
global
    log stdout format raw local0 info
    maxconn 50000
    user haproxy
    group haproxy
    stats socket /var/run/haproxy.sock mode 660 level admin expose-fd listeners
    hard-stop-after 5m

    # strong TLS defaults for every ssl bind
    ssl-default-bind-ciphersuites TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256
    ssl-default-bind-ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384
    ssl-default-bind-options ssl-min-ver TLSv1.2 no-tls-tickets

# stick-table replication across HAProxy nodes (rate limits + stickiness)
peers kano_peers
    peer haproxy-a 10.0.0.10:10000
    peer haproxy-b 10.0.0.11:10000

#====================================================================
# DEFAULTS (HTTP) — applies to the proxies BELOW until overridden
#====================================================================
defaults
    mode http
    log global
    option httplog
    option dontlognull
    option forwardfor                 # X-Forwarded-For: real client IP
    option http-keep-alive
    http-reuse safe
    retries 3
    option redispatch
    timeout connect 5s
    timeout client  30s
    timeout server  30s
    timeout http-request 5s           # slowloris guard
    timeout http-keep-alive 2s
    timeout queue 5s

#====================================================================
# HTTP EDGE (L7)
#====================================================================
frontend fe_https
    bind :80
    bind :443 ssl crt /etc/haproxy/certs/ alpn h2,http/1.1

    # --- force HTTPS + HSTS ---
    http-request redirect scheme https code 308 unless { ssl_fc }
    http-response set-header Strict-Transport-Security "max-age=63072000; includeSubDomains" if { ssl_fc }

    # --- trust hygiene: strip spoofable inbound headers (forwardfor re-adds real XFF) ---
    http-request del-header X-Forwarded-Proto
    http-request set-header X-Forwarded-Proto https if { ssl_fc }
    http-request del-header X-Real-IP
    http-request set-header X-Request-ID %[uuid()] unless { req.hdr(X-Request-ID) -m found }

    # --- security headers applied to every backend ---
    http-response set-header X-Content-Type-Options nosniff
    http-response set-header X-Frame-Options DENY
    http-response set-header Referrer-Policy strict-origin-when-cross-origin
    http-response del-header Server

    # --- per-IP rate limiting (global via peers) ---
    stick-table type ip size 1m expire 10m store http_req_rate(10s),http_err_rate(10s) peers kano_peers
    http-request track-sc0 src
    acl too_fast  sc_http_req_rate(0) gt 200
    acl scanning  sc_http_err_rate(0) gt 30
    http-request deny deny_status 429 if too_fast
    http-request deny deny_status 403 if scanning

    # --- never expose internal endpoints publicly ---
    http-request deny if { path_beg /metrics }

    # --- routing ---
    acl is_api path_beg /api/
    use_backend be_api if is_api
    default_backend be_web

#--------------------------------------------------------------------
# API backend — Flask/Gunicorn
#--------------------------------------------------------------------
backend be_api
    balance leastconn                 # API requests vary in cost
    option httpchk
    http-check send meth GET uri /api/v1/health
    http-check expect status 200
    default-server inter 2s fall 3 rise 2 maxconn 100 slowstart 20s
    # observe live traffic too: pull a server that starts 5xx-ing
    server api1 api1:5000 check observe layer7 error-limit 10 on-error mark-down
    server api2 api2:5000 check observe layer7 error-limit 10 on-error mark-down

#--------------------------------------------------------------------
# Web backend — Vue SPA
#  (static files served by a tiny web server, or the Vite dev server in dev)
#--------------------------------------------------------------------
backend be_web
    balance roundrobin
    option httpchk GET /
    http-check expect status 200
    server web1 web1:5173 check
    # SPA fallback (serve index for client-side routes) is typically handled by
    # the web server; if serving static via HAProxy you'd use errorfiles/return.

#====================================================================
# DATABASE EDGE (L4) — Patroni-managed Postgres
#====================================================================
defaults db
    mode tcp
    log global
    option tcplog
    timeout connect 5s
    timeout client  1h                # long-lived pooled DB connections
    timeout server  1h
    option clitcpka
    option srvtcpka
    retries 3

# WRITE endpoint: always the current leader (only it passes GET /primary)
listen pg_write
    bind :5432
    mode tcp
    option httpchk GET /primary
    http-check expect status 200
    default-server inter 3s fall 3 rise 2 on-marked-down shutdown-sessions
    server pg1 10.0.0.1:5432 check port 8008
    server pg2 10.0.0.2:5432 check port 8008
    server pg3 10.0.0.3:5432 check port 8008

# READ endpoint: all current replicas, least-loaded first
listen pg_read
    bind :5433
    mode tcp
    balance leastconn
    option httpchk GET /replica
    http-check expect status 200
    default-server inter 3s fall 3 rise 2
    server pg1 10.0.0.1:5432 check port 8008
    server pg2 10.0.0.2:5432 check port 8008
    server pg3 10.0.0.3:5432 check port 8008

#====================================================================
# OBSERVABILITY / CONTROL PLANE
#====================================================================
userlist ops
    user admin password $6$rounds=100000$replace$withaRealHash

frontend stats
    bind :8404
    mode http
    acl trusted src 10.0.0.0/8 127.0.0.1
    http-request deny unless trusted
    stats enable
    stats uri /stats
    stats refresh 5s
    stats show-legends
    stats http-request auth realm KanoOps unless { http_auth(ops) }

frontend metrics
    bind :8405
    mode http
    acl trusted src 10.0.0.0/8 127.0.0.1
    http-request deny unless trusted
    http-request use-service prometheus-exporter if { path /metrics }
    no log
```

## How each lesson shows up here

| Lesson | Where it lands in this config |
|---|---|
| 01–02 | section structure, `defaults`, timeouts, `frontend`/`backend`/`listen` |
| 03 | `balance leastconn` (API), `roundrobin` (web), `maxconn`, `slowstart`, `http-reuse`, `forwardfor` |
| 04 | `httpchk` + `http-check expect`, `inter/fall/rise`, `observe ... on-error mark-down` |
| 05 | `bind :443 ssl crt`, `alpn h2`, 308 redirect, HSTS, strong `ssl-default-bind-*` |
| 06 | `path_beg /api/` content switching, header set/del, `X-Request-ID`, deny `/metrics` |
| 07 | stats frontend (authed + source-gated), Prometheus exporter, `option httplog` |
| 08 | master-worker reload, `hard-stop-after`, `expose-fd listeners`, `peers`, `redispatch` |
| 09 | `pg_write`/`pg_read` L4 listeners, Patroni `GET /primary|/replica`, `on-marked-down shutdown-sessions`, DB timeouts + keepalives |
| 10 | per-IP `stick-table` rate + error limiting over `peers`, header hygiene, security headers, non-root user |

## Wiring it into a Compose/dev stack

Adapting to a local Compose stack like the one in the runbook:

```yaml
# docker-compose.haproxy.yml  (overlay)
services:
  edge:
    image: haproxytech/haproxy-alpine:3.0
    ports:
      - "443:443"
      - "80:80"
      - "5432:5432"      # DB write endpoint
      - "5433:5433"      # DB read endpoint
      - "8404:8404"      # stats (bind to 127.0.0.1 in real deploys)
      - "8405:8405"      # metrics
    volumes:
      - ./haproxy:/usr/local/etc/haproxy:ro
      - ./certs:/etc/haproxy/certs:ro
    command: ["haproxy", "-W", "-db", "-f", "/usr/local/etc/haproxy/haproxy.cfg"]
    depends_on: [api, web]
```

Point the Flask app at the DB through HAProxy with **two** SQLAlchemy binds:

```python
# writes / read-your-writes
SQLALCHEMY_DATABASE_URI = "postgresql://kano:***@edge:5432/kano"
# lag-tolerant reporting reads
SQLALCHEMY_BINDS = {"replica": "postgresql://kano:***@edge:5433/kano"}
```

And make Flask trust the proxy headers (so `request.remote_addr` is the real
client and `url_for(_scheme=...)` is https):

```python
from werkzeug.middleware.proxy_fix import ProxyFix
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)
```

> Recall from memory that the Kano API maps host `5001→5000` in the existing
> dev compose. In a real edge you'd put HAProxy in front and stop publishing the
> API port directly — the API is reachable only via the `edge` service on the
> Docker network (`api:5000`), exactly as the `be_api` servers reference it.

## Pre-flight checklist before this goes live

1. `haproxy -c -f haproxy.cfg` passes (wire into CI alongside the existing
   `docker compose up --wait` smoke from Story 1.10).
2. Real certs in `/etc/haproxy/certs/` (Let's Encrypt fullchain+privkey
   concatenated), auto-renew via Runtime API/ACME.
3. `/api/v1/health` returns 200 only when the API + its DB dependency are
   actually serviceable — but is *cheap* (lesson 04 anti-patterns).
4. Patroni (or your HA controller) running and its REST API reachable on `:8008`
   from HAProxy; verify `GET /primary` flips correctly on a manual failover.
5. Stats `:8404`, metrics `:8405`, and the runtime socket are **not**
   internet-reachable (source ACLs + auth; bind to internal interfaces).
6. Two HAProxy nodes with a floating VIP (keepalived) or a cloud L4 LB in front,
   `peers` replicating stick tables (lesson 08).
7. Prometheus scraping `:8405`; alerts on `haproxy_server_up`, 5xx rate, queue
   depth (lesson 07).
8. Load test: confirm rate limits trip at the intended threshold and a backend
   drain causes zero client errors.

## Where to go next

- **SQL-aware routing** (true read/write split by query): evaluate PgCat,
  pgpool-II, or ProxySQL *behind* HAProxy — HAProxy for HA/TLS/edge, the SQL
  proxy for query routing.
- **Data Plane API / GitOps**: manage this config declaratively at scale.
- **Lua**: custom auth, request signing, or exotic routing when ACLs aren't
  enough (sandboxed, opt-in).
- **HAProxy as Kubernetes Ingress**: the same concepts, config generated from
  Ingress/Gateway resources.

You now have the full arc: architecture → first proxy → balancing → health →
TLS → routing → observability → HA → databases → security → a production-shaped
edge. Re-read the cheat sheets when you're configuring for real, and always
`haproxy -c` before you reload.

— End of the core course. Back to the [index](README.md).

For an advanced add-on on running **more than one** HAProxy with synchronized
state, see [12 — Distribution & synchronization](12-peers-sync.md).
