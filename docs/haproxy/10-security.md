# 10 — Security & traffic shaping

HAProxy is a natural place to enforce limits and absorb abuse, because it sees
every connection before your app does. This lesson covers stick tables (the
engine behind rate limiting), connection/request rate limiting, slowloris and
request-size protection, IP allow/deny, bot/abuse mitigation, and hardening the
edge.

## Stick tables: the rate-limiting engine

A **stick table** is an in-memory key→counters store. You pick a key (client IP,
a header, a URL param) and HAProxy tracks counters per key: request rate,
connection rate, error rate, bytes, concurrent connections, and more. Everything
in this lesson is built on them.

```haproxy
backend st_abuse
    stick-table type ip size 1m expire 10m store http_req_rate(10s),conn_cur,conn_rate(10s),http_err_rate(10s)
```

- `type ip` — key is an IPv4/IPv6 address. Can also be `string`, `integer`,
  `binary` (e.g. key on a header or JWT subject).
- `size 1m` — up to 1,000,000 tracked keys (pre-allocated memory).
- `expire 10m` — entries idle for 10m are evicted.
- `store ...` — which counters to maintain. `http_req_rate(10s)` = requests in a
  sliding 10s window; `conn_cur` = current concurrent connections; etc.

A dedicated backend just to *hold* a table is a common idiom; you `track` into it
from a frontend.

## Per-IP request rate limiting

Track every client and deny those exceeding a threshold:

```haproxy
frontend fe_app
    bind :8080

    # 1) point at the table and start tracking this connection's source IP
    stick-table type ip size 1m expire 10m store http_req_rate(10s)
    http-request track-sc0 src

    # 2) define "abusive" and act on it
    acl too_fast sc_http_req_rate(0) gt 100        # >100 req / 10s from one IP
    http-request deny deny_status 429 if too_fast

    default_backend be_app
```

- `track-sc0 src` — track the source IP in **stick-counter slot 0** (you have
  sc0..sc2 for tracking multiple keys at once).
- `sc_http_req_rate(0)` — read the current 10s request rate for the tracked key
  in slot 0.
- Over the limit → `429 Too Many Requests`. Use `tarpit` instead of `deny` to
  hold abusers in a slow-drip instead of replying fast (raises their cost):
  ```haproxy
  http-request tarpit if too_fast
  ```

### Tiered response (warn → throttle → block)

```haproxy
    acl heavy   sc_http_req_rate(0) gt 50
    acl abusive sc_http_req_rate(0) gt 200
    http-request set-header X-RateLimit-Warning true if heavy
    http-request deny deny_status 429 if abusive
```

### Returning rate-limit headers

```haproxy
    http-request set-var(req.rate) sc_http_req_rate(0)
    http-response set-header X-RateLimit-Used %[var(req.rate)]
```

## Connection limits & slow-start protection

Limit **concurrent connections** per IP (cheap defense against connection
exhaustion):

```haproxy
    stick-table type ip size 1m expire 10m store conn_cur,conn_rate(10s)
    tcp-request connection track-sc0 src
    tcp-request connection reject if { sc_conn_cur(0) gt 20 }       # max 20 concurrent / IP
    tcp-request connection reject if { sc_conn_rate(0) gt 100 }     # max 100 new conns / 10s
```

Note these are `tcp-request connection` rules — they run at **connection accept
time**, before any HTTP parsing, so they're the cheapest possible rejection and
work in both `mode tcp` and `mode http`.

## Slowloris & request-smuggling protection

```haproxy
defaults
    timeout http-request 5s          # full request headers must arrive in 5s
    timeout client-fin 5s
    timeout http-keep-alive 2s

frontend fe_app
    # cap header and body sizes (DoS via giant headers/bodies)
    # tune.* live in global; per-frontend you can deny oversized requests:
    http-request deny deny_status 413 if { req.body_size gt 10485760 }   # 10MB

global
    tune.bufsize 32768               # max request line + headers buffer
    tune.maxrewrite 8192
    # reject ambiguous/conflicting Content-Length/Transfer-Encoding (smuggling)
    # modern HAProxy is strict by default; keep h2/h1 normalization on:
    h1-case-adjust-bogus-client      # optional: tolerate broken clients
```

`timeout http-request` is your primary slowloris defense — a client dribbling
headers byte-by-byte gets cut at 5s. HAProxy's HTTP parser is also strict about
HTTP/1 framing by default, which closes most request-smuggling vectors; don't
loosen it without reason.

## IP allow/deny lists

```haproxy
    # static allow/deny from files (one CIDR per line), editable at runtime
    acl blocked  src -f /etc/haproxy/blocklist.acl
    acl allowed  src -f /etc/haproxy/allowlist.acl

    tcp-request connection reject if blocked
    http-request deny if { path_beg /admin } !allowed     # admin only from allowlist
```

Update lists live without reload via the Runtime API:

```bash
echo "add acl /etc/haproxy/blocklist.acl 203.0.113.66" | socat - /var/run/haproxy.sock
echo "show acl /etc/haproxy/blocklist.acl" | socat - /var/run/haproxy.sock
```

