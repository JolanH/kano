# 03 — Load balancing applications

Now that traffic flows, let's control *how* it's distributed. This lesson covers
the balancing algorithms, server tuning (weights, slow-start, connection
limits), stickiness, and connection reuse — everything about spreading HTTP load
well.

## Balancing algorithms

Set with `balance <algo>` in a backend. The ones that matter:

| Algorithm | Picks the server by | Use when |
|---|---|---|
| `roundrobin` | next in rotation (weighted) | stateless, uniform requests (the default sane choice) |
| `static-rr` | same as RR but weights can't change at runtime | micro-optimization; rarely needed |
| `leastconn` | fewest active connections | requests vary a lot in duration (DB-ish, long polls, uploads) |
| `first` | first available server up to its `maxconn` | you want to pack onto few servers (autoscale-friendly) |
| `source` | hash of client IP | crude stickiness without cookies |
| `uri` | hash of the request URI | cache backends (same URL → same cache node) |
| `hdr(<name>)` | hash of a header value | shard by tenant/user header |
| `random` | random (optionally `random(2)` = power-of-two-choices) | huge server pools; avoids RR herd effects |

### `roundrobin` vs `leastconn` — the one that matters most

`roundrobin` assumes requests cost roughly the same. If one request takes 2s and
the next takes 2ms, RR can pile slow requests onto one server while others idle.
`leastconn` sends each new request to whoever has the fewest in flight, which
self-corrects for uneven request cost. **Rule of thumb:** uniform fast requests
→ `roundrobin`; mixed/long-lived requests → `leastconn`.

```haproxy
backend be_app
    balance leastconn
    server app1 app1:8080 check
    server app2 app2:8080 check
```

### Hash-based algorithms and `hash-type`

`source`, `uri`, and `hdr` compute a hash and map it to a server. By default the
mapping is a plain modulo of the server count — which means **adding or removing
one server reshuffles almost everything** (terrible for caches). Fix it with
consistent hashing:

```haproxy
backend be_cache
    balance uri
    hash-type consistent          # ring hash: minimal disruption on changes
    server c1 c1:8080 check
    server c2 c2:8080 check
```

`hash-type consistent` keeps ~1/N of keys remapped when N changes, instead of
nearly all of them. Always pair consistent hashing with cache/shard backends.

## Tuning `server` lines

```haproxy
server app1 app1:8080 check weight 100 maxconn 200 slowstart 30s
server app2 app2:8080 check weight 50
server app3 app3:8080 check backup
```

- **`weight 0–256`** — relative share of traffic. `app1` at 100 vs `app2` at 50
  → app1 gets 2× the requests. Default 1... actually 1? No — default is `1`
  internally but commonly expressed; set it explicitly when mixing capacities.
  Use weights to bleed traffic onto a bigger box, or to do a manual canary
  (set a new server to `weight 1` and watch).
- **`maxconn 200`** — per-server concurrent connection cap. Excess requests
  **queue** (see `timeout queue`) rather than overwhelming a fragile backend.
  This is one of HAProxy's best features: it protects backends from thundering
  herds. Size it to what the app can actually handle.
- **`slowstart 30s`** — when a server comes UP (after a restart/health
  recovery), ramp its weight from 0 to full over 30s instead of slamming it
  with full load while caches/JITs are cold.
- **`backup`** — only receives traffic when **all** non-backup servers are down.
  Classic "sorry, maintenance" page or a DR site. Combine with
  `option allbackups` to use *all* backups at once rather than one at a time.

### Queuing: the backpressure knob

When every server is at its `maxconn`, new requests wait in a per-server (and
per-backend) **queue** instead of being dropped:

```haproxy
defaults
    timeout queue 5s        # how long a request waits for a free server slot
```

If a request waits longer than `timeout queue`, the client gets `503`. This
turns "backend overloaded → cascading failure" into "backend overloaded →
bounded latency, then clean 503". Tune `maxconn` + `timeout queue` together as
your overload policy.

## Stickiness (session persistence)

Sometimes a request *must* return to the same server (in-memory session, sticky
upload, websocket). Three approaches, best to worst:

### 1. Cookie-based (best for HTTP apps)

HAProxy injects/reads a cookie naming the chosen server:

```haproxy
backend be_app
    balance roundrobin
    cookie SRV insert indirect nocache
    server app1 app1:8080 check cookie a1
    server app2 app2:8080 check cookie a2
```

