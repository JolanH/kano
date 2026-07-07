# 09 — Cluster operations & scaling

Lesson 01 gave you a five-line node-roles table and a promise to go deeper. This
is where that debt comes due. Everything that keeps a cluster *up* — who is
allowed to be the master, how a lost master is replaced without corrupting
state, where each shard is allowed to land, and how much of the machine the JVM
is allowed to eat — lives here. Get these wrong and no amount of query tuning
saves you: the cluster goes red, or read-only, or split-brains, and you learn
these words the hard way at 3 a.m. The lab is three co-located nodes, so we'll
run what we can and reason carefully about what a laptop can't show.

## Node roles, in depth

A node's `node.roles` list decides what work it accepts. Your lab nodes take the
default — master-eligible + data + ingest + everything — because that's the
right call for three machines. At scale you *split* roles so a spike in one kind
of work can't starve another.

| Role | Job | Split it out when |
|---|---|---|
| `master` | Owns the **cluster state**: shard locations, mappings, settings, templates | You have enough data nodes that a GC pause or hot query on a data node could stall the master |
| `data` | Holds shards, runs queries & aggregations | Always — these are the workhorses you scale for capacity |
| `data_hot` | Newest, most-queried, most-written data on fast SSD/NVMe | You run time-series (logs, metrics, traces) |
| `data_warm` | Older, read-mostly, no longer indexed | Data ages out of hot but is still queried often |
| `data_cold` | Rarely queried, cost-optimised, often single-replica | Retention is long and queries are infrequent |
| `data_frozen` | Searchable snapshots backed by object storage | You need months/years online but can tolerate slow first-hit latency |
| `ingest` | Runs ingest pipelines (enrich/transform before write) | Heavy pipelines compete with search on data nodes |
| `remote_cluster_client` | Cross-cluster search/replication client | You do CCS/CCR (lesson 12) |
| `ml` | Machine-learning jobs | ML workloads would otherwise share heap with search |
| `transform` | Runs continuous/batch transforms | Same isolation argument as `ml` |

A **coordinating-only** node has *no* roles at all — you set `node.roles: []`.
It still receives requests, scatters to shards, and gathers/merges results, so
it acts as a smart load-balancer that offloads the gather/merge phase (and its
heap cost, especially for large aggregations) from data and master nodes.

Setting roles is explicit in `elasticsearch.yml` (or the env vars our compose
file uses):

```yaml
# a dedicated master
node.roles: [ master ]
# a hot data node that also runs pipelines
node.roles: [ data_hot, data_content, ingest ]
# a pure coordinator
node.roles: [ ]
```

**Dedicated masters at scale.** The active master serialises every cluster-state
change. If it's also serving a heavy aggregation and pauses for GC, shard
allocation and mapping updates stall cluster-wide. Past roughly 5–10 data nodes,
give the master job to three small, dedicated master-eligible nodes that do
nothing else. They need little heap and little disk — but they need to be
*stable*.

## Master election & quorum

One node is the elected **master**; the others that *could* be elected are
**master-eligible**. The master owns the authoritative cluster state and
publishes updates to the rest. Elasticsearch keeps a **voting configuration** —
the set of master-eligible nodes whose votes count — and a decision needs a
strict majority of it: `(N/2)+1`.

That formula is why you run an **odd** number of master-eligible nodes.

```
 3 master-eligible → quorum = 2 → survives losing 1
 5 master-eligible → quorum = 3 → survives losing 2
 4 master-eligible → quorum = 3 → still only survives losing 1  (no gain, more risk)
```

Three is the standard; five for large or very-high-availability clusters. Even
counts buy nothing: 4 tolerates the same single failure as 3 while adding a node
that could partition badly.

**Split-brain** is what quorum prevents. Picture a network partition splitting a
6-eligible cluster 3/3: if each side could elect its own master, both accept
writes and the state diverges irreconcilably. Requiring a strict majority means
at most one side can ever reach quorum; the minority side blocks and refuses to
elect. Old Elasticsearch made you hand-tune `minimum_master_nodes` (and people
got it wrong); modern ES manages the voting configuration automatically as nodes
join and leave — you just provide an odd count.

```
   ┌─── partition ───┐
  es01  es02   │   es03
   (2 votes)   │   (1 vote)
   quorum=2 OK  │   quorum not met -> no master elected here
   keeps master │   blocks writes until it rejoins
```

**When the master is lost.** The remaining eligible nodes detect the loss and
run an election; whoever gets a quorum of votes becomes master. During that
window (usually seconds) the cluster **blocks cluster-state changes** — you
can't create indices, update mappings, or reallocate shards — but existing
shards keep serving reads and writes. Data isn't lost; the *control plane*
pauses until a new master commits.

