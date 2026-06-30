# 04 — Health checks

A load balancer is only as good as its ability to *stop* sending traffic to a
broken server. This lesson covers active checks, passive checks, HTTP-aware
checks, agent checks, and how to drain a server gracefully for deploys.

## Active vs passive checks

- **Active checks** — HAProxy proactively probes each server on an interval
  (`GET /health` every 2s, a TCP connect, etc.). Enabled by `check` on the
  `server` line. This is the workhorse.
- **Passive checks** (`observe`) — HAProxy watches *real traffic* and marks a
  server down after N consecutive errors, without waiting for the next probe.
  Catches "passes /health but 500s on real requests".

You typically run **both**.

## Active HTTP checks

```haproxy
backend be_app
    option httpchk
    http-check send meth GET uri /health ver HTTP/1.1 hdr Host kano.internal
    http-check expect status 200
    default-server inter 2s fall 3 rise 2
    server app1 app1:8080 check
    server app2 app2:8080 check
```

The check tuning (on `default-server`, applied to all, or per `server`):

- **`inter 2s`** — interval between checks (when the server is UP).
- **`fall 3`** — number of *consecutive* failed checks before marking DOWN.
- **`rise 2`** — consecutive *successes* before marking a DOWN server UP again.
- **`fastinter` / `downinter`** — use a tighter interval while in a transitional
  or DOWN state to detect recovery faster:
  ```haproxy
  default-server inter 5s fastinter 1s downinter 5s fall 3 rise 2
  ```
  `fastinter` applies when a server is flapping (between up and down);
  `downinter` when it's confirmed down.

### Validating the response, not just the status

`http-check expect` can assert on status, headers, or body — chain multiple:

```haproxy
    option httpchk
    http-check send meth GET uri /health
    http-check expect status 200
    http-check expect header name Content-Type value -m sub application/json
    http-check expect string "\"status\":\"ok\""     # body must contain this
```

`-m sub` = substring match; `-m str`, `-m beg`, `-m reg` also exist. A good
`/health` endpoint returns 200 **only when the server can actually serve** (DB
reachable, migrations applied) — push that logic into the app, and the LB does
the right thing for free.

### Checking a different port/path than the traffic port

Apps often expose health on a separate admin port:

```haproxy
    server app1 app1:8080 check port 9000 addr 10.0.0.5
```

`port`/`addr` override where the *check* goes vs where *traffic* goes.

## TCP and protocol-aware checks

In `mode tcp` (databases, etc.) you can't do HTTP checks. Options:

```haproxy
# plain TCP connect — "can I open a socket?"
server db db:5432 check

# protocol-aware checks (validate a real handshake):
option pgsql-check user kano        # Postgres: sends a startup packet
option mysql-check user haproxy     # MySQL
option redis-check                  # Redis: PING/PONG
option smtpchk
option ssl-hello-chk                # TLS handshake reachability
```

A plain TCP connect only proves the port is open — Postgres can accept a socket
while refusing logins or while in recovery. `option pgsql-check` actually starts
the protocol handshake, catching more failure modes. We use it in lesson 09.

You can also script arbitrary checks with `tcp-check`:

```haproxy
backend be_redis
    option tcp-check
    tcp-check send PING\r\n
    tcp-check expect string +PONG
    server r1 r1:6379 check
```

## Passive checks (`observe`) and `on-error`

Mark a server down based on **live traffic** failures, not just probes:

```haproxy
backend be_app
    option httpchk
    http-check expect status 200
    default-server inter 2s fall 3 rise 2
    server app1 app1:8080 check observe layer7 error-limit 10 on-error mark-down
    server app2 app2:8080 check observe layer7 error-limit 10 on-error mark-down
```

- `observe layer7` — watch HTTP responses (use `layer4` in TCP mode).
- `error-limit 10` — after 10 errors...
- `on-error mark-down` — ...mark the server DOWN immediately (other actions:
  `fastinter`, `fail-check`, `shutdown-sessions`).

Now a server that suddenly 500s on real requests is pulled fast, then re-probed
via active checks before coming back.

## Agent checks (let the server vote)

An **agent check** is a side-channel where the server itself reports its
health/weight to HAProxy over a tiny TCP port. The server can say "I'm at 50%
capacity, halve my weight" or "drain me" — pull-based load feedback.

```haproxy
    server app1 app1:8080 check agent-check agent-addr app1 agent-port 9999 agent-inter 2s
```

