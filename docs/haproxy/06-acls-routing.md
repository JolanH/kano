# 06 — Routing: ACLs & content switching

This is where HAProxy stops being "just a load balancer" and becomes a
programmable L7 edge. You'll learn ACLs, content switching to multiple backends,
request/response header manipulation, path rewriting, redirects, and maps for
scaling routing rules.

## ACLs: the building block

An **ACL** is a named boolean test over some property of the request/response.
You define it, then reference it in rules.

```haproxy
frontend fe_app
    bind :8080

    # define ACLs (name + fetch + matcher)
    acl is_api      path_beg /api/
    acl is_static   path_end .js .css .png .jpg .woff2
    acl is_admin    path_beg /admin
    acl from_office src 203.0.113.0/24
    acl host_api    hdr(host) -i api.kano.example

    # use them to pick backends (first match wins, top to bottom)
    use_backend be_static if is_static
    use_backend be_api    if is_api
    use_backend be_admin  if is_admin from_office     # AND: both must be true
    default_backend be_web
```

Anatomy: `acl <name> <fetch> [flags] <pattern...>`.

- **Fetch** — what to look at: `path`, `path_beg`, `path_end`, `path_reg`,
  `hdr(name)`, `url_param(x)`, `src`, `method`, `ssl_fc`, `ssl_fc_sni`,
  `req.cook(name)`, `req.body`, … hundreds exist.
- **Matcher flags** — `-i` case-insensitive, `-m beg/end/sub/reg/str` match
  mode, `-f file` load patterns from a file.
- **Combining** — multiple ACLs on one `if` are **AND**ed; list a condition
  twice with `||` for OR; prefix `!` to negate:
  ```haproxy
  use_backend be_x if acl_a acl_b              # a AND b
  use_backend be_y if acl_a || acl_c           # a OR c
  use_backend be_z if !acl_a                    # NOT a
  ```

### Rule evaluation order

`use_backend` rules evaluate **top to bottom; first match wins**. Order your
rules from most specific to least specific, with `default_backend` as the
catch-all. This is imperative, not declarative — get the order wrong and a broad
rule shadows a narrow one.

## Content switching: many backends, one frontend

The pattern above routes by path/host to separate pools:

```haproxy
backend be_static
    server cdn1 cdn1:8080 check
backend be_api
    balance leastconn
    server api1 api1:8080 check
    server api2 api2:8080 check
backend be_web
    server web1 web1:8080 check
```

This is how a single edge serves `/api/*` from your API fleet, `/static/*` from
a cache tier, and everything else from the web app — each pool tuned
independently (algorithm, timeouts, health checks).

## Header manipulation

`http-request` runs on the way **in** (toward the backend); `http-response` on
the way **out** (toward the client). Both evaluate top to bottom.

```haproxy
frontend fe_app
    # add/overwrite request headers sent to the backend
    http-request set-header X-Request-ID %[uuid()]
    http-request set-header X-Forwarded-Proto https if { ssl_fc }
    http-request add-header  X-Edge haproxy-lab

    # strip a sensitive/incoming header you don't trust from clients
    http-request del-header X-Internal-Token

    # rewrite/remove response headers
    http-response set-header X-Frame-Options DENY
    http-response set-header Content-Security-Policy "default-src 'self'"
    http-response del-header Server                # hide backend fingerprint
```

- `set-header` replaces (or creates); `add-header` appends another instance;
  `del-header` removes. Use **`set`** for security headers so a sneaky backend
  can't smuggle a second value.
- **Always `del-header` untrusted inbound headers** like `X-Forwarded-For`
  before `option forwardfor` re-adds the real value — otherwise a client can
  spoof their IP. (`option forwardfor` appends; for strict control set it
  explicitly.)
- `%[...]` interpolates a **sample fetch**; `%[uuid()]` / `%[req.id]` are handy
  for request tracing through your logs.

## Path & host rewriting

```haproxy
    # strip a path prefix before forwarding: /api/v1/foo -> /v1/foo
    http-request set-path %[path,regsub(^/api/,/)]

    # rewrite host
    http-request set-header Host internal.svc

    # redirect (note: redirect != rewrite — redirect bounces the client)
    http-request redirect location /new-home code 301 if { path /old-home }
    http-request redirect prefix https://www.kano.example code 301 if { hdr(host) -i kano.example }
```