- **`cluster.initial_master_nodes` is bootstrap-only.** Our compose sets it to
  `es01,es02,es03`. It seeds the very first voting configuration on a
  brand-new cluster and **must be removed after the cluster forms**. Leaving it
  (or worse, changing it on a running cluster) risks forming a *separate*
  cluster on restart. It is not a discovery setting.

## Discovery

Before an election there must be *contact*. `discovery.seed_hosts` is the list
of addresses a starting node probes to find master-eligible peers — our nodes
use `discovery.seed_hosts=es01,es02,es03` (Docker DNS names on the shared
network). A node contacts the seeds, learns the current master-eligible set,
and joins. Seeds only need to *include* master-eligible nodes; they don't have
to be exhaustive. Keep this distinct from `initial_master_nodes`: seed hosts is
"who do I phone to find the cluster" (always), initial master nodes is "who
votes in the first-ever election" (once).

## Data tiers: hot-warm-cold-frozen

Time-series data has a predictable lifecycle: today's index is written and
queried constantly; last month's is read occasionally; last year's is almost
never touched but must stay online. Serving all of it from identical expensive
SSD nodes is waste. **Tiers** let you match hardware cost to access pattern and
migrate indices down as they age (automated by ILM, lesson 10).

```
 age →   0d ───────── 7d ───────── 30d ───────── 90d ──────────▶
 tier   HOT          WARM          COLD          FROZEN
 media  NVMe         SSD/HDD       HDD           object store (S3/GCS)
 replicas 1          1             0–1           snapshot (no live replica)
```

Routing is a per-index setting; ILM flips it as the index ages:

```
PUT /logs-2026.07/_settings
{ "index.routing.allocation.include._tier_preference": "data_warm,data_hot" }
```

`_tier_preference` is a fallback list: place on `data_warm` if such nodes exist,
else fall back to `data_hot`. The **frozen** tier is special — indices there are
**searchable snapshots** stored in object storage and cached locally on demand,
so a frozen node holds a fraction of the data it can search (cross-reference
lesson 10). You trade first-hit latency for near-unlimited, cheap retention.

| | hot | warm | cold | frozen |
|---|---|---|---|---|
| Hardware | fast NVMe, lots of RAM | SSD/HDD | dense HDD | compute + object store |
| Cost/GB | highest | medium | low | lowest |
| Query latency | lowest | low | moderate | highest (cache miss = fetch) |
| Written to? | yes | no | no | no |
| Typical replicas | 1+ | 1 | 0–1 | 0 (snapshot-backed) |

## Shard allocation control

The master decides where shards live, but you constrain it.

**Allocation awareness** spreads copies across failure domains. Tag each node
with an attribute, then tell the cluster to treat it as a boundary — it won't
put a primary and its replica in the same zone:

```yaml
node.attr.zone: zone-a                                  # per node
cluster.routing.allocation.awareness.attributes: zone   # cluster-wide
```

**Allocation filtering** pins or excludes shards by attribute — the mechanism
behind draining a node before maintenance:

```
PUT /_cluster/settings
{ "persistent": { "cluster.routing.allocation.exclude._name": "es03" } }
```

`include` / `require` / `exclude` work per index too (`index.routing.allocation.*`).
`index.routing.allocation.total_shards_per_node` caps how many shards of one
index a single node may hold — the guard against one hot index piling onto one
node.

**Debugging unassigned shards.** When health is yellow or red, don't guess — ask:

```
GET /_cluster/allocation/explain
{ "index": "logs-2026.07", "shard": 0, "primary": true }
```

It tells you *why* a shard won't allocate: no node satisfies the filter, disk
watermark exceeded, awareness would be violated, etc.

**Disk-based watermarks** protect nodes from filling up, and the last one bites
hard:

| Watermark | Default | Effect |
|---|---|---|
| low | 85% | Stop allocating *new* shards to this node |
| high | 90% | Actively relocate shards *away* |
| flood-stage | 95% | Set every index with a shard here to `read_only_allow_delete` |

- **Flood-stage is the one that pages you.** At 95% disk, indices flip
  **read-only** and writes start failing. Freeing disk doesn't auto-clear the
  block — you must reset `index.blocks.read_only_allow_delete: null` yourself
  after making room.

## JVM heap sizing — the tuning rule everyone must know

Two numbers govern heap, and violating either quietly wrecks performance.

**Heap ≤ 50% of RAM.** Lucene stores the inverted index and doc values in files
and leans on the **OS filesystem cache** for fast reads. That cache is just
*free RAM*. Give the JVM heap more than half and you starve the page cache that
actually makes search fast. The other half is not wasted — it *is* the cache.

**Stay under ~32 GB.** Below roughly 32 GB the JVM uses **compressed ordinary
object pointers** (compressed oops): 32-bit references into a larger heap, which
saves memory and improves cache behaviour. Cross that threshold and pointers
become 64-bit — a 33 GB heap can hold *less usable data* than a 30 GB heap. So a
128 GB machine wants ~30 GB heap and ~98 GB left for the filesystem cache, not a
64 GB heap.

