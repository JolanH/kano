# 11 — Search performance & tuning

By now you can write correct queries; this lesson is about making them *fast*.
Search tuning is mostly about doing less work: fewer scored clauses, fewer bytes
shipped back, fewer segments to fan across, and — best of all — moving work out
of the hot query path entirely, either into a cache or forward to index time.
The mistake to avoid is guessing. Elasticsearch will tell you exactly where a
query spends its time if you ask, so start there.

## Measure first: `_profile` and `_explain`

Two flags answer two different questions, and people confuse them:

| | `"explain": true` | `"profile": true` |
|---|---|---|
| Answers | *Why* this score? (BM25 breakdown) | *Where* did the time go? (per-component timing) |
| Domain | Relevance (lesson 05) | Performance |
| Output | Score arithmetic per matching doc | Nanosecond breakdown per query + collector, per shard |

`profile` is the one for tuning. Add it to any search:

```
GET /products/_search
{
  "profile": true,
  "query": {
    "bool": {
      "must":   { "match": { "name": "ergonomic" } },
      "filter": [ { "term": { "category": "chairs" } },
                  { "range": { "price": { "lt": 600 } } } ]
    }
  }
}
```

The response grows a `profile` section: for **each shard**, a `query` tree and a
`collector` tree. Read it top-down:

- The `query` tree mirrors your Lucene query. Each node has a `type`
  (`BooleanQuery`, `TermQuery`, `PointRangeQuery`…) and a `breakdown` of
  timings: `build_scorer`, `next_doc`, `advance`, and crucially `score`. A clause
  in filter context shows near-zero `score` time — that is the scoring skip made
  visible.
- The `collector` tree is what gathers the top-N (`SimpleTopScoreDocCollector`)
  or the aggregation. A fat collector time usually means sorting or aggregating,
  not matching.

`profile` output is verbose and hard to read raw. Kibana has a **Search
Profiler** (Dev Tools → Search Profiler) that renders the same JSON as a
flame-graph-style breakdown — paste the query, run it, and the slow node lights
up. Two caveats: profiling adds measurable overhead so timings are *relative,
not absolute*, and it profiles the query/fetch, not network or coordinator merge
time.

## The three cache layers

Repeated searches should get cheaper. Three caches sit in front of your shards,
and knowing which one you're hitting tells you how to help it:

| Cache | Caches what | Keyed on | Invalidated when | You help it by |
|---|---|---|---|---|
| **Node query cache** | Doc sets from `filter`-context clauses | The filter | Segment merges | Using `filter`, reusing clauses |
| **Shard request cache** | Whole-shard results of `size:0` requests (aggs, `hits.total`) | The request body | Refresh | Sending `size:0` dashboards |
| **OS filesystem cache** | Raw Lucene segment files (pages) | — | Memory pressure | Leaving free RAM off-heap |

- **Node query cache.** This is why filter context matters for speed, not just
  scoring. A `{ "term": { "category": "chairs" } }` in `bool.filter` produces a
  reusable bitset of matching docs the node caches per segment. The next query
  with that same filter skips the term lookup entirely. `must`-context clauses
  are **not** cached — another reason to move constraints to `filter` (lesson
  04).
- **Shard request cache.** For `size:0` requests — pure aggregations or count
  queries — Elasticsearch caches the *entire* per-shard result, keyed on the
  exact request JSON. It's enabled by default and auto-invalidated on the next
  refresh, so it's always consistent with a ~1s lag. This is what makes a Kibana
  dashboard cheap on the second load. It does **not** cache requests that return
  hits (`size > 0`), because those aren't deterministic across refreshes.
- **OS filesystem cache.** Lucene reads segments through the page cache, so the
  single biggest search-speed lever is **leaving RAM free for the OS** — heap no
  more than ~50% of memory, the rest for file caching (lesson 09). This is also
  why old-style **warmers were removed**: the page cache plus the request cache
  now do that job automatically.

## Retrieve less

The fetch phase ships `_source` for every returned hit. Wide documents make this
expensive even when the query was cheap. Trim it:

```
GET /products/_search
{
  "query": { "term": { "category": "monitors" } },
  "_source": ["name", "price"],          # only these fields' JSON is returned
  "size": 10
}
```

When you need just a couple of *values* (not the JSON structure), pull them from
doc values instead of parsing `_source` at all:

```
GET /products/_search
{
  "query": { "match_all": {} },
  "_source": false,
  "docvalue_fields": ["price", "rating", "category"]
}
```

`_source` vs doc values is a real trade-off:

| | `_source` filtering | `docvalue_fields` | `stored_fields` |
|---|---|---|---|
| Reads from | The stored `_source` blob | Columnar doc values | Individually stored fields |
| Good for | Returning original JSON shape | A few sortable/aggregatable values | Fields marked `store:true` |
| Cost | Fetch + parse whole blob, filter | Cheap columnar lookup | Cheap, but needs `store` at index time |

`docvalue_fields` beats `_source` when you want a handful of `keyword`/numeric/
date values and don't care about the original JSON: it reads the same columnar
structure aggregations use, no JSON parsing. It can't return `text` fields
(no doc values) or reconstruct nested objects. Whatever you do, **don't return
`_source` you throw away** — and keep `size` disciplined; a `size: 1000` "just in
case" multiplies fetch cost across every shard.

## Deep pagination is still the classic killer

