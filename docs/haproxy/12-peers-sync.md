# 12 — Distribution & synchronization (the `peers` protocol)

*Advanced add-on, builds on [08 — HA & reloads](08-ha-reloads.md).*

Once you run **more than one** HAProxy — and in production you always do, because
a single LB is a single point of failure — you hit a new problem: each node has
its **own** in-memory state. Stick tables, rate-limit counters, and stickiness
pins live in RAM, per process. Spread clients across two nodes and:

- a client pinned to `app1` on node A is unknown to node B → stickiness breaks on
  failover;
- a rate limit of "20 req/10s" becomes "20 **per node**" → an attacker just
  doubles their budget by spreading load.

The fix is **state synchronization**: HAProxy's `peers` protocol replicates stick
tables between instances in near-real-time. This lesson does peers hands-on
first, then steps back to how you *distribute* client traffic across those
synchronized nodes.

## The `peers` protocol in one paragraph

Each HAProxy node opens a persistent TCP connection to every other node listed
in a `peers` section. Whenever a stick-table entry changes (a new pin, an
incremented counter), the owning node **pushes** the delta to its peers. It's
push-based and incremental — not polling, not a full-table sync each time — so
overhead is tiny. The same mechanism also carries table contents across a
**local reload** (a node peers with its own previous worker), which is how
counters survive a `USR2`.

```haproxy
peers mypeers
    peer haproxy-a haproxy-a:10000      # name : reachable address
    peer haproxy-b haproxy-b:10000

    # Tables can be declared INSIDE the section → shared as mypeers/<name>.
    table requests type ip size 100k expire 60s store http_req_rate(10s)
    table sticky   type ip size 100k expire 30m
```

Two things that trip everyone up:

1. **Local-peer identity.** A node decides *which peer is itself* by matching its
   **system hostname** against the peer names. If the hostname is `haproxy-a`,
   the `peer haproxy-a …` line is local and HAProxy *binds* that address; the
   others are remote and it *connects* to them. If your hostnames don't match,
   set it explicitly with `-L <name>` on the command line or `localpeer <name>`
   in `global`. **A single config file works on every node** — only the hostname
   differs. (We exploit exactly this in the lab.)
2. **Same table definition on every node.** Type, size, and `store` counters must
   match across peers, or the entries won't replicate cleanly. Declaring the
   tables inside the shared `peers` section guarantees that by construction.

### Declaring tables: in `peers` vs in a backend

Both work; they attach to the same peers section:

```haproxy
# (A) inside the peers section — explicit, reusable from anywhere by name
peers mypeers
    table sticky type ip size 100k expire 30m
backend be_app
    stick on src table mypeers/sticky

# (B) on the backend, just add `peers <name>` to replicate its implicit table
backend be_app
    stick-table type ip size 100k expire 30m peers mypeers
    stick on src
```

Use (A) when several frontends/backends share a table or when a table is pure
rate-limiting (no backend of its own). Use (B) for a quick "make this backend's
stickiness HA" with one keyword.

## What replicates — and what doesn't

| Replicated via `peers` | NOT replicated (per-node, local) |
|---|---|
| Stick-table entries: pins, counters, tracked data | Live TCP/HTTP connections (a node dies → its in-flight conns drop) |
| `http_req_rate`, `conn_rate`, `gpc`/`gpt` counters in tables | Server health-check results (each node checks independently) |
| Stickiness keys (`stick on …`) | Runtime `set server … state` admin changes (per node) |
| Survives across **local reloads** too | The TLS session cache (use `tune.ssl.*` / tickets instead) |

So `peers` synchronizes **table state**, not connections or operational state.
Plan failover around that: a dead node's open connections are lost (clients
retry → land on a surviving node → their **pin and counters are already there**).

## Lab — watch state synchronize across two nodes

This lab runs **two** HAProxy nodes (the base lab has one), so it has its own
compose file.

```bash
cd docs/haproxy/lab/peers
docker compose -f docker-compose.peers.yml up -d --build
# node A → http://localhost:8090   node B → http://localhost:8092
```

Both nodes mount the **same** [`haproxy-peers.cfg`](lab/peers/haproxy-peers.cfg);
only their hostnames differ (`haproxy-a` / `haproxy-b`), which is how each picks
its local peer.

### 1. Confirm the peers are connected

```bash
docker compose -f docker-compose.peers.yml exec -T haproxy-a \
  sh -c "echo 'show peers' | socat - /var/run/haproxy.sock"
```

You want to see peer `haproxy-b` with a `state=ESTA` (established) connection and
the two tables (`requests`, `sticky`) listed. Run it against `haproxy-b` too —
the picture is symmetric.

### 2. Stickiness pin made on A is known to B

```bash
# Hit node A; note which app you're pinned to.
curl -s localhost:8090/ | jq -c .app          # e.g. "app1"

# Dump A's sticky table — your IP → a server id is now stored.
docker compose -f docker-compose.peers.yml exec -T haproxy-a \
  sh -c "echo 'show table mypeers/sticky' | socat - /var/run/haproxy.sock"

# Now dump B's table WITHOUT ever having hit B. The same entry is there.
docker compose -f docker-compose.peers.yml exec -T haproxy-b \
  sh -c "echo 'show table mypeers/sticky' | socat - /var/run/haproxy.sock"
```

