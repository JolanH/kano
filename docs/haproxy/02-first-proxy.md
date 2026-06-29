# 02 — Your first proxy

We'll write a complete, working HTTP load balancer and dissect **every line**.
By the end you can read any `haproxy.cfg` and know which section owns what.

## The config

Drop this into `lab/haproxy/haproxy.cfg`:

```haproxy
#---------------------------------------------------------------------
# global — process-wide settings
#---------------------------------------------------------------------
global
    log stdout format raw local0 info      # log to container stdout
    maxconn 50000                          # process-wide connection ceiling
    stats socket /var/run/haproxy.sock mode 660 level admin  # Runtime API
    stats timeout 30s

#---------------------------------------------------------------------
# defaults — inherited by every proxy section BELOW this block
#---------------------------------------------------------------------
defaults
    mode http                              # L7 — parse HTTP
    log global                             # use the log target from `global`
    option httplog                         # rich per-request log lines
    option dontlognull                     # don't log health-check noise
    option http-server-close               # connection management (see below)
    retries 3                              # retry a failed connect up to 3x
    timeout connect 5s
    timeout client  30s
    timeout server  30s
    timeout http-request 10s               # max time to receive full req headers
    timeout http-keep-alive 2s

#---------------------------------------------------------------------
# frontend — what comes in
#---------------------------------------------------------------------
frontend fe_app
    bind :8080
    default_backend be_app

#---------------------------------------------------------------------
# backend — where it goes
#---------------------------------------------------------------------
backend be_app
    balance roundrobin
    option httpchk GET /health             # active health check (lesson 04)
    http-check expect status 200
    server app1 app1:8080 check
    server app2 app2:8080 check
```

Validate and run:

```bash
cd docs/haproxy/lab
docker compose exec haproxy haproxy -c -f /usr/local/etc/haproxy/haproxy.cfg
docker compose restart haproxy
for i in $(seq 1 6); do curl -s localhost:8080/ | jq -c .; done
```

Expected — requests alternate between backends:

```json
{"app":"app1","path":"/","client":"172.x.x.x"}
{"app":"app2","path":"/","client":"172.x.x.x"}
{"app":"app1","path":"/","client":"172.x.x.x"}
...
```

You just load-balanced. Now let's understand why each line is there.

## `global`, line by line

```haproxy
log stdout format raw local0 info
```
Send logs to **stdout** (ideal for containers — Docker/k8s collect it).
`format raw` means "don't add a syslog header"; `local0` is the syslog
facility; `info` the level. Outside containers you'd point at
`/dev/log` or a remote syslog (`log 127.0.0.1:514 len 8192 local0`).

```haproxy
maxconn 50000
```
Hard ceiling on **concurrent connections** for the whole process. HAProxy
pre-sizes memory and file-descriptor limits from this. Too low → clients get
queued/refused under load; too high → you can exhaust RAM/FDs. It pairs with
per-`server` `maxconn` and per-`bind` limits.

```haproxy
stats socket /var/run/haproxy.sock mode 660 level admin
```
Opens the **Runtime API** unix socket — the live control plane. With it you can
drain a server, change weights, read counters, and flush stick tables *without
reloading*. `level admin` grants write commands. We use this heavily in
lessons 04, 07, and 08. You can also expose it over TCP, but a unix socket with
tight perms is the safe default.

## `defaults`, line by line

```haproxy
mode http
```
L7 mode for everything below. Frontends/backends can override per section, but
setting the common case here keeps each section short.

```haproxy
option httplog
```
Switches the log line format to the **HTTP log format**, which includes timers
(`Tq/Tw/Tc/Tr/Tt`), status code, bytes, the selected backend+server, and
termination state. This log line is your best friend when debugging latency —
we decode it in lesson 07.

```haproxy
option http-server-close
```
Connection-management policy. HAProxy keeps the **client** connection alive
(keep-alive) but **closes the server-side** connection after each response.
This is a safe, simple default. The alternatives:

- `option httpclose` — close both sides each request (least efficient).
- *(no option)* / `http-keep-alive` — keep both sides alive and **pool**
  server connections (most efficient; default in modern versions). Use this
  when your backends handle keep-alive well.
