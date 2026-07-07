# 07 — Sharding & replication

Lesson 01 said a shard *is* a Lucene index and the unit of distribution, and that
search scatters to one copy of each shard. Now we make that concrete: you'll
create an index with an explicit shard layout, watch Elasticsearch place primaries
and replicas across `es01`/`es02`/`es03`, drive the cluster from green to yellow
and back by killing a node, and learn why the single most common production mistake
is having too many shards, not too few.

## Primaries vs replicas: two different jobs

An index is split into **primary shards** at creation. Primaries divide your data
horizontally — they give you **write throughput** and **capacity** (each primary
lands on a node and indexes independently). **Replica shards** are exact copies of
a primary on *another* node. They give you **high availability** (a node dies, a
replica takes over) and **read throughput** (searches can hit either copy).

The knobs behave very differently, and the asymmetry is the whole lesson:

| Setting | Changeable after creation? | What it buys | Cost |
|---|---|---|---|
| `number_of_shards` (primaries) | **No — fixed at creation** | Write scaling, total capacity | Each shard is a live Lucene index → heap + file handles |
| `number_of_replicas` | **Yes — dynamic** (`PUT /idx/_settings`) | HA, read throughput | 1 replica ≈ doubles disk + indexing work |

Why are primaries immutable? Routing. Every document is assigned to a primary by
hashing its routing value:

```
shard = hash(_routing) % number_of_primaries
```

By default `_routing` is the document `_id`. Change `number_of_primaries` and every
document would hash to a *different* shard — the whole index would have to be
rebuilt to stay findable. So Elasticsearch freezes it. To change the primary count
you reindex (or use `_split`/`_shrink`, below).

## Create an index and watch placement

Run this in Dev Tools — a 3-primary, 1-replica index (6 shards total):

```
PUT /orders
{
  "settings": { "number_of_shards": 3, "number_of_replicas": 1 }
}

GET /_cat/shards/orders?v&s=shard,prirep
```

```
index  shard prirep state   node
orders 0     p      STARTED es01
orders 0     r      STARTED es02
orders 1     p      STARTED es02
orders 1     r      STARTED es03
orders 2     p      STARTED es03
orders 2     r      STARTED es01
```

Six shards, evenly balanced, and — the invariant from lesson 01 — **a primary and
its replica are never on the same node**. Drawn out:

```
   node es01        node es02        node es03
  ┌─────────┐      ┌─────────┐      ┌─────────┐
  │ P0   R2 │      │ P1   R0 │      │ P2   R1 │     P = primary
  └─────────┘      └─────────┘      └─────────┘     R = replica
     each primary's replica lives on a DIFFERENT node
```

`GET /_cluster/health/orders` reports `green`: every primary and every replica is
assigned.

## Driving green → yellow → red on purpose

Health colour is not vibes — it's a precise statement about shard assignment.

**Yellow by asking for a replica you can't place.** With 3 nodes, ask for 3
replicas per shard. A shard's copies can't share a node, so the 3rd replica has
nowhere legal to go:

```
PUT /orders/_settings
{ "number_of_replicas": 3 }

GET /_cat/shards/orders?v&s=state
#  >>> three shards now show state=UNASSIGNED
GET /_cluster/health/orders          # status: yellow
```

**Yellow** = all primaries assigned (no data lost, fully queryable) but at least one
replica is unassigned. Dial it back:

```
PUT /orders/_settings
{ "number_of_replicas": 1 }         # back to green
```

**Yellow by losing a node** — this is the HA story. Stop a node in the shell:

```bash
docker compose stop es03
```

```
GET /_cat/nodes?v                    # only es01, es02 remain
GET /_cat/shards/orders?v&s=shard,prirep
```

Watch what happens: any primary that lived on `es03` (P2) is gone, so its **replica
on another node is instantly promoted to primary** — no data lost, no `red`. The
cluster is `yellow` because it now can't place the replicas that used to live on
`es03`. Bring the node back:

```bash
docker compose start es03
```

Within seconds `es03` rejoins, the cluster **recovers** the missing replicas onto
it, and health returns to `green`. Nothing you did as a client failed.

**Red** is the one to fear: a primary *and all its replicas* are unavailable, so
part of the index is missing. On a 3-node cluster with 1 replica you'd need to lose
two nodes at once. Red means reads/writes for that shard fail — you're in
data-availability trouble, not just redundancy trouble.

> **Rule of thumb.** `green` = all copies assigned; `yellow` = a replica is missing
> (degraded, not down); `red` = a primary is missing (data unavailable). Alert on
> `red` immediately; treat sustained `yellow` as a capacity or config bug.

## Routing: co-location and hotspots

Because `shard = hash(_routing) % number_of_primaries`, documents scatter evenly by
`_id` for free. You can override `_routing` to force related documents onto the
**same shard** — e.g. route every order by `customer_id`:

```
PUT /orders/_doc/1001?routing=cust-42
{ "customer_id": "cust-42", "total": 89.9 }

GET /orders/_search?routing=cust-42      # queries ONE shard, not all three
{ "query": { "term": { "customer_id": "cust-42" } } }
```

Now a per-customer query hits a single shard instead of scatter-gathering across
all primaries — a big latency win at high shard counts.