The agent replies with a line like `75%`, `drain`, `down`, `maxconn:50`, or
`up`. Great when the app knows its own load (queue depth, GC pressure) better
than an external probe can infer. Independent of the regular `check` — both run.

## Graceful drain for deploys (the Runtime API)

The killer feature for zero-downtime deploys: take a server **out of rotation
for new sessions** while letting in-flight requests finish, *without a reload*.

Server states:
- **READY** — normal, takes traffic.
- **DRAIN** — refuses new connections, keeps serving existing ones. Perfect
  pre-deploy.
- **MAINT** — fully out; no traffic, no health checks.

Drive it over the Runtime API socket (opened in lesson 02):

```bash
SOCK=/var/run/haproxy.sock

# put app1 into drain before deploying it
docker compose exec haproxy sh -c "echo 'set server be_app/app1 state drain' | socat - $SOCK"

# watch connections bleed to zero
docker compose exec haproxy sh -c "echo 'show servers state be_app' | socat - $SOCK"

# deploy app1, then bring it back
docker compose exec haproxy sh -c "echo 'set server be_app/app1 state ready' | socat - $SOCK"
```

(`socat` or `echo ... | nc -U` both work; the alpine image bundles socat.)

A typical rolling deploy loop: `drain → wait for 0 current sessions → deploy →
health check passes → ready → next server`. This is what your CD pipeline
should orchestrate. Combine with `slowstart` (lesson 03) so the freshly-deployed
server warms up.

> You can also flip state with the stats page (lesson 07) by clicking, but
> scripts > clicking for deploys.

## Health-check anti-patterns

- **`/health` that only checks the web framework is alive.** It returns 200 even
  when the DB is unreachable, so HAProxy keeps routing to a server that 500s
  every real request. Make `/health` exercise the critical dependency — but
  beware the opposite failure (see next point).
- **A `/health` that's *too* deep.** If `/health` does a heavy DB query, a brief
  DB hiccup marks *every* server down simultaneously → total outage from a
  blip. Use a *cheap* liveness check for the LB and a separate deep readiness
  check for humans/orchestrators. Consider `SELECT 1` at most, with a short
  check `timeout`.
- **No `rise`/`fall` tuning** → flapping servers thrash in and out. `fall 3
  rise 2` smooths it.
- **Same path for liveness and traffic with auth required** → checks get 401.
  Health endpoints should be unauthenticated (and ideally not internet-exposed).
- **Forgetting `timeout check`** → a hung server holds the check open and skews
  detection. Set `timeout check 3s` for snappy failure detection independent of
  `timeout server`.

## Lab

Exercise all three: active, passive, and drain.

1. **Active recovery.** Use the lesson 02 config. Toggle `app2` sick and watch
   it leave/rejoin:
   ```bash
   docker compose exec app2 curl -s localhost:8080/toggle   # now /health → 503
   docker compose logs -f haproxy | grep -i 'is DOWN\|is UP' &
   sleep 8 && docker compose exec app2 curl -s localhost:8080/toggle
   ```
   You'll see `Server be_app/app2 is DOWN` then `... is UP` after `rise` checks.

2. **Drain.** Put app1 in drain and confirm only app2 answers, then restore:
   ```bash
   SOCK=/var/run/haproxy.sock
   docker compose exec haproxy sh -c "echo 'set server be_app/app1 state drain' | socat - $SOCK"
   for i in $(seq 1 6); do curl -s localhost:8080/ | jq -c .app; done   # all app2
   docker compose exec haproxy sh -c "echo 'set server be_app/app1 state ready' | socat - $SOCK"
   ```

3. **Inspect check state:**
   ```bash
   docker compose exec haproxy sh -c "echo 'show servers state be_app' | socat - /var/run/haproxy.sock"
   ```

## Cheat sheet

- `check` + `option httpchk` + `http-check expect` = active L7 checks.
- Tune `inter / fall / rise` (+ `fastinter`/`downinter`/`timeout check`).
- `observe layer7 ... on-error mark-down` = passive checks on live traffic.
- `option pgsql-check`/`mysql-check`/`redis-check` for DBs; `tcp-check` for
  custom protocols.
- `agent-check` lets the server report its own weight/state.
- Runtime API `set server <be>/<srv> state drain|ready|maint` = zero-downtime
  deploys.
- Keep liveness cheap; keep readiness honest; don't let a DB blip down the fleet.

Next: [05 — TLS termination & re-encryption](05-tls.md)