- `http-server-close` — the middle ground shown here; predictable and fine for
  the lab.

We'll revisit connection reuse for performance in lesson 03.

```haproxy
retries 3
```
If the **connection to the server fails** (connect error/timeout, or the server
is down), retry up to 3 times — by default on the *same or another* server
depending on `option redispatch`. Crucially this retries the *connection*, not
arbitrary failed responses. Add `option redispatch` to let a retry pick a
*different* server:

```haproxy
    retries 3
    option redispatch        # on retry, move to another server in the pool
```

```haproxy
timeout connect 5s
timeout client  30s
timeout server  30s
timeout http-request 10s
timeout http-keep-alive 2s
```
The mandatory trio plus two HTTP-specific ones:
- `http-request 10s` — slowloris protection: a client has 10s to send the
  **complete** request headers, else `408`.
- `http-keep-alive 2s` — how long to hold an idle keep-alive client connection
  open between requests.

## `frontend`, line by line

```haproxy
frontend fe_app
    bind :8080
    default_backend be_app
```
- `bind :8080` — listen on all interfaces, port 8080. You can bind multiple
  times (`bind :80`, `bind :443 ssl crt ...`) and bind to specific IPs or a
  unix socket. The `8080:8080` Compose mapping exposes it to your host.
- `default_backend be_app` — with no ACL/`use_backend` rules, everything goes
  to `be_app`. Lesson 06 replaces this with conditional routing.

## `backend`, line by line

```haproxy
backend be_app
    balance roundrobin
    option httpchk GET /health
    http-check expect status 200
    server app1 app1:8080 check
    server app2 app2:8080 check
```
- `balance roundrobin` — rotate through servers request by request. Other
  algorithms in lesson 03.
- `option httpchk GET /health` + `http-check expect status 200` — actively poll
  `/health` on each server; mark it DOWN if it stops returning 200. Full
  treatment in lesson 04.
- `server <name> <addr:port> [params]` — a backend member. The **name** shows up
  in logs and the stats page (make it meaningful). `check` enables active health
  checking for that server. Common params you'll add later: `weight`, `maxconn`,
  `backup`, `cookie`, `ssl verify`, `resolvers`.

## The `listen` short form

For simple or TCP services, fuse frontend+backend:

```haproxy
listen app
    bind :8080
    balance roundrobin
    server app1 app1:8080 check
    server app2 app2:8080 check
```

Functionally identical to the split form for this simple case. Prefer the split
form once you have ACLs and multiple backends; prefer `listen` for the stats
page and TCP database proxies (lessons 07, 09).

## Watch a backend drop out

Make `app2` sick and watch HAProxy route around it:

```bash
# app2 starts returning 503 on /health
docker compose exec app2 sh -c 'wget -qO- http://localhost:8080/toggle'
# within a couple check intervals, all traffic goes to app1:
for i in $(seq 1 6); do curl -s localhost:8080/ | jq -c .app; done
# heal it
docker compose exec app2 sh -c 'wget -qO- http://localhost:8080/toggle'
```

That automatic rerouting — with no client errors — is the entire point of a
load balancer. Lesson 04 makes the health-check behavior precise.

## Common first-config mistakes

- **No timeouts.** HAProxy warns at boot; fix it. Stuck connections leak FDs.
- **`defaults` placed *after* the proxy that needs it.** Defaults only apply to
  sections below. Put your common `defaults` block near the top.
- **Forgetting `check`** on `server` lines — without it, HAProxy assumes the
  server is always up and will happily send traffic to a dead box.
- **Binding a port you didn't publish from the container** — the listen is fine
  but you can't reach it from the host.

## Cheat sheet

```haproxy
global    { log, maxconn, stats socket, tuning }
defaults  { mode, timeouts, options, retries }   # applies BELOW
frontend  { bind, ACLs, use_backend/default_backend }
backend   { balance, health checks, server lines }
listen    { frontend+backend fused }
```

Next: [03 — Load balancing applications](03-load-balancing-apps.md)
