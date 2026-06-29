# 05 — TLS termination & re-encryption

HAProxy is one of the most capable TLS edges around. This lesson covers
terminating TLS at the edge, redirecting HTTP→HTTPS, HSTS, SNI-based routing,
backend re-encryption, mutual TLS, and the certificate-management ergonomics
that matter in production.

## The three TLS topologies

```
1. TLS termination (most common)
   client ──TLS──▶ HAProxy ──plaintext──▶ backend
   HAProxy decrypts; backend speaks HTTP. Lets HAProxy route on L7.

2. TLS re-encryption (bridging)
   client ──TLS──▶ HAProxy ──TLS──▶ backend
   Decrypt to inspect/route, then re-encrypt to the backend. Zero-trust networks.

3. TLS passthrough
   client ──TLS──────────────────▶ backend   (HAProxy in mode tcp)
   HAProxy never decrypts; routes only on SNI. Backend owns the cert.
```

For an HTTP app you almost always want **#1 (terminate)** so you can do content
switching, headers, compression, and HTTP/2. Use **#2** when policy requires
encryption on the wire even inside your network. Use **#3** for opaque TLS
services or when the backend must own the cert (some databases, lesson 09).

## Generating a lab cert

```bash
cd docs/haproxy/lab
mkdir -p certs
# self-signed cert+key, CONCATENATED into one PEM (HAProxy wants them together)
openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
  -subj "/CN=localhost" \
  -keyout certs/localhost.key -out certs/localhost.crt
cat certs/localhost.crt certs/localhost.key > certs/localhost.pem
chmod 600 certs/localhost.pem
```

> **HAProxy expects the cert chain and private key in a single PEM file**
> (cert(s) first, then key). With Let's Encrypt you concatenate
> `fullchain.pem` + `privkey.pem`. Point `crt` at a *file* or a *directory* of
> such PEMs.

## Terminating TLS

```haproxy
global
    # modern, safe TLS defaults applied to every bind
    ssl-default-bind-ciphersuites TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256
    ssl-default-bind-ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384
    ssl-default-bind-options ssl-min-ver TLSv1.2 no-tls-tickets

frontend fe_https
    bind :80
    bind :443 ssl crt /etc/haproxy/certs/localhost.pem alpn h2,http/1.1

    # force HTTPS: 308 redirect any plaintext request
    http-request redirect scheme https code 308 unless { ssl_fc }

    # HSTS once we're on HTTPS (tell browsers "always use TLS")
    http-response set-header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" if { ssl_fc }

    # tell the backend the original scheme
    http-request set-header X-Forwarded-Proto https if { ssl_fc }
    http-request set-header X-Forwarded-Proto http  if !{ ssl_fc }

    default_backend be_app
```

Line notes:

- **`bind :443 ssl crt ... alpn h2,http/1.1`** — terminate TLS using the PEM;
  advertise **HTTP/2** then HTTP/1.1 via ALPN. HAProxy speaks HTTP/2 to the
  client and (typically) HTTP/1.1 to the backend — totally fine.
- **`ssl_fc`** is the fetch "is this connection front-side TLS?" — true on the
  `:443` bind, false on `:80`. We use it to redirect and to set headers.
- **`redirect scheme https code 308`** — bounce plaintext to HTTPS. `308`
  preserves the method/body (vs `301` which clients may turn into GET).
- **HSTS** — opt-in. Once set, browsers refuse plaintext to your domain for
  `max-age`. `preload` is a commitment (gets you on the browser preload list);
  don't add it until you're sure every subdomain is HTTPS-only.
- The `global` `ssl-default-bind-*` lines set strong ciphers/min-version once
  for all binds — set them and forget the per-bind crypto.

## SNI-based routing (one IP, many certs/sites)

A `crt` **directory** auto-selects the right cert by SNI. Routing per hostname:

```haproxy
frontend fe_https
    bind :443 ssl crt /etc/haproxy/certs/   # dir: picks cert by SNI hostname

    use_backend be_api  if { ssl_fc_sni -i api.kano.example }
    use_backend be_www  if { ssl_fc_sni -i www.kano.example }
    default_backend be_app
```

`ssl_fc_sni` is the SNI the client requested. `req.hdr(host)` is the HTTP Host
header. They usually match, but SNI is available *before* HTTP parsing — handy
for `mode tcp` passthrough/routing.

### TLS passthrough by SNI (mode tcp)

Route encrypted traffic to different backends **without decrypting**, by peeking
at the TLS ClientHello:

```haproxy
frontend fe_sni
    bind :443
    mode tcp
    tcp-request inspect-delay 5s
    tcp-request content accept if { req_ssl_hello_type 1 }   # wait for ClientHello
    use_backend be_secure_api if { req_ssl_sni -i api.kano.example }
    default_backend be_passthrough

backend be_secure_api
    mode tcp
    server s1 s1:443    # backend terminates its own TLS
```