The pin replicated from A to B with no traffic to B. If A now dies and your
client retries against B, it lands on the **same** backend — stickiness survived
the failover.

### 3. The rate limit is shared, not per-node

The config denies once a client exceeds **20 req / 10s** — counted in the
*replicated* `requests` table. Prove the budget spans both nodes:

```bash
# 11 requests to A, then 11 to B. Neither node alone exceeds 20...
for i in $(seq 1 11); do curl -s -o /dev/null -w '%{http_code} ' localhost:8090/; done; echo
for i in $(seq 1 11); do curl -s -o /dev/null -w '%{http_code} ' localhost:8092/; done; echo
# ...but the SHARED counter crosses 20 partway through the second burst:
# expect 200s flipping to 429 once the combined rate > 20.
```

Watch the shared counter directly:

```bash
docker compose -f docker-compose.peers.yml exec -T haproxy-b \
  sh -c "echo 'show table mypeers/requests' | socat - /var/run/haproxy.sock"
# http_req_rate reflects requests sent to BOTH nodes, not just B.
```

Without `peers`, each node would track its own ~11 and never trip the limit —
the classic "rate limiting is useless behind >1 LB unless state is shared" trap.

### 4. Kill a node, watch state survive

```bash
docker compose -f docker-compose.peers.yml stop haproxy-a
curl -s localhost:8092/ | jq -c .app    # still pinned to your original server
# bring it back; it re-syncs current tables from B on reconnect
docker compose -f docker-compose.peers.yml start haproxy-a
```

A returning node **pulls** current table state from its peers on reconnect, so a
rebooted/redeployed LB doesn't come back with cold counters.

## Stepping back: distributing traffic across the synchronized nodes

`peers` keeps state consistent; something still has to spread *clients* across
the nodes. The options (covered structurally in [lesson 08](08-ha-reloads.md)),
now with the sync angle made explicit:

- **Floating VIP (keepalived/VRRP), active-passive.** One node owns the VIP; the
  other is warm standby. `peers` means the standby already has every pin and
  counter, so takeover (~1–3s) is seamless *and* stateful. Simplest correct
  on-prem pattern.
- **Active-active (two VIPs in DNS round-robin, or an upstream L4 LB).** Both
  nodes serve simultaneously → **you now depend on `peers`**, because every
  client can hit either node on any request. This is the configuration where
  unsynchronized rate limits and stickiness silently break; the lab above is
  exactly this shape.
- **Cloud L4 LB (NLB/TCP LB) → N HAProxy instances.** The cloud LB distributes;
  HAProxy does L7 + shared state. Mesh all instances in one `peers` section.
- **Kubernetes (HAProxy ingress, multiple replicas).** The `Service` distributes
  across replicas; configure peering across the replica set so the same
  guarantees hold. (At large replica counts, full-mesh peering gets noisy —
  that's when teams move hot counters to an external store like Redis instead.)

> **Rule of thumb.** The moment a client can be served by more than one HAProxy
> on a per-request basis (active-active, cloud LB, k8s replicas), any
> stick-table feature you rely on — stickiness, rate limits, abuse counters from
> [lesson 10](10-security.md) — **must** be on `peers`, or it's quietly wrong.

### Scaling and failure notes

- **Full mesh.** Every node lists every other node. Fine for 2–5 LBs; beyond
  ~a dozen the N² connections and update fan-out get heavy → consider a smaller
  set of "aggregator" peers or an external counter store.
- **Split brain is benign-ish.** If peers can't reach each other, each keeps
  counting locally and re-converges (last-writer-wins per key) when the link
  heals. Rate limits may be briefly under-enforced during a partition; pins may
  briefly diverge. Size limits with that slack in mind.
- **Secure the channel.** The peers protocol is plaintext by default. Across
  untrusted networks, bind peers on a private interface or wrap with
  `bind … ssl` on the peer listener (peers support TLS). Don't expose `:10000`
  publicly.
- **Versions.** Keep peers on compatible HAProxy versions; the protocol is
  stable across modern 2.x/3.x but mixing very distant majors during an upgrade
  can hiccup — drain and roll, don't run a split fleet long-term.

## Cheat sheet

- `peers <name>` + `peer <node> <addr:port>` → push-based stick-table
  replication between HAProxy instances.
- **Local peer = matching hostname** (or `-L` / `localpeer`); ship **one** config
  to all nodes.
- Declare tables **inside** the `peers` section to guarantee identical defs;
  reference as `mypeers/<table>`. Or add `peers <name>` to a backend
  `stick-table` for the quick path.
- Replicates **table state** (pins, counters) and survives **local reloads** —
  **not** live connections, health results, or TLS session cache.
- **Active-active / cloud LB / k8s replicas ⇒ peers is mandatory**, or
  stickiness and rate limits are per-node and wrong.
- Watch it live: `show peers`, `show table mypeers/<name>`. Secure the
  `:10000` channel; full-mesh only scales to a handful of nodes.

— End of advanced add-on. Back to the [index](README.md).
