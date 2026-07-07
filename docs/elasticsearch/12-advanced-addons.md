# 12 — Advanced add-ons

*Advanced grab-bag; each section stands alone and builds on the core lessons.*

You now have the whole spine of Elasticsearch: architecture, mapping, queries,
relevance, aggregations, sharding, and tuning. This final lesson is a set of
independent add-ons — techniques you'll reach for in production but that didn't
belong to any single core chapter. Each `##` section stands alone; skim to the
one you need. Where possible the examples run against the same `products` index
you seeded in lesson 02.

## Deep pagination done right — `search_after` + PIT

Lessons 01 and 04 showed why `from`/`size` collapses past a few thousand hits:
to serve `from: 10000, size: 10`, **every shard** builds and ships 10,010 sorted
hits to the coordinator, which merges and throws almost all of them away. Cost
grows with the offset, on every shard, which is why `index.max_result_window`
(**10000**) hard-stops the query rather than let it quietly melt the cluster.

The modern answer is **`search_after`**: instead of an offset, you page by the
**sort values of the last hit** you saw — a cursor, not a count. Each page is a
fresh query that says "give me the next N after *these* values", so the cost is
flat no matter how deep you go. Two requirements: a **deterministic sort with a
tiebreaker** (so two docs never compare equal), and a **stable view of the data**
so results don't shift under you as documents are indexed. The stable view is a
**Point In Time** (PIT).

```
# 1. open a PIT — freezes the set of segments for a keep_alive window
POST /products/_pit?keep_alive=2m
#  >>> { "id": "46To...==" }   (the PIT id; opaque, can be long)

# 2. first page — sort by a field, then a tiebreaker; no `from`
POST /_search
{
  "size": 5,
  "pit": { "id": "46To...==", "keep_alive": "2m" },
  "query": { "match_all": {} },
  "sort": [ { "price": "asc" }, { "_shard_doc": "asc" } ]
}
```

