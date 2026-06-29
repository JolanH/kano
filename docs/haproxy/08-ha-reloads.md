# 08 — High availability & zero-downtime reloads

HAProxy makes your *backends* highly available. This lesson is about making
**HAProxy itself** highly available, and applying config changes without
dropping a single connection.

## Two distinct problems

1. **Zero-downtime config changes** on a single node — reload `haproxy.cfg`
   without dropping in-flight requests or refusing new connections during the
   swap.
2. **Surviving the loss of an HAProxy node** — because a single LB is a single
   point of failure. Solved with a floating IP (VRRP/keepalived) or an
   upstream/cloud LB, plus shared state.

## Zero-downtime reloads (the master-worker model)

Recall lesson 01: a **master** supervises **workers**. On reload the master
starts a *new* worker with the new config while the *old* worker keeps serving
its existing connections, then exits when drained. No socket is ever closed, so
no connection is refused.

Trigger a reload by signaling the master:

```bash
# inside the container / on the host running haproxy
kill -USR2 $(pidof haproxy)        # master-worker: reload
# systemd:
systemctl reload haproxy
# docker (our lab):
docker compose kill -s HUP haproxy   # the alpine image maps HUP→reload
```

For this to be truly seamless you want a couple of things in `global`:

```haproxy
global
    # keep listening sockets across reloads so new conns aren't refused
    # (default in master-worker mode; expose-fd makes it explicit when using
    #  a shared stats socket)
    stats socket /var/run/haproxy.sock mode 660 level admin expose-fd listeners

    # bound the drain time of the OLD worker after a reload
    hard-stop-after 5m       # old worker force-exits after 5m even if conns linger
```

What happens to **long-lived connections** (websockets, DB tunnels, downloads)?
The old worker keeps serving them until they close or `hard-stop-after` fires.
So a reload can leave old workers around for a while — that's expected. Tune
`hard-stop-after` to your max acceptable connection age.

> **`-sf` vs `-st`.** Under the hood the master uses `-sf` ("soft finish": let
> old workers drain) vs `-st` ("stop now: kill old workers immediately"). The
> master-worker reload uses soft-finish. You rarely call these by hand, but if
> you see them in init scripts, that's the difference between graceful and
> abrupt.

### Validate before you reload — always

A reload with a broken config can fail. Gate it:

```bash
haproxy -c -f /etc/haproxy/haproxy.cfg && systemctl reload haproxy
```

`haproxy -c` parses without running. Wire this into your deploy so a typo never
reaches a reload. (HAProxy will refuse to start on a bad config, but a *running*
process keeps the *old* config if the new worker fails to come up — still,
check first.)

## Preserving state across reloads/restarts

A reload starts a fresh worker — what about **stick tables** (sessions, rate
counters)? Two mechanisms:

- **Within a reload**, the new worker can pull table contents from the old one
  via the `peers` mechanism pointed at itself (the standard "local peer"
  trick), so stickiness and rate-limit counters survive the swap.
- **`peers` across nodes** replicates stick tables between HAProxy instances —
  essential when you run more than one LB (next section), so a client pinned to
  a server, or a rate-limit counter, survives failover to the other node.

```haproxy
peers mypeers
    peer haproxy-a 10.0.0.10:10000
    peer haproxy-b 10.0.0.11:10000

backend be_app
    stick-table type ip size 1m expire 30m peers mypeers   # <- replicated
    stick on src
    server app1 app1:8080 check
    server app2 app2:8080 check
```

Now both LBs share the same stickiness/rate-limit state. The `peers` section
also carries the table contents through local reloads.

## Node-level HA: keepalived / VRRP (on-prem)

One HAProxy is a SPOF. The classic on-prem answer: **two HAProxy nodes + a
floating virtual IP (VIP)** managed by **keepalived** (VRRP). Clients hit the
VIP; whichever node is MASTER owns it; if it dies, the BACKUP takes the VIP over
in ~1–3s.

```
              ┌──────── VIP 10.0.0.100 ────────┐
   clients ───▶  (owned by current MASTER)      │
              └───────┬───────────────┬──────────┘
                      │               │
              ┌───────▼──────┐ ┌──────▼───────┐
              │ haproxy-a    │ │ haproxy-b    │
              │ keepalived   │ │ keepalived   │
              │ MASTER       │ │ BACKUP       │
              └───────┬──────┘ └──────┬───────┘
                      └──────┬────────┘
                       backends (shared)
```

