# HAProxy for senior developers

A step-by-step course that takes you from "I've heard of HAProxy" to running it
in production in front of both **applications** (HTTP/L7) and **databases**
(TCP/L4). Written for people who already understand TCP, TLS, HTTP semantics,
and containers — so we skip the 101 networking and spend the time on what
makes HAProxy behave the way it does.

## How the course is structured

Each lesson is self-contained, builds on the previous one, and ends with a
**lab** you can run locally with Docker. Configs are written for **HAProxy
2.8+ / 3.0 LTS** syntax (the modern keyword set); anything version-sensitive is
called out inline.

| # | Lesson | What you walk away with |
|---|--------|-------------------------|
| 00 | [Lab setup](00-lab-setup.md) | A reproducible Docker sandbox used by every lesson |
| 01 | [Architecture & mental model](01-architecture.md) | How HAProxy processes a connection; proxy modes; the config sections |
| 02 | [Your first proxy](02-first-proxy.md) | A minimal working HTTP load balancer, line by line |
| 03 | [Load balancing applications](03-load-balancing-apps.md) | Algorithms, backends, weights, stickiness |
| 04 | [Health checks](04-health-checks.md) | Active/passive checks, `http-check`, agent checks, graceful drain |
| 05 | [TLS termination & re-encryption](05-tls.md) | Certs, SNI, redirects, HSTS, mTLS, backend re-encryption |
| 06 | [Routing: ACLs & content switching](06-acls-routing.md) | Path/host routing, header manipulation, rewrites, maps |
| 07 | [Observability](07-observability.md) | Stats page, Runtime API, structured logs, Prometheus metrics |
| 08 | [High availability & zero-downtime reloads](08-ha-reloads.md) | Seamless reloads, VRRP/keepalived, active-active patterns |
| 09 | [Exposing databases (TCP mode)](09-databases.md) | Postgres R/W split, MySQL/Galera, Redis, the pitfalls |
| 10 | [Security & traffic shaping](10-security.md) | Rate limiting, stick tables, abuse mitigation, hardening |
| 11 | [Capstone: the Kano stack](11-capstone-kano.md) | Flask API + Postgres behind one HAProxy, end to end |

## How to use it

- **Linear first pass.** The labs reuse a shared sandbox (lesson 00) and the
  configs evolve from lesson to lesson.
- **Reference second.** Each lesson has a "Cheat sheet" / "Gotchas" block near
  the end you can jump back to.
- **Type the configs.** HAProxy's grammar is terse and position-sensitive;
  muscle memory pays off. Don't copy-paste blindly the first time.

## Conventions used throughout

- `# >>>` comments mark the line a paragraph is talking about.
- Configs are shown as full `haproxy.cfg` files when small, and as section
  diffs (`+`/`-`) once the file is large.
- Every lab is runnable with the Compose project in [lesson 00](00-lab-setup.md);
  commands assume you're in `docs/haproxy/lab/`.

## A note on versions

HAProxy ships a new feature release roughly every 6 months and an LTS every
year. This course targets the **3.0 LTS** keyword set but flags 2.x
differences. The biggest historical gotcha — the `nbproc` multi-process model —
is gone: modern HAProxy is **multi-threaded single-process** (`nbthread`), and
all examples assume that.