Recall the scatter-gather math from lesson 01: `from: 10000, size: 10` forces
**every shard** to build and ship 10,010 sorted hits so the coordinator can merge
and discard all but 10. Cost grows with `from`, on every shard. Two fixes,
neither of which is a bigger `max_result_window`:

- **`search_after` + Point-in-Time** for real deep paging or exports — pages by a
  sort cursor at flat cost, against a frozen view of the index (deep-dived in
  lesson 12).
- **Aggregate instead of paging.** If you're paging to *summarize*, you want an
  aggregation, and `composite` to page the buckets (lesson 06) — not `from`/`size`
  over raw hits.

## Index-time vs search-time: pay once

The deepest lever is *when* you do the work. Some queries are expensive because
they force Lucene to compute at search time what could have been prepared at
index time:

- **Leading wildcards** (`*chair`), **`regexp`**, and **`script` queries** walk or
  evaluate across the term dictionary per query — no inverted-index shortcut.
- **High-cardinality aggregations** build large structures on the fly (lesson 06).

The fix is almost always to move the work to index time so the query becomes a
cheap `term` lookup:

| Search-time (expensive, per query) | Index-time alternative (cheap query) |
|---|---|
| `wildcard` / leading-wildcard on `text` | `wildcard` field type, or `keyword` + `term` |
| Substring / regex matching | `search_as_you_type` or edge-ngram analyzer |
| `script` deriving a value each hit | Compute + store the field at index time |
| Sorting/aggregating on `text` | A `keyword` sub-field with doc values (`name.raw`) |

> **Rule of thumb.** If a query is slow, ask whether the work can move to index
> time. Doing it once per document at ingest beats doing it once per document per
> query, forever.

## `force_merge`, `preference`, and shard hygiene

More segments means more per-query fan-out (lesson 01). For an index that is
**done being written** — a rolled-over ILM index, yesterday's logs — merging down
to one segment makes search meaningfully faster:

```
POST /products/_forcemerge?max_num_segments=1
```

- **NEVER force-merge an index still being written to.** It produces huge
  segments that normal merging won't touch again, and a single expensive-to-merge
  segment can wreck ongoing indexing. Force-merge only read-only indices. ILM's
  `forcemerge` action (lesson 10) does this automatically at rollover — the right
  place for it in production.
- **`preference`** routes a request to a consistent set of shard copies. Sending
  the same user's repeated queries to the same replica (`?preference=_local` or a
  custom string) improves cache hit rates, since node query cache and the OS page
  cache are per-node. By default **adaptive replica selection** already routes to
  the fastest-responding copy — leave it on; only pin `preference` for cache
  locality or reproducible scoring across a session.
- **Right-size shards** (lesson 07). Too many small shards multiplies
  scatter-gather overhead; oversized shards merge slowly and page poorly.

## Cheat sheet

- **Measure with `"profile": true`** (where time goes); `"explain": true` is for
  relevance, not speed. Read it in Kibana's **Search Profiler**.
- **Three caches:** node query cache (filter doc-sets, invalidated on merge),
  shard request cache (`size:0` results, invalidated on refresh), OS filesystem
  cache (segment pages — leave RAM free for it). Warmers are gone.
- **Filter context is a speed feature**, not just a scoring one — cacheable and
  unscored. Prefer `filter` over `must` when you don't need `_score`.
- **Retrieve less:** `_source` filtering, `docvalue_fields` for a few values,
  cap `size`. `docvalue_fields` beats `_source` for handful-of-values fetches.
- **Deep `from`/`size` is O(shards × (from+size))** — use `search_after`+PIT
  (lesson 12) or aggregate/`composite` (lesson 06) instead.
- **Move work to index time:** `keyword`+`term`, `wildcard` field type,
  `search_as_you_type` — instead of leading-wildcard/`regexp`/`script` at query
  time.
- **`force_merge` read-only indices to 1 segment**; never an index still being
  written. Use `preference` for cache locality; adaptive replica selection is the
  default.

## Lab

```
# 1. profile a bool query — find the expensive node
GET /products/_search
{ "profile": true,
  "query": { "bool": {
    "must":   { "match": { "name": "ergonomic" } },
    "filter": [ { "term": { "category": "chairs" } },
                { "range": { "price": { "lt": 600 } } } ] } } }
#  >>> expand profile.shards[0].searches[0].query; note the near-zero `score`
#      time on the filter clauses vs the match clause

# 2. same filter twice — the node query cache warms
GET /products/_search
{ "query": { "bool": { "filter": { "term": { "category": "chairs" } } } } }
GET /products/_search
{ "query": { "bool": { "filter": { "term": { "category": "chairs" } } } } }
#  >>> second `took` typically drops; the filter bitset is cached per segment

# 3. shard request cache: a size:0 aggregation
GET /products/_search?request_cache=true
{ "size": 0,
  "aggs": { "by_cat": { "terms": { "field": "category" } } } }
#  >>> re-run: served from the shard request cache until the next refresh

# 4. retrieve less — values via doc values, no _source parsing
GET /products/_search
{ "_source": false,
  "docvalue_fields": ["price", "rating", "category"],
  "size": 5 }

# 5. force-merge a read-only index to one segment, then confirm
GET /_cat/segments/products?v&h=shard,segment,docs.count
POST /products/_forcemerge?max_num_segments=1
GET /_cat/segments/products?v&h=shard,segment,docs.count
#  >>> segment count per shard collapses toward 1 (products is not being
#      written here, so this is safe)
```

Next: [12 — Advanced add-ons](12-advanced-addons.md)