`_shard_doc` is a built-in, cheap, fully-ordered tiebreaker available only when
you search with a PIT (use `_id` if you aren't). Read the `sort` array off the
**last hit** of the response and feed it back as `search_after`:

```
# 3. next page — paste the last hit's sort values
POST /_search
{
  "size": 5,
  "pit": { "id": "46To...==", "keep_alive": "2m" },
  "query": { "match_all": {} },
  "sort": [ { "price": "asc" }, { "_shard_doc": "asc" } ],
  "search_after": [ 295.0, 4294967298 ]     #  >>> last hit's [price, _shard_doc]
}

# 4. clean up when done (PITs cost heap + hold segments open)
DELETE /_pit
{ "id": "46To...==" }
```

Note the PIT id lives in the **body**, not the URL, and each request refreshes
`keep_alive`. Because the PIT pins segments, it also **defeats merge cleanup** for
its lifetime — keep windows short and always `DELETE` when finished.

**Contrast with `scroll`.** The old `scroll` API did the same "export everything"
job by holding a server-side cursor. It's now **legacy**: it's stateful, ties up
resources, doesn't parallelise well, and can't jump. `search_after` + PIT is
stateless per request, resumable, and the officially recommended replacement.

> **Rule of thumb.** Never page with `from` past the first handful of pages. For
> deep paging or full exports, use `search_after` + PIT; reserve `scroll` for
> legacy code you haven't migrated yet.

## Runtime fields — schema-on-read

Every field so far was computed at **index time**: analyzed, stored, done. A
**runtime field** flips that — it's evaluated at **query time** by a Painless
script, so it exists only when a search asks for it. You can define one inline in
a single search via `runtime_mappings`, or bake it into the mapping so it's always
available (still computed per query).

```
# price_with_tax computed on the fly — the index stores no such field
POST /products/_search
{
  "runtime_mappings": {
    "price_with_tax": {
      "type": "double",
      "script": { "source": "emit(doc['price'].value * 1.20)" }
    }
  },
  "query": { "range": { "price_with_tax": { "gte": 600 } } },
  "fields": ["name", "price_with_tax"],
  "_source": false
}
```

The trade-off is the whole point:

| | Index-time field | Runtime field |
|---|---|---|
| Computed | Once, at ingest | Every query that touches it |
| Storage | Uses disk + doc values | Zero (nothing stored) |
| Add / change | Requires **reindex** (lesson 03) | Instant — just edit the mapping |
| Query cost | Cheap (precomputed) | Per-query CPU (script runs per doc) |
| Best for | Hot fields, sorted/filtered constantly | Rarely-used, exploratory, or evolving fields |

**Gotchas:**

- **They don't cost storage but they do cost CPU**, per matching document, per
  query. Filtering *heavily* on a runtime field over a large index is slow —
  there's no inverted index to consult.
- **Fix a bad mapping without reindexing.** A field that got typed wrong at
  ingest can be shadowed by a runtime field of the correct type until you
  reindex properly — a genuine escape hatch for the immutability problem from
  lesson 03.
- **`emit(...)` is mandatory**; the script returns nothing, it emits.

## Aliases & zero-downtime reindex

Mappings are immutable (lesson 03): you cannot change a field's type in place.
The production migration pattern is **reindex into a new index and swap an
alias** — a named pointer to one or more indices that clients query instead of a
concrete index name.

```
# 1. new index with the corrected mapping
PUT /products_v2
{ "mappings": { "properties": { "price": { "type": "scaled_float",
                                            "scaling_factor": 100 }, ... } } }

# 2. copy the data (runs server-side; add a query/script to transform en route)
POST /_reindex
{ "source": { "index": "products_v1" }, "dest": { "index": "products_v2" } }

# 3. atomically flip the alias — readers never see a gap
POST /_aliases
{
  "actions": [
    { "remove": { "index": "products_v1", "alias": "products" } },
    { "add":    { "index": "products_v2", "alias": "products" } }
  ]
}

# 4. once verified
DELETE /products_v1
```

The `_aliases` actions apply **atomically** in one cluster-state update, so there
is no instant where `products` points at nothing. This is why you should always
have applications talk to an **alias**, never a raw index — it buys you migrations,
rollbacks, and rollover (lesson 10) for free.

Two variants worth knowing:

- **Filtered aliases** — attach a `filter` so an alias exposes only a slice of an
  index (e.g. `{ "add": { "index": "products", "alias": "chairs", "filter": {
  "term": { "category": "chairs" } } } }`). A cheap read-only "view".
- **Write aliases** — when an alias spans multiple indices, writes are ambiguous.
  Mark exactly one target with `"is_write_index": true` so indexing through the
  alias has a single destination; this is the backbone of rollover/ILM.

## Cross-cluster search (CCS)

A single query can reach indices on **other clusters**. You register a remote
cluster once, then address its indices with the `remote:index` prefix:

```
# register a remote (persistent cluster setting; done once per cluster)
PUT /_cluster/settings
{ "persistent": { "cluster": { "remote": { "eu_west": {
      "seeds": ["es-eu.internal:9300"] } } } } }

# now query local + remote in one shot
GET /products,eu_west:products/_search
{ "query": { "match": { "name": "chair" } } }
```

The classic use case is **centralized search over regional clusters**: keep data
resident in each region for latency/sovereignty, but let a central cluster fan a
single query across all of them and merge the results — no data movement. It's
also how you query a hot cluster and a cheap archival cluster together.

**Caveats:**

- **Latency dominates.** The query is only as fast as the slowest remote link;
  cross-region round-trips can swamp the search itself. `skip_unavailable` lets a
  remote drop out without failing the whole query.
- **Version compatibility is bounded.** A coordinating cluster can query remotes
  within a supported version window, not arbitrarily old ones — check the matrix
  before mixing majors.

(The lab runs a single cluster, so CCS is shown here for syntax only.)

## ES|QL — the piped query language

New and **GA in 9.x**, ES|QL is a compact, pipe-based query language that exists
because the Query DSL, for all its power, is *verbose* for analytics — a five-line
aggregation is a forty-line JSON tree. You send it to `POST /_query`:

```
POST /_query
{ "query": "FROM products | WHERE price > 500 | STATS avg(price) BY category | SORT category" }
```

Reads top to bottom like a shell pipeline: source (`FROM`), filter (`WHERE`),
aggregate (`STATS ... BY`), order (`SORT`), plus `EVAL` for computed columns,
`KEEP`/`DROP` for projection, and `LIMIT`. Another:

```
POST /_query
{ "query": "FROM products | EVAL price_with_tax = price * 1.20 | KEEP name, price_with_tax | SORT price_with_tax DESC | LIMIT 5" }
```

ES|QL **complements, it does not replace, the DSL.** It shines for analytics,
exploration, and computed columns; it does **not** do relevance-scored full-text
ranking the way `match` + `_score` does. Reach for the DSL when you need search
relevance, for ES|QL when you're slicing and aggregating.

## Further reading — vector / kNN semantic search

One deliberate omission: **vector search**. Elasticsearch supports `dense_vector`
fields and `knn` queries for semantic (embedding-based) retrieval, and **hybrid
search** that fuses lexical BM25 scores with kNN similarity for the best of both.
It's a large topic — embeddings, model management, quantization, RRF fusion — and
out of scope for this course. Start with Elastic's official kNN and semantic
search docs when you're ready.

## Cheat sheet

- **Deep paging:** `from` only for the first few pages. Beyond that, open a
  `_pit`, `sort` by a field + tiebreaker (`_shard_doc` or `_id`), page with
  `search_after` using the last hit's sort values, then `DELETE` the PIT.
  `scroll` is legacy.
- **Runtime fields:** query-time Painless (`emit(...)`), zero storage, instant to
  add/change, but per-query CPU. Great for evolving/rare fields and shadowing a
  mis-typed field without reindexing.
- **Migrations:** mappings are immutable → new index, `_reindex`, atomic
  `_aliases` swap, drop the old. Always point apps at an **alias**; use
  `is_write_index` for multi-index writes and `filter` for view-like aliases.
- **CCS:** register `cluster.remote.<name>.seeds`, query `remote:index`; watch
  latency and version compatibility, use `skip_unavailable`.
- **ES|QL:** `POST /_query` with a piped `FROM ... | WHERE | STATS ... BY | SORT`
  string — ergonomic analytics; complements the DSL, no relevance ranking.
- **Vectors:** `dense_vector` + `knn` + hybrid BM25/kNN — real, powerful, out of
  scope here; see Elastic's docs.

## Lab

```
# 1. deep paging — open a PIT, page twice, close it
POST /products/_pit?keep_alive=2m
#  >>> copy the returned "id"

POST /_search
{ "size": 5, "pit": { "id": "PASTE_ID", "keep_alive": "2m" },
  "query": { "match_all": {} },
  "sort": [ { "price": "asc" }, { "_shard_doc": "asc" } ] }
#  >>> note the last hit's "sort": [ <price>, <shard_doc> ]

POST /_search
{ "size": 5, "pit": { "id": "PASTE_ID", "keep_alive": "2m" },
  "query": { "match_all": {} },
  "sort": [ { "price": "asc" }, { "_shard_doc": "asc" } ],
  "search_after": [ PASTE_PRICE, PASTE_SHARD_DOC ] }
#  >>> the next 5 cheapest, no offset

DELETE /_pit
{ "id": "PASTE_ID" }

# 2. runtime field — price with 20% tax, computed at query time
POST /products/_search
{ "runtime_mappings": {
    "price_with_tax": { "type": "double",
      "script": { "source": "emit(doc['price'].value * 1.20)" } } },
  "query": { "range": { "price_with_tax": { "gte": 600 } } },
  "fields": ["name", "price_with_tax"], "_source": false }

# 3. zero-downtime reindex + alias swap
PUT /products_v2
{ "mappings": { "properties": {
    "name": { "type": "text", "fields": { "raw": { "type": "keyword" } } },
    "category": { "type": "keyword" }, "brand": { "type": "keyword" },
    "price": { "type": "scaled_float", "scaling_factor": 100 },
    "rating": { "type": "half_float" }, "in_stock": { "type": "boolean" },
    "tags": { "type": "keyword" }, "created": { "type": "date" } } } }

POST /_reindex
{ "source": { "index": "products" }, "dest": { "index": "products_v2" } }

POST /_aliases
{ "actions": [
    { "add": { "index": "products_v2", "alias": "catalog" } } ] }

GET /catalog/_count        #  >>> 15, served through the alias

# 4. ES|QL — average price per category, then a computed column
POST /_query
{ "query": "FROM products | STATS avg(price) BY category | SORT category" }

POST /_query
{ "query": "FROM products | EVAL price_with_tax = price * 1.20 | KEEP name, price_with_tax | SORT price_with_tax DESC | LIMIT 5" }
```

— End of the course. Back to the [index](README.md).