- `insert` — HAProxy adds a `Set-Cookie: SRV=a1` to the response.
- `indirect` — strip the cookie before passing the request to the server (the
  app never sees HAProxy's bookkeeping cookie).
- `nocache` — add `Cache-control` so a shared cache won't store the
  per-user cookie. Important.

On the next request the client sends `Cookie: SRV=a1` and HAProxy routes
straight to `app1`. If `app1` is down, it falls back to load balancing. This is
**application-layer stickiness done right**: explicit, debuggable, survives IP
changes.

### 2. Stick tables (sticky on arbitrary keys)

Track a key (source IP, a header, a URL param) → server in an in-memory table.
More flexible, also used for rate limiting (lesson 10):

```haproxy
backend be_app
    stick-table type ip size 100k expire 30m
    stick on src
    server app1 app1:8080 check
    server app2 app2:8080 check
```

`stick on src` pins each client IP to a server for 30 minutes. Stick tables are
shared across threads and can be **replicated across HAProxy nodes** via
`peers` (lesson 08), so stickiness survives a failover.

### 3. `balance source` (crude)

Hashes the client IP to a server. No state, but breaks when clients sit behind a
shared NAT/CGNAT (everyone hashes the same) or change IPs (mobile). Use cookies
or stick tables instead for real apps.

> **Prefer stateless backends.** Stickiness is a workaround for server-local
> state. If you can push sessions to Redis/Postgres, you can `leastconn` freely
> and lose a server with zero user impact. Reach for stickiness only when you
> can't fix the statefulness.

## Connection reuse & performance

For throughput, reusing **server-side** connections avoids a TCP+TLS handshake
per request. Modern HAProxy pools idle server connections:

```haproxy
defaults
    # default modern behavior keeps server connections alive and pooled
    http-reuse safe          # safe | aggressive | always | never
```

- `safe` (default) — reuse a pooled connection only when it's certain to be
  safe (idempotent, no early data risk). Good default.
- `aggressive` / `always` — reuse more eagerly for higher throughput; needs
  backends that handle keep-alive impeccably.
- `never` — fresh connection every time (debugging, or broken backends).

Combine with `option http-keep-alive` (the efficient default) rather than
`http-server-close` when your backends are healthy keep-alive citizens. For a
JSON API like Kano's Flask service behind Gunicorn, `http-reuse safe` +
keep-alive meaningfully cuts p99.

## Preserving the client IP

Once HAProxy is in the path, your app sees **HAProxy's** IP as the source. Two
fixes depending on the layer:

- **L7 (HTTP):** add `X-Forwarded-For`:
  ```haproxy
  backend be_app
      option forwardfor       # adds/append X-Forwarded-For: <client ip>
  ```
  Your app reads `X-Forwarded-For` (Flask: configure `ProxyFix`). Also set
  `X-Forwarded-Proto` so the app knows the original scheme:
  ```haproxy
  http-request set-header X-Forwarded-Proto https if { ssl_fc }
  ```
- **L4 (TCP) or when you want the *real* IP transparently:** the **PROXY
  protocol** prepends a small header carrying the original src/dst. Enable
  `send-proxy`/`send-proxy-v2` on the server line and have the backend speak it.
  Essential for databases and TCP services (lesson 09).

## Lab

Demonstrate `leastconn` beating `roundrobin` on uneven load using the `/slow`
endpoint (sleeps 2s).

```haproxy
backend be_app
    balance roundrobin              # try this, then switch to leastconn
    server app1 app1:8080 check
    server app2 app2:8080 check
```

```bash
# fire a slow request, then immediately race 4 fast ones
curl -s localhost:8080/slow >/dev/null &      # parks on whichever server RR picked
sleep 0.2
time (for i in 1 2 3 4; do curl -s localhost:8080/ >/dev/null; done)
```

With `roundrobin`, RR will eventually hand a fast request to the server stuck on
`/slow`. Switch to `balance leastconn`, reload, and repeat — new requests avoid
the busy server. Then prove stickiness:

```haproxy
backend be_app
    balance roundrobin
    cookie SRV insert indirect nocache
    server app1 app1:8080 check cookie a1
    server app2 app2:8080 check cookie a2
```

```bash
# first request gets a Set-Cookie; reuse it and you're pinned
curl -s -c jar.txt localhost:8080/ | jq -c .app
for i in 1 2 3; do curl -s -b jar.txt localhost:8080/ | jq -c .app; done  # same app every time
```

## Cheat sheet

- `roundrobin` for uniform, `leastconn` for uneven/long requests.
- Hash algos (`uri`/`source`/`hdr`) → add `hash-type consistent` for caches.
- `weight` for capacity/canary, `maxconn`+`timeout queue` for backpressure,
  `slowstart` for warm-up, `backup` for failover pools.
- Stickiness: **cookies > stick tables > `balance source`**. Stateless beats all.
- `option forwardfor` (L7) or PROXY protocol (L4) to preserve client IP.
- `http-reuse safe` + keep-alive for throughput.

Next: [04 — Health checks](04-health-checks.md)