Minimal `keepalived.conf` on node A (B is symmetric with lower priority + state
BACKUP):

```conf
vrrp_script chk_haproxy {
    script "killall -0 haproxy"   # is haproxy alive?
    interval 2
    weight 2
    fall 2
    rise 2
}

vrrp_instance VI_1 {
    state MASTER
    interface eth0
    virtual_router_id 51
    priority 101                  # B uses 100; higher wins
    advert_int 1
    authentication { auth_type PASS; auth_pass changeme }
    virtual_ipaddress { 10.0.0.100/24 }
    track_script { chk_haproxy }  # drop priority if haproxy dies -> failover
}
```

`track_script` ties the VIP to HAProxy's health: if HAProxy dies on the MASTER,
its priority drops, B becomes MASTER and grabs the VIP. Pair with the `peers`
replication above so stick state survives the move.

**Active-active variant:** run two VIPs, each MASTER on a different node, and put
both in DNS (round-robin) — both nodes serve, each backs up the other. Doubles
capacity but needs replicated stick tables to behave under failover.

## Node-level HA in the cloud / Kubernetes

You usually *don't* run keepalived in the cloud:

- **Cloud:** put a cloud **L4 load balancer** (AWS NLB, GCP TCP LB) in front of
  2+ HAProxy instances across AZs. The cloud LB handles node failure; HAProxy
  does the smart L7 work. Use the PROXY protocol (`accept-proxy` on the bind) so
  HAProxy still sees the real client IP through the cloud LB.
  ```haproxy
  frontend fe
      bind :80 accept-proxy        # cloud NLB sends PROXY protocol header
  ```
- **Kubernetes:** HAProxy runs as the Ingress controller (the official
  `haproxy-ingress` or `kubernetes-ingress`), with multiple replicas behind a
  `Service type=LoadBalancer`. Config is generated from Ingress/Gateway objects;
  reloads are the seamless master-worker reloads above. Stick-table peering is
  configured across the replica set.

The principle is constant: **something upstream spreads across ≥2 HAProxy
instances, and the HAProxy instances share stick-table state.**

## A safe reload/deploy runbook

1. `haproxy -c -f new.cfg` — validate.
2. Snapshot runtime state if needed (`show servers state > state.file`) so a
   restart can restore server admin states (`-x`/`load-server-state-from-file`).
3. Reload via master-worker (`systemctl reload` / `USR2`).
4. Confirm the new worker is serving (`show info`, error rate flat in metrics).
5. Watch old workers drain (`ps`, or `show proc`); ensure `hard-stop-after`
   bounds them.

For application **server** changes (deploys), prefer the Runtime API drain dance
from lesson 04 over a config reload — no reload needed at all.

## Lab

Demonstrate a seamless reload under live traffic.

```bash
cd docs/haproxy/lab
# hammer the proxy in the background
( while true; do curl -s -o /dev/null -w '%{http_code}\n' localhost:8080/; done ) > /tmp/codes.txt &
HAMMER=$!

# edit haproxy.cfg (e.g. change balance roundrobin -> leastconn), validate, reload
docker compose exec haproxy haproxy -c -f /usr/local/etc/haproxy/haproxy.cfg
docker compose kill -s HUP haproxy        # seamless reload, NOT restart

sleep 3; kill $HAMMER
# expect: ALL 200s, zero non-200 across the reload
sort /tmp/codes.txt | uniq -c
```

Contrast with a hard `docker compose restart haproxy` while hammering — you'll
typically see a burst of connection failures, proving why the signal-based
reload matters.

Inspect workers across a reload:

```bash
docker compose exec haproxy sh -c "echo 'show proc' | socat - /var/run/haproxy.sock"
```

## Cheat sheet

- Master-worker = **seamless reloads**: new worker on new config, old worker
  drains. Trigger with `USR2` / `systemctl reload` / `kill -s HUP` (lab).
- Always `haproxy -c` before reloading; bound drain with `hard-stop-after`.
- `peers` replicates stick tables across reloads **and** across nodes — needed
  for stickiness/rate-limits to survive failover.
- Node HA: **keepalived/VRRP + floating VIP** on-prem; **cloud L4 LB** or
  **k8s Service + replicas** in the cloud. Use PROXY protocol upstream.
- Deploys = Runtime API drain (lesson 04), not config reloads.

Next: [09 — Exposing databases (TCP mode)](09-databases.md)
