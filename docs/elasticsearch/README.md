# Elasticsearch for senior developers

A step-by-step course that takes you from "I've heard of Elasticsearch" to
running a cluster, modelling data, writing correct queries, and tuning it for
production. Written for people who already understand HTTP, JSON, and containers
— so we skip the 101 and spend the time on **why** Elasticsearch behaves the way
it does, and the **trade-offs** behind every knob.

## How the course is structured

Each lesson is self-contained, builds on the previous one, and ends with a
**lab** you run against a real **3-node cluster** on your machine. Examples
target **Elasticsearch 9.x** (9.4 at time of writing) using the modern,
typeless API; anything version-sensitive is called out inline.

| # | Lesson | What you walk away with |
|---|--------|-------------------------|
| 00 | [Lab setup](00-lab-setup.md) | A reproducible 3-node Docker cluster + Kibana, secured like production |
| 01 | [Architecture & mental model](01-architecture.md) | Cluster → node → index → shard → segment; the inverted index; how a request flows |
| 02 | [Documents & CRUD](02-documents-crud.md) | Indexing, versioning, optimistic concurrency, `_bulk`, refresh semantics |
| 03 | [Mapping & analysis](03-mapping-analysis.md) | `text` vs `keyword`, analyzers, multi-fields, and the mapping-explosion footgun |
| 04 | [Query DSL & search](04-query-dsl.md) | Query vs filter context, `bool`, full-text vs exact match, pagination |
| 05 | [Relevance & scoring](05-relevance-scoring.md) | BM25, `_explain`, boosting, `function_score`, precision/recall trade-offs |
| 06 | [Aggregations](06-aggregations.md) | Metric/bucket/pipeline aggs, `cardinality` cost, `composite` paging, accuracy trade-offs |
| 07 | [Sharding & replication](07-sharding-replication.md) | Primaries, replicas, routing, shard sizing, and how to avoid over-sharding |
| 08 | [Indexing performance](08-indexing-performance.md) | Bulk tuning, `refresh_interval`, translog durability, `doc_values`, index sorting |
| 09 | [Cluster operations & scaling](09-cluster-ops.md) | Node roles, master election, data tiers, allocation awareness, JVM heap sizing |
| 10 | [Lifecycle & data streams](10-lifecycle-data-streams.md) | ILM, rollover, data streams, snapshots & SLM |
| 11 | [Search performance & tuning](11-search-tuning.md) | `_profile`, caches, `_source` filtering, `force_merge`, index-time vs search-time |
| 12 | [Advanced add-ons](12-advanced-addons.md) | `search_after`+PIT, runtime fields, aliases & zero-downtime reindex, cross-cluster, ES\|QL |

## How to use it

- **Linear first pass.** The labs reuse one cluster (lesson 00) and the same
  `products` sample index (seeded in lesson 02, used through lesson 06).
- **Reference second.** Each lesson ends with a **Cheat sheet** you can jump
  back to.
- **Type the requests.** The Query DSL is verbose and easy to get subtly wrong
  (a `term` on a `text` field returns nothing and no error). Muscle memory pays
  off — don't copy-paste blindly the first time.

## Conventions used throughout

- Requests are shown in **Kibana Dev Tools Console** form — `GET /_cluster/health`
  — which is the fastest way to run them. The [lab README](lab/README.md) shows
  the equivalent `curl` for the shell.
- `#  >>>` comments in output mark the field a paragraph is talking about.
- JSON bodies are shown in full when small, and as the relevant fragment once
  large.
- Lab commands assume you're in `docs/elasticsearch/lab/`.

## A note on versions

Elasticsearch ships a minor roughly every couple of months and a major every
year or two. This course targets **9.x** and flags where 8.x differs.

The historical gotchas you should know are already gone in the versions you'll
run: **mapping types** (`_doc/_type`) were removed after 6.x — one index is one
schema; the **TransportClient** is gone, everything is the REST/HTTP API; and
**security is on by default** (TLS + auth), so there is no "just curl localhost
:9200 with no password" anymore. If a tutorial does any of those three things,
it predates what you're learning here.