`tcp-request inspect-delay` + `req_ssl_sni` let HAProxy read the SNI from the
handshake bytes and route, while the backend keeps ownership of the certificate.

## Backend re-encryption (bridging)

Terminate from the client, then open a **new TLS connection** to the backend:

```haproxy
backend be_app
    server app1 app1:8443 ssl verify required ca-file /etc/haproxy/certs/internal-ca.crt sni str(app1.internal)
```

- `ssl` — connect to the backend over TLS.
- `verify required` — **validate the backend's cert** against `ca-file`. The
  default in some setups is `verify none`, which silently disables validation —
  **never ship `verify none` in production**; it defeats the point of
  re-encryption. Use `verify required` with your internal CA.
- `sni str(app1.internal)` — send SNI so the backend serves the right cert.

## Mutual TLS (client certificates)

Require clients to present a cert — common for service-to-service and partner
APIs:

```haproxy
frontend fe_mtls
    bind :443 ssl crt /etc/haproxy/certs/localhost.pem \
         ca-file /etc/haproxy/certs/client-ca.crt verify required

    # reject if no valid client cert (verify required already does, but explicit ACLs let you 403 nicely)
    http-request deny deny_status 403 unless { ssl_c_used }

    # pass client cert identity to the backend
    http-request set-header X-Client-DN %{+Q}[ssl_c_s_dn]
    http-request set-header X-Client-Verify %[ssl_c_verify]
    default_backend be_app
```

- `verify required` on the bind enforces a valid client cert signed by
  `ca-file`. `verify optional` lets you allow-but-flag.
- `ssl_c_*` fetches expose the client cert's subject DN, issuer, serial,
  verification result — forward them so the app can authorize on identity.

## Certificate management without reloads

You can add/replace certs at runtime over the Runtime API — no reload, no
dropped connections (great for ACME renewals):

```bash
SOCK=/var/run/haproxy.sock
# stage a new cert, then commit atomically
echo -e "set ssl cert /etc/haproxy/certs/localhost.pem <<\n$(cat certs/localhost.pem)\n" | socat - $SOCK
echo "commit ssl cert /etc/haproxy/certs/localhost.pem" | socat - $SOCK
```

HAProxy 2.8+/3.x also has **native ACME** support and `crt-store`/crt-list
features for managing many certs declaratively. For most teams, a tool like
certbot + the Runtime API (or the data-plane API) handles renewals hands-off.

## Performance notes

- **OCSP stapling** avoids a client-side round-trip to the CA; HAProxy serves a
  stapled OCSP response if you provide the `.ocsp` file (or use auto-update in
  newer versions).
- **TLS session resumption** (tickets/cache) cuts full handshakes. We disabled
  tickets above (`no-tls-tickets`) for forward-secrecy hygiene in multi-node
  setups unless you synchronize ticket keys; the session **cache**
  (`tune.ssl.cachesize`) is fine.
- **Terminate once.** Doing TLS at HAProxy means backends skip the handshake
  cost entirely — a big reason to terminate rather than passthrough.

## Lab

```bash
cd docs/haproxy/lab
# generate the cert (above), then use the TLS frontend config from this lesson.
# expose 443 from the container — add to docker-compose.yml haproxy ports:
#   - "8443:443"
#   - "8081:80"
docker compose up -d --build haproxy app1 app2

# HTTP redirects to HTTPS (308)
curl -sI http://localhost:8081/ | head -n1            # HTTP/1.1 308

# HTTPS works (self-signed → -k); ALPN negotiates h2
curl -sk https://localhost:8443/ | jq -c .app
curl -sk --http2 -o /dev/null -w '%{http_version}\n' https://localhost:8443/   # 2

# HSTS header present
curl -skI https://localhost:8443/ | grep -i strict-transport
```

## Cheat sheet

- Cert + key concatenated into one PEM; `crt file` or `crt dir/` (SNI auto-select).
- Set strong defaults once via `global ssl-default-bind-*`.
- `redirect scheme https code 308 unless { ssl_fc }` + HSTS on `if { ssl_fc }`.
- `alpn h2,http/1.1` to offer HTTP/2.
- Route by SNI with `ssl_fc_sni` (L7) or `req_ssl_sni` (L4 passthrough).
- Re-encrypt with `server ... ssl verify required ca-file ... sni ...` — never
  `verify none` in prod.
- mTLS: `bind ... ca-file ... verify required`; forward `ssl_c_*` identity.
- Hot-swap certs via Runtime API / ACME — no reload.

Next: [06 — Routing: ACLs & content switching](06-acls-routing.md)
