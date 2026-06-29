# 01 — Architecture & mental model

Before any config, build the right mental model. Most HAProxy confusion comes
from not knowing *where* in the request lifecycle a directive applies.

## What HAProxy is

HAProxy (High Availability Proxy) is a **reverse proxy and load balancer** that
sits between clients and your servers. It terminates client connections,
decides which backend server should handle each request, opens (or reuses) a
connection to that server, and shuttles bytes between the two — while
optionally inspecting, rewriting, rate-limiting, and load-balancing.

It does **one thing** and is obsessive about doing it fast: it's a userspace,
event-driven proxy with a near-zero-copy data path. There's no application
runtime, no plugin VM, no scripting engine in the hot path (Lua exists but is
opt-in and sandboxed). That focus is why it routinely pushes millions of
requests/sec on commodity hardware.

## The process model (modern HAProxy)

One **master process** supervises one or more **worker processes**. Almost
always you run a **single worker** with multiple **threads** (`nbthread`).

```
            ┌───────────────── master process ─────────────────┐
            │  parses config, owns sockets, supervises workers, │
            │  performs seamless reloads                         │
            └───────────────────────┬───────────────────────────┘
                                     │ fork
                          ┌──────────▼──────────┐
                          │   worker process    │
                          │  nbthread = N        │   ← N event loops,
                          │  ┌───┐ ┌───┐ ┌───┐   │     one per CPU thread
                          │  │T0 │ │T1 │ │T2 │   │
                          │  └───┘ └───┘ └───┘   │
                          └─────────────────────┘
```

Key consequences:

- **Threads, not processes.** Older guides talk about `nbproc` (multiple
  workers). That model is **deprecated and removed** — it broke stick tables,
  stats, and the runtime API because state was siloed per process. Modern
  HAProxy uses `nbthread`; state is shared across threads. If you see `nbproc`
  in a tutorial, the tutorial is old.
- **Each thread runs its own event loop** using `epoll` (Linux). A thread
  handles many thousands of connections concurrently by never blocking.
- **The master enables zero-downtime reloads** — it can fork a fresh worker on
  the new config while the old worker finishes draining in-flight requests
  (lesson 08).

By default `nbthread` auto-detects available CPUs. Leave it on auto unless you
have a measured reason not to.

## How a request flows

```
client ──TCP/TLS──▶  FRONTEND  ──(decision)──▶  BACKEND  ──▶  SERVER
                       │                          │
                  bind, mode,                 balance algo,
                  ACLs, TLS                   health checks,
                  termination                 server list
```

1. **`bind`** — the frontend listens on an IP:port (or unix socket). One
   frontend can have several binds.
2. **Frontend processing** — in `mode http`, HAProxy parses the request line
   and headers; ACLs evaluate; you may rewrite, redirect, or reject here.
3. **`use_backend` / `default_backend`** — the frontend selects a backend
   (lesson 06 is all about this decision).
4. **Backend processing** — the **load-balancing algorithm** picks a server;
   stickiness and health state are consulted.
5. **Connection to the server** — HAProxy opens or reuses a pooled connection,
   forwards the request, streams the response back.

Hold onto this picture: **frontend = "what came in", backend = "where it
goes"**. Almost every directive belongs clearly to one side.

## Proxy modes: `tcp` vs `http`

This is the single most important concept in the whole course.

| | `mode tcp` (L4) | `mode http` (L7) |
|---|---|---|
| What HAProxy sees | Opaque byte stream | Parsed HTTP requests/responses |
| Routing on | IP, port, SNI, raw bytes | Host, path, headers, cookies, method |
| Can rewrite headers? | No | Yes |
| Per-request LB | No (per-connection) | Yes (per request, with keep-alive) |
| Used for | Databases, Redis, gRPC-over-raw-TCP, SMTP, anything non-HTTP | Web apps, REST/JSON APIs, anything HTTP |
| Health checks | TCP connect, or protocol-aware (`pgsql-check`, `mysql-check`, `redis-check`) | `http-check` (status, body, headers) |

