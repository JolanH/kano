# 01 — Architecture & mental model

Before any queries, build the right mental model. Most Elasticsearch confusion —
"why is my search slow", "why did my cluster go yellow", "why doesn't `term`
match" — dissolves once you know *where* in the hierarchy each concept lives and
what actually happens on disk.

## The nesting doll: cluster → node → index → shard → segment

```
cluster  ── one or more nodes sharing a cluster.name
  node   ── one Elasticsearch process (one JVM)
  index  ── a logical collection of documents (like a "table")
   shard ── a self-contained Lucene index; the unit of scale & distribution
    segment ── immutable Lucene files; a shard is many segments + a translog
     document ── one JSON object, the unit you index and get back
```

The two ideas that matter most:

- **A shard *is* a Lucene index.** Elasticsearch is a distributed coordination
  layer over Apache Lucene. Every search ultimately runs against Lucene segments
  inside shards. When people say "Elasticsearch is near-real-time", that's
  Lucene: newly indexed documents aren't searchable until a **refresh** flushes
  the in-memory buffer into a new segment (default every 1s).
- **A shard is the unit of distribution.** An index is split into **primary
  shards** at creation; each primary can have **replica shards** (copies on
  other nodes). Elasticsearch scatters shards across nodes for you. This is how
  one index spans many machines and survives a node dying.

```
index "products"  (3 primaries, 1 replica each = 6 shards total)

   node es01        node es02        node es03
  ┌─────────┐      ┌─────────┐      ┌─────────┐
  │  P0  R2 │      │  P1  R0 │      │  P2  R1 │      P = primary
  └─────────┘      └─────────┘      └─────────┘      R = replica
   a primary and its replica NEVER sit on the same node (that would defeat HA)
```

## Documents and the inverted index

You index **documents** — JSON objects. To make text searchable fast,
Elasticsearch (via Lucene) builds an **inverted index**: instead of "document →
its words", it stores "word → the documents containing it".

```
docs:  1: "ergonomic mesh chair"    2: "mesh desk"    3: "ergonomic desk"

inverted index (term → postings):
   chair     → [1]
   desk      → [2, 3]
   ergonomic → [1, 3]
   mesh      → [1, 2]
```

Searching for `ergonomic` is now a dictionary lookup, not a scan of every
document — the same reason a book index beats reading cover to cover. This is
why full-text search is fast, and it's also why **how text is broken into terms
(analysis, lesson 03) determines what you can find.**

Alongside the inverted index, Lucene keeps **doc values** — a columnar,
per-field store used for sorting, aggregating, and scripting (lesson 06/08).
Inverted index answers "which docs have this term"; doc values answer "what's
the value of this field for these docs".

## Segments are immutable (why deletes are lazy)

Lucene segments are **write-once**. Consequences that surface everywhere later:

- **Updates aren't in-place.** Updating a document re-indexes the whole document
  as a new version and marks the old one deleted. There's no partial on-disk
  edit.
- **Deletes are soft.** A delete just tombstones the doc; the bytes are
  reclaimed later when segments **merge** (small segments combine into bigger
  ones in the background).
- **More segments = slower search**, because a query fans out across all of
  them. Merging keeps the count down; `force_merge` (lesson 11) forces it for
  read-only indices.

## Node roles

Every node in the lab is master-eligible + data + ingest, but in real clusters
you separate concerns:

| Role | Job | Notes |
|---|---|---|
| **master-eligible** | Cluster state: which shards live where, mappings, settings | Elect one active master; keep an **odd** number (3) to avoid split-brain |
| **data** | Hold shards, run queries & aggregations | The workhorses; scale these for capacity. Sub-tiers: `data_hot`/`warm`/`cold`/`frozen` (lesson 09/10) |
| **ingest** | Run ingest pipelines (transform docs before indexing) | Cheap to co-locate |
| **coordinating** | Receive a request, scatter to shards, gather & merge results | Every node can do this; dedicated coordinating nodes offload the gather/merge |
| **ml** | Machine-learning jobs | Optional |

## How a search request flows

```
        ┌─ QUERY phase ─────────────────────────────────────┐
client ─▶ coordinating node ─▶ scatter to one copy of EACH shard
        │                       each shard finds top-N doc IDs + scores
        │◀────────────────────  results gathered & merged into a global top-N
        └─ FETCH phase ─────────────────────────────────────┘
          coordinating node ─▶ fetch the actual _source for the final N docs
        ◀─ returns hits to the client
```

Two things to internalise:

- **Scatter-gather.** A search touches **one copy of every shard** (primary or
  replica — the coordinator load-balances). More shards = more parallelism, but
  also more gather/merge overhead. This is the tension behind shard sizing
  (lesson 07).
- **Two phases.** Query phase finds *which* documents (IDs + scores) across
  shards; fetch phase pulls the *content* of just the final page. That's why
  `from: 10000, size: 10` is expensive — every shard must return 10,010 sorted
  hits to the coordinator just to discard most of them (deep-pagination problem,
  lesson 04/12).

## Cheat sheet

- **Shard = a Lucene index = the unit of scale.** Primaries split data; replicas
  copy it for HA and read throughput.
- **Inverted index** (term → docs) powers search; **doc values** (columnar)
  power sort/aggregate.
- **Segments are immutable**: updates re-index, deletes tombstone, merges
  reclaim. Refresh (~1s) makes new docs visible — hence "near-real-time".
- Keep **3 master-eligible nodes** (odd, for quorum). Separate data/master
  roles as you grow.
- Search is **scatter-gather in two phases**; deep `from`/`size` pagination is
  costly by design.

## Lab

Look at the physical layout of a real index. Seed the data if you haven't:

```bash
cd docs/elasticsearch/lab && ./seed-data.sh
```

Then in Kibana Dev Tools:

```
GET /_cat/shards/products?v
```

You'll see `products` primaries and replicas and which node holds each — a
primary and its replica always on different nodes. Now watch near-real-time and
scatter-gather in action:

```
GET /_cat/nodes?v&h=name,node.role,master
GET /products/_search?size=0        # size=0 → just the count + timing, no hits
```

Note `took` (ms) and that `_shards.total` equals the number of shards the query
fanned out to.

Next: [02 — Documents & CRUD](02-documents-crud.md)