- **The risk is hotspots.** If one routing key is far larger than the rest (a
  whale customer, a dominant tenant), that shard grows and gets hammered while the
  others idle. Custom routing trades even distribution for locality — only reach for
  it when your access pattern is genuinely partitioned and reasonably uniform.
- **You must supply the same `routing` on read.** Forget it and the search fans out
  to every shard anyway, silently losing the benefit.

## Shard sizing and the over-sharding trap

Each shard is a full Lucene index: it consumes heap (for segment metadata, field
data structures, the cluster state entry), file descriptors, and per-shard
overhead on every request. That cost is **per shard, independent of how much data it
holds** — which is exactly why tiny shards are so wasteful.

- **Over-sharding is the #1 mistake.** Thousands of near-empty shards (the classic
  `number_of_shards: 5` on a daily index that holds 2 MB) burn heap on the master
  and every data node, bloat the cluster state, and slow *everything* — recovery,
  search planning, allocation. Undersizing hurts too, but far less often.
- **Target ~10–50 GB per shard** for search-heavy workloads. Below that you're
  paying overhead for nothing; well above it, recovery and merges get sluggish.
- **Keep shard count proportional to heap.** A widely-used ceiling is **fewer than
  ~20 shards per GB of JVM heap** per node. A node with 30 GB heap should stay well
  under ~600 shards. Blow past it and you feel it as slow cluster-state updates.

| Symptom | Likely cause | Fix |
|---|---|---|
| Thousands of tiny shards, high heap | Over-sharding time-series | Fewer primaries + rollover/data streams (lesson 10) |
| One shard huge & hot | Skewed custom routing | Rethink routing key or drop custom routing |
| Shard > ~50 GB, slow recovery | Too few primaries for the data | `_split` into more shards, or reindex |

### Right-sizing tools

- **Time-series data**: don't guess a primary count for a year of logs. Use
  **rollover / data streams** (lesson 10) so a new backing index is created when the
  current one hits a size/age threshold — shard size stays bounded automatically.
- **Resize APIs** (brief): `_shrink` reduces primary count (into a factor of the
  original), `_split` multiplies it, `_clone` copies an index as-is. All produce a
  *new* index — they exist precisely because `number_of_shards` is immutable.

## Allocation: who decides where shards live

The cluster continuously **balances** shards across data nodes. The hard rule you've
already seen — a primary and its replica never co-locate — is enforced by the
allocator. When a shard won't assign, ask why:

```
GET /_cluster/allocation/explain
{ "index": "orders", "shard": 0, "primary": false }
```

It tells you plainly, e.g. `a copy of this shard is already allocated to this node`
(the same-shard rule) or `the node is above the disk high watermark`. This is your
first stop for any stuck `yellow`/`red`.

Two levers you'll meet properly in lesson 09: **allocation awareness** spreads
copies across failure domains (racks, zones) so one zone dying can't take a whole
shard; `index.routing.allocation.total_shards_per_node` caps how many shards of one
index land on a node, to stop a single hot index from piling onto one machine.

## Reads: which copy answers

A search touches **one copy of each shard** (lesson 01's scatter-gather). The
coordinating node picks primary *or* replica per shard using **adaptive replica
selection** — it routes to whichever copy is responding fastest (queue depth,
recent latency), not blind round-robin. That's why adding replicas raises read
throughput: more copies means more nodes that can serve the same shard in parallel.

## Cheat sheet

- **Primaries** split data (write scaling, capacity) and are **fixed at creation**;
  **replicas** are copies (HA, read throughput) and are **dynamic** via
  `PUT /idx/_settings`.
- `shard = hash(_routing) % number_of_primaries` — hashing on `_id` scatters evenly;
  it's why primary count is immutable.
- **green** = all copies assigned; **yellow** = replica missing (degraded); **red** =
  primary missing (data unavailable).
- Lose a node → a replica is **promoted to primary** automatically; the node's return
  triggers **recovery** back to green.
- **Custom routing** co-locates related docs on one shard (faster targeted queries)
  but risks **hotspots**; pass the same `routing` on read.
- Target **~10–50 GB/shard**, **<~20 shards/GB heap**; **over-sharding** is the #1
  mistake. Use rollover/data streams for time-series; `_shrink`/`_split`/`_clone` to
  resize.
- Debug a stuck shard with `_cluster/allocation/explain`.

## Lab

Reuse the running 3-node cluster.

1. Create `orders` with `3` primaries and `1` replica; run
   `GET /_cat/shards/orders?v&s=shard,prirep` and confirm no primary/replica pair
   shares a node.
2. `PUT /orders/_settings {"number_of_replicas": 3}` → confirm `status: yellow` and
   three `UNASSIGNED` shards. Explain why with
   `GET /_cluster/allocation/explain`. Reset to `1`.
3. `docker compose stop es03`. Re-run `_cat/nodes` and `_cat/shards/orders` — spot a
   **replica promoted to primary** on a surviving node, and note the cluster is
   `yellow`, never `red`.
4. `docker compose start es03`, watch `_cluster/health/orders` return to `green` as
   replicas recover onto the returned node.
5. Index two docs with `?routing=cust-42`, then search with and without the
   `routing` param — compare `_shards.total` in the response (one shard vs three).

Next: [08 — Indexing performance](08-indexing-performance.md)