- **Applications** (lessons 02–08) → `mode http`. You get content switching,
  header manipulation, cookie stickiness, per-request balancing.
- **Databases** (lesson 09) → `mode tcp`. The wire protocol isn't HTTP, so
  HAProxy treats it as a stream and load-balances per *connection*. This single
  fact drives every database pattern and pitfall later.

A subtlety: in `mode tcp` you can still *peek* at the start of the stream to
route on **TLS SNI** without decrypting (lesson 05) — useful but limited.

## The config file anatomy

A `haproxy.cfg` is made of **sections**. You'll meet these:

```haproxy
global       # process-wide settings: tuning, logging, TLS defaults, runtime API
defaults     # inherited defaults for the proxy sections below it
frontend     # a listening point + routing rules
backend      # a pool of servers + LB policy + health checks
listen       # frontend + backend fused into one block (handy for simple/TCP)
resolvers    # DNS for service discovery (lesson 09/11)
userlist     # auth for the stats page (lesson 07)
peers        # stick-table replication across nodes (lessons 08/10)
```

Rules of the road:

- **`defaults` is positional.** It applies to every proxy section *defined
  after it*. You can have multiple `defaults` blocks; each resets the baseline
  for what follows. This trips people up constantly.
- **`listen` = `frontend` + `backend`** in one block. Great for TCP services
  and the stats page; for HTTP apps the split form is clearer once ACLs grow.
- **Order within a section matters** for rule directives (`http-request`,
  `tcp-request`, `use_backend` …) — they're evaluated top to bottom like a
  pipeline, not declaratively.

Here's the skeleton every later lesson fills in:

```haproxy
global
    log stdout format raw local0
    maxconn 50000

defaults
    mode http
    log global
    option httplog
    timeout connect 5s
    timeout client  30s
    timeout server  30s

frontend fe_main
    bind :8080
    default_backend be_app

backend be_app
    balance roundrobin
    server app1 app1:8080 check
    server app2 app2:8080 check
```

We dissect every line of this in [lesson 02](02-first-proxy.md).

## Connection model & timeouts (read this twice)

HAProxy maintains **two sides** of every transaction: the **client side**
(frontend) and the **server side** (backend). Many timeouts come in pairs
because of this. The three you must always set:

- `timeout connect` — max time to *establish* the TCP connection to a server.
  Short (a few seconds). If this fires, the server is unreachable.
- `timeout client` — max idle time on the client side waiting for data.
- `timeout server` — max idle time waiting for the server to respond.

Forgetting these is the #1 production footgun: **a config with no timeouts will
happily pile up stuck connections until HAProxy runs out of file descriptors.**
HAProxy will even warn you at startup if they're missing. There are ~a dozen
more timeouts (`http-request`, `http-keep-alive`, `tunnel`, `queue`, `check`…)
introduced as we need them.

## Cheat sheet

- One master, one (usually) worker, N threads — **threads, not processes**.
- `frontend` = ingress + decisions; `backend` = server pool + LB + health.
- `mode http` for apps (L7, rich routing); `mode tcp` for databases (L4,
  per-connection).
- `defaults` applies to everything **below** it — position matters.
- Rule directives evaluate **top to bottom**.
- Always set `timeout connect/client/server`.

## Lab

No new config yet — just confirm the mental model against a running process:

```bash
cd docs/haproxy/lab
docker compose up -d --build haproxy app1 app2   # uses lesson 02 cfg next
# inspect the process tree: master + worker
docker compose exec haproxy ps -o pid,ppid,args
# how many threads did it pick?
docker compose exec haproxy sh -c 'cat /proc/$(pgrep -n haproxy)/status | grep Threads'
```

You'll see a master PID and a worker PID whose parent is the master, and a
thread count matching the container's CPU allowance.

Next: [02 — Your first proxy](02-first-proxy.md)