Or build an **auto-blocklist from behavior** using a stick table — track error
rates and block IPs that probe:

```haproxy
    stick-table type ip size 1m expire 30m store http_err_rate(10s)
    http-request track-sc0 src
    acl scanning sc_http_err_rate(0) gt 20     # >20 4xx/5xx in 10s = scanner
    http-request deny deny_status 403 if scanning
```

## Sharing abuse state across nodes

Rate limits must be enforced **globally**, not per-LB-node, or an attacker just
spreads load across your two HAProxy nodes to multiply their allowance. Replicate
the table with `peers` (lesson 08):

```haproxy
peers mypeers
    peer a 10.0.0.10:10000
    peer b 10.0.0.11:10000

frontend fe_app
    stick-table type ip size 1m expire 10m store http_req_rate(10s) peers mypeers
    http-request track-sc0 src
    http-request deny deny_status 429 if { sc_http_req_rate(0) gt 100 }
```

## Bot / L7 DoS mitigation patterns

- **Challenge suspicious clients**: redirect first-seen IPs through a JS/cookie
  challenge, only letting through those that echo a token (basic bot filter).
- **Per-path limits**: tighter rates on expensive endpoints (login, search,
  export) than on static assets — use separate `track-sc1` with a key of
  `src,concat(,path)` or per-path ACLs.
- **Geo/ASN gating**: `map_ip` to classify source IPs and apply different limits
  by region/ASN.
- **Login brute-force**: track failed-login responses (`http-response
  sc-inc-gpc0` on 401) and block IPs exceeding a threshold:
  ```haproxy
      stick-table type ip size 1m expire 1h store gpc0,gpc0_rate(10m)
      http-request track-sc0 src
      http-request deny deny_status 429 if { sc_gpc0_rate(0) gt 5 } { path /login }
      http-response sc-inc-gpc0(0) if { status 401 } { path /login }
  ```
  `gpc0` = a general-purpose counter you increment on bad logins; block after 5
  in 10 minutes.

## Edge hardening checklist

- **TLS**: strong `ssl-default-bind-*`, TLS 1.2+ only, HSTS (lesson 05).
- **Hide fingerprints**: `http-response del-header Server` and any
  `X-Powered-By`/version headers from backends.
- **Security headers**: set `X-Content-Type-Options: nosniff`,
  `X-Frame-Options`, a `Content-Security-Policy`, `Referrer-Policy` at the edge
  so every backend inherits them.
- **Strip untrusted inbound headers**: `del-header X-Forwarded-For` before
  `option forwardfor` re-adds the real one (prevents IP spoofing);
  `del-header X-Real-IP`, etc.
- **Limit methods/sizes**: deny unexpected methods, cap body size.
- **Lock down control planes**: stats page and Runtime API behind auth +
  source ACLs; unix socket with `mode 660`, not a public TCP port.
- **Run as non-root**: `user haproxy` / `group haproxy` + `chroot` in `global`.
  ```haproxy
  global
      user haproxy
      group haproxy
      chroot /var/lib/haproxy
  ```
- **Drop privileges after bind**: HAProxy binds privileged ports as root, then
  drops to the configured user automatically.

## Lab

Prove rate limiting end-to-end.

```haproxy
frontend fe_app
    bind :8080
    stick-table type ip size 1m expire 1m store http_req_rate(10s)
    http-request track-sc0 src
    http-request deny deny_status 429 if { sc_http_req_rate(0) gt 10 }
    default_backend be_app

backend be_app
    server app1 app1:8080 check
    server app2 app2:8080 check
```

```bash
docker compose restart haproxy
# fire 20 requests fast; first ~10 get 200, the rest 429
for i in $(seq 1 20); do curl -s -o /dev/null -w '%{http_code} ' localhost:8080/; done; echo

# inspect the table — see your IP and its current rate
docker compose exec -T haproxy sh -c "echo 'show table fe_app' | socat - /var/run/haproxy.sock"

# wait for the window to slide, then you're allowed again
sleep 11
curl -s -o /dev/null -w '%{http_code}\n' localhost:8080/    # 200
```

You'll see your source IP in `show table` with `http_req_rate` climbing, then
the 429s kicking in once it crosses 10.

## Cheat sheet

- **Stick tables** track per-key counters (`http_req_rate`, `conn_cur`,
  `conn_rate`, `http_err_rate`, `gpc0`). Foundation of all rate limiting.
- `track-sc0 src` then act on `sc_*_rate(0)`; `deny 429` or `tarpit`.
- `tcp-request connection reject` for cheapest pre-HTTP rejection (conn limits).
- `timeout http-request` = slowloris defense; cap body/header sizes.
- IP lists via `-f file` ACLs, editable live over the Runtime API; auto-block on
  `http_err_rate`.
- **Replicate tables with `peers`** so limits are global, not per-node.
- Harden the edge: security headers, strip untrusted inbound headers, hide
  fingerprints, lock down stats/runtime, run non-root + chroot.

Next: [11 — Capstone: the Kano stack](11-capstone-kano.md)