**Set `-Xms == -Xmx`.** Pin min and max equal so the heap never resizes at
runtime (resizing triggers expensive full GCs). Our lab does exactly this via
`.env`:

```bash
ES_HEAP=1g            # -> ES_JAVA_OPTS=-Xms1g -Xmx1g
ES_MEM_LIMIT=2147483648   # 2 GB container: heap is 50% of the limit
```

> **Rule of thumb.** Heap = min(50% of RAM, ~30 GB), and `-Xms` = `-Xmx`. More
> heap is not more speed — past those limits it's *less*.

**What pressures heap.** Aggregations and sorting build **field data** in memory;
large `terms` aggs and `fielddata` on `text` fields are the classic OOM.
**Circuit breakers** (`GET /_nodes/stats/breaker`) trip a request before it can
take the node down — a tripped breaker is a symptom, not the disease. Watch heap
with `GET /_nodes/stats/jvm` and keep steady-state well below 75%.

## Ops you'll actually run

**Rolling restart** — upgrade or reconfigure one node at a time without a shard
reshuffle storm. Disable replica allocation first so the cluster doesn't try to
rebuild shards from a node you're about to bring right back:

```
PUT /_cluster/settings
{ "persistent": { "cluster.routing.allocation.enable": "primaries" } }
# ... restart the node, wait for it to rejoin ...
PUT /_cluster/settings
{ "persistent": { "cluster.routing.allocation.enable": "all" } }
```

**`_cluster/settings` — persistent vs transient.** `persistent` survives a full
restart; `transient` does not. **Transient settings are deprecated in 9.x** —
prefer `persistent` (and put anything permanent in `elasticsearch.yml`). Chasing
a setting that "reverted itself" almost always means someone set it transient.

**Reading the cluster under load.** `GET /_cat/thread_pool?v` shows queue and
rejected counts per pool — a rising `write` or `search` reject count means you're
saturated. When a node is pegged, `GET /_nodes/hot_threads` dumps what its
threads are actually doing, which usually names the offending query or merge.

## Cheat sheet

- **Roles** via `node.roles`. Split master/data at scale; `node.roles: []` = pure
  coordinator. Data sub-tiers: `data_hot`/`warm`/`cold`/`frozen`.
- **Quorum = `(N/2)+1`.** Run an **odd** number of master-eligible nodes (3, or 5).
  Majority voting prevents **split-brain**. Losing the master pauses state changes,
  not data.
- `cluster.initial_master_nodes` = **bootstrap only, remove after**;
  `discovery.seed_hosts` = how nodes find each other (always).
- **Tiers** match cost to access pattern; route with
  `index.routing.allocation.include._tier_preference`. Frozen = searchable
  snapshots.
- **Allocation:** awareness (`awareness.attributes`) for zones,
  `total_shards_per_node` caps, include/exclude/require filters, and
  `_cluster/allocation/explain` to debug unassigned shards.
- **Watermarks** 85 / 90 / 95%; **flood-stage flips indices read-only** and won't
  auto-clear.
- **Heap ≤ 50% RAM and < ~32 GB (compressed oops); `-Xms == -Xmx`.** The other
  half of RAM is Lucene's filesystem cache.
- Rolling restart: set `allocation.enable: primaries`, restart, set back to `all`.
  Prefer **persistent** settings (transient is deprecated).

## Lab

The lab is three co-located nodes, so it can't show a real tier split — but it
shows the control plane clearly.

1. See every role each node carries and who holds the master:

   ```
   GET /_cat/nodes?v&h=name,node.role,master,heap.percent,disk.used_percent
   ```

   `node.role` is a compact letter string (`m`=master-eligible, `d`=data,
   `i`=ingest, …). Confirm all three are `dim...` and exactly one has `*`.

2. Watch a real re-election. Find the master, stop it, watch the survivors pick
   a new one:

   ```bash
   docker compose stop es01        # if es01 was the master
   ```
   ```
   GET /_cat/nodes?v&h=name,master        # a different node now shows '*'
   ```

   Bring it back with `docker compose start es01` and confirm it rejoins as a
   plain member.

3. Drain a node with allocation filtering, then watch shards leave it (seed
   `products` first if needed):

   ```
   PUT /_cluster/settings
   { "persistent": { "cluster.routing.allocation.exclude._name": "es03" } }
   GET /_cat/shards/products?v&h=index,shard,prirep,node
   ```

   No shard should sit on `es03`. Clear it:
   `PUT /_cluster/settings {"persistent":{"cluster.routing.allocation.exclude._name": null}}`.

4. Confirm the heap rule holds in the lab: `GET /_nodes/stats/jvm` and check
   `heap_max_in_bytes` ≈ 1 GB — half of the 2 GB `ES_MEM_LIMIT` from `.env`.

Next: [10 — Lifecycle & data streams](10-lifecycle-data-streams.md)