- **`set-path` / `set-uri` / `set-query`** rewrite the request *server-side* —
  the client URL is unchanged. Use `regsub(<re>,<replacement>[,flags])` for
  regex rewrites.
- **`redirect`** sends a 30x to the client (URL visibly changes). Use it for
  canonical host, http→https, and moved resources — not for internal routing.

The classic "strip prefix and route to API" combo:

```haproxy
    acl is_api path_beg /api/
    http-request set-path %[path,regsub(^/api/,/)] if is_api
    use_backend be_api if is_api
```

## Returning responses directly from HAProxy

HAProxy can answer without a backend — maintenance pages, health, simple
allow/deny:

```haproxy
    # block by IP with a clean status
    acl banned src -f /etc/haproxy/banned.acl
    http-request deny deny_status 403 if banned

    # serve a tiny inline response
    http-request return status 200 content-type "text/plain" string "pong" if { path /ping }

    # serve a maintenance page file when a backend is down
    http-request return status 503 content-type "text/html" file /etc/haproxy/maint.html if { nbsrv(be_app) eq 0 }
```

`nbsrv(be_app)` = number of UP servers in a backend — gate behavior on capacity.

## Maps: routing rules at scale

Hard-coding 500 host→backend rules is unmaintainable. **Maps** are key→value
lookup files loaded into memory:

```
# /etc/haproxy/hosts.map
api.kano.example     be_api
www.kano.example     be_web
shop.kano.example    be_shop
```

```haproxy
frontend fe_app
    bind :8080
    # look up the host in the map; default to be_web if not found
    use_backend %[req.hdr(host),lower,map(/etc/haproxy/hosts.map,be_web)]
```

One line routes thousands of hosts, and you can **update the map at runtime**
without a reload:

```bash
echo "add map /etc/haproxy/hosts.map new.kano.example be_new" | socat - /var/run/haproxy.sock
echo "show map /etc/haproxy/hosts.map" | socat - /var/run/haproxy.sock
```

Maps power multi-tenant routing, feature flags, A/B bucketing, and geo/IP
classification (`map_ip`). This is the scaling answer when ACL lists get long.

## A/B and canary routing

Split traffic deterministically (sticky per user) or randomly:

```haproxy
    # 5% canary by random
    acl is_canary rand(100) lt 5
    use_backend be_canary if is_canary

    # OR sticky-by-cookie/user so a given user always sees the same variant
    acl variant_b req.cook(ab) -m str B
    use_backend be_v2 if variant_b
```

Combine with `weight`/`slowstart` (lesson 03) for gradual rollout, and watch the
canary backend's metrics (lesson 07) before widening.

## Lab

Build a content-switching edge over the two echo apps plus an inline route.

```haproxy
defaults
    mode http
    timeout connect 5s
    timeout client 30s
    timeout server 30s

frontend fe_app
    bind :8080
    http-request set-header X-Request-ID %[uuid()]
    http-request return status 200 content-type text/plain string "pong\n" if { path /ping }
    acl is_api path_beg /api/
    http-request set-path %[path,regsub(^/api/,/)] if is_api
    use_backend be_api if is_api
    default_backend be_web

backend be_web
    server app1 app1:8080 check
backend be_api
    balance roundrobin
    server app1 app1:8080 check
    server app2 app2:8080 check
```

```bash
docker compose restart haproxy
curl -s localhost:8080/ping                      # -> pong (no backend hit)
curl -s localhost:8080/ | jq -c .app             # -> be_web (app1)
curl -s localhost:8080/api/things | jq -c .      # path rewritten to /things, RR over both
curl -si localhost:8080/api/things | grep -i x-request-id   # tracing header injected
```

Note `path` in the `/api/things` response is `/things` — the prefix was stripped
before forwarding.

## Cheat sheet

- `acl name fetch [-i/-m...] pattern` → reference in `if`/`unless`.
- Conditions on one line = AND; `||` = OR; `!` = NOT.
- `use_backend` is first-match-wins, top to bottom; `default_backend` catches.
- `http-request` (inbound) / `http-response` (outbound), evaluated in order.
- `set-header` (replace) vs `add-header` (append) vs `del-header`; strip
  untrusted inbound headers.
- `set-path/set-uri` rewrite server-side; `redirect` bounces the client.
- `http-request return/deny` answer without a backend.
- **Maps** (`map(...)`) for large/runtime-editable routing tables.

Next: [07 — Observability](07-observability.md)
