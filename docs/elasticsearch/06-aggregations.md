# 06 — Aggregations

Search answers "which documents match"; aggregations answer "what do they add up
to" — averages, counts per category, trends over time, percentiles. They run on
the same **doc values** that power sort (lesson 01), not the inverted index, and
they run **scatter-gather** across shards just like a query does. That last fact
is the source of every surprising number you'll see here: on a multi-shard index,
some of the most common aggregations return **approximate** results by design.
This lesson covers the three families, how nesting composes them, and — the part
worth slowing down for — where the approximation and the memory cost live.

## The `size: 0` pattern and the query/agg interplay

An aggregation request is a normal `_search` with an `aggs` block. You almost
always pair it with `size: 0`: you want the computed buckets, not the matching
documents, and fetching hits you'll ignore is wasted work.

```
GET /products/_search
{
  "size": 0,
  "aggs": {
    "avg_price": { "avg": { "field": "price" } }
  }
}
#  >>> aggregations.avg_price.value — mean price across all 15 docs
```

The critical mental model: **aggregations run over the query's result set.** With
no `query`, that's every document (`match_all`). Add a `query` and the buckets
recompute over only what matched — filtering changes the numbers.

```
GET /products/_search
{
  "size": 0,
  "query": { "term": { "category": "chairs" } },
  "aggs": { "avg_price": { "avg": { "field": "price" } } }
}
#  >>> now the average is over chairs only
```

Keep the query in **filter context** (`bool.filter`) when you don't need scores —
it's cacheable and skips scoring, and aggregations don't care about `_score`.

## Family 1 — metric aggregations

Metrics compute a number over the result set. The exact ones are cheap:

```
GET /products/_search
{
  "size": 0,
  "aggs": {
    "price_stats": { "stats": { "field": "price" } },
    "top_rating":  { "max":   { "field": "rating" } },
    "catalogue":   { "sum":   { "field": "price" } }
  }
}
```

`stats` returns `count`, `min`, `max`, `avg`, `sum` in one pass; `extended_stats`
adds variance and standard deviation. Two metrics are **approximate** and matter
disproportionately in production:

- **`cardinality`** — distinct-count via the HyperLogLog++ algorithm. It does not
  hold every value in memory; it holds a fixed-size sketch.
- **`percentiles`** / **`percentile_ranks`** — the p50/p95/p99 latency numbers you
  actually care about, computed with the TDigest algorithm (a compressed
  distribution sketch).

```
GET /products/_search
{
  "size": 0,
  "aggs": {
    "brands":     { "cardinality": { "field": "brand" } },
    "price_pcts": { "percentiles": { "field": "price",
                                     "percents": [50, 95, 99] } }
  }
}
```

We'll return to *why* these approximate, and the knobs that trade memory for
accuracy, once buckets are on the table.

## Family 2 — bucket aggregations

Buckets group documents; each bucket carries a `doc_count`. The workhorses:

| Aggregation | Buckets by | Typical use |
|---|---|---|
| `terms` | each distinct value of a field | "count per category/brand" |
| `range` | numeric ranges you define | price bands |
| `histogram` | fixed numeric interval | evenly-spaced price buckets |
| `date_histogram` | calendar/fixed time interval | docs per month |
| `filters` | one bucket per named query | arbitrary cohorts |

```
GET /products/_search
{
  "size": 0,
  "aggs": {
    "by_category": { "terms": { "field": "category" } }
  }
}
#  >>> a bucket per category with doc_count each
```

**Never run `terms` (or any bucket/metric) on an analyzed `text` field.** Doc
values aren't built for `text`, so it demands **`fielddata`** — an on-heap,
per-term structure built lazily at query time that is expensive and easy to blow
your heap with. Elasticsearch refuses unless you explicitly enable it. Aggregate
the `keyword` instead: `category` and `brand` are keyword; for a text field like
`name`, use the `name.raw` multi-field (lesson 03).

## Family 3 — pipeline aggregations

Pipeline aggs consume the **output of other aggregations** rather than documents.
They come in two flavours: *parent* (add a metric alongside sibling buckets, e.g.
`derivative`, `cumulative_sum`) and *sibling* (reduce a whole set of buckets to
one value, e.g. `avg_bucket`, `max_bucket`). They reference their input via
`buckets_path`.

```
GET /products/_search
{
  "size": 0,
  "aggs": {
    "per_month": {
      "date_histogram": { "field": "created", "calendar_interval": "month" },
      "aggs": { "monthly_spend": { "sum": { "field": "price" } } }
    },
    "avg_monthly_spend": {
      "avg_bucket": { "buckets_path": "per_month>monthly_spend" }
    },
    "running_total": {
      "cumulative_sum": { "buckets_path": "monthly_spend" }
    }
  }
}
```

`avg_monthly_spend` (sibling) averages the per-month sums; `cumulative_sum`
(parent, nested inside `per_month`) turns them into a running total. `derivative`
gives month-over-month change — the building blocks of trend reporting without a
second round-trip.

## Nesting: the real power

Any bucket agg can hold sub-aggregations, which run **within each bucket**. This
composition is where aggregations earn their keep — a single request produces a
whole report.

```
GET /products/_search
{
  "size": 0,
  "aggs": {
    "by_category": {
      "terms": { "field": "category", "order": { "avg_price": "desc" } },
      "aggs": {
        "avg_price":  { "avg": { "field": "price" } },
        "max_rating": { "max": { "field": "rating" } }
      }
    }
  }
}
```

```
by_category (terms on category)
├─ chairs       doc_count  avg_price  max_rating
├─ desks        doc_count  avg_price  max_rating
├─ peripherals  doc_count  avg_price  max_rating
└─ monitors     doc_count  avg_price  max_rating
                └─ metrics recomputed per bucket
```

Note `order` lets an outer `terms` sort its buckets by an inner metric — but,
critically, that ordering is computed *after* each shard has already chosen its
top-N by `doc_count`, which is exactly the trap the next section is about.

### date_histogram over time

```
GET /products/_search
{
  "size": 0,
  "aggs": {
    "per_month": {
      "date_histogram": { "field": "created", "calendar_interval": "month" },
      "aggs": { "avg_rating": { "avg": { "field": "rating" } } }
    }
  }
}
```

Prefer `calendar_interval` (`month`, `week`, `day`) over `fixed_interval`
(`30d`) when you want calendar-aware boundaries — months aren't all 30 days.
**Bucketing is done in UTC by default**; pass `"time_zone": "Europe/Paris"` so a
"day" aligns to the user's midnight, not UTC's, or your daily counts will look
off by a few hours near boundaries.

## Accuracy and cost: the deep part

Here's the thing to internalise: aggregations are **scatter-gather** (lesson 01).
The coordinator asks each shard to aggregate its own documents, then merges the
shard responses. That merge is exact for `sum`/`avg`/`min`/`max` — you can add
partial sums. It is **not** generally exact for "top-N by count", because no shard
can know the global counts of terms it didn't rank highly.

### Why `terms` is approximate on multi-shard indices

```
   coordinator asks each shard for its top `shard_size` terms
   shard A ─▶ [chairs:5, desks:3, ...]      shard B ─▶ [peripherals:6, monitors:2, ...]
                         │
                         ▼  merge, keep top `size`
   a term ranked #4 on shard A but returned by nobody → its count is UNDERSTATED
```

Each shard returns only its own top terms. If a term is popular globally but sits
just below the cutoff on several shards, those contributions are lost from the
merged total. Elasticsearch is honest about it via two response fields:

- **`doc_count_error_upper_bound`** — worst-case count that could be missing from
  the returned buckets.
- **`sum_other_doc_count`** — total `doc_count` of all buckets that didn't make
  the final `size`.

Two knobs control the trade-off:

| Knob | Effect | Cost |
|---|---|---|
| `size` | how many buckets you get back | bigger response |
| `shard_size` | how many each shard returns before merge (default `size * 1.5 + 10`) | more per-shard work + memory, less error |

Raise `shard_size` to shrink the error. On the lab index (`number_of_shards: 1`)
there is **no merge**, so `terms` is exact and `doc_count_error_upper_bound` is
`0` — the approximation only appears once data spans multiple shards. Set
`"show_term_doc_count_error": true` to see per-bucket error.

### Why `cardinality` and `percentiles` are approximate

These use fixed-memory sketches so they scale to billions of values without
holding them all:

- **`cardinality` (HyperLogLog++)** — `precision_threshold` (default 3000, max
  40000) sets the count below which results are near-exact; above it, error grows
  slowly. Higher threshold = more memory for more accuracy.
- **`percentiles` (TDigest)** — `compression` (default 100) trades node memory for
  tighter tail estimates. Extreme percentiles (p99) are less accurate than the
  median. Use `percentile_ranks` for the inverse question ("what fraction is under
  500ms").

### Memory and the circuit breaker

Aggregations build in-memory structures over doc values: `terms` holds a bucket
per distinct value, and **nesting multiplies** — `terms(brand) → terms(tags)` can
explode into cardinality(brand) × cardinality(tags) buckets. High-cardinality or
deeply-nested aggs can exhaust the JVM heap, so the **request circuit breaker**
trips first and rejects the request (HTTP 429 `circuit_breaking_exception`) rather
than OOM-ing the node. There's also a hard `search.max_buckets` ceiling (default
65536). When you hit these, don't just raise limits — reach for `composite`.

> **Rule of thumb.** If a number must be exact — billing, audit, reconciliation —
> don't trust a multi-shard `terms`, `cardinality`, or `percentiles`; either
> aggregate a single-shard index, page every bucket with `composite`, or push the
> heavy analytics to a transform / ES|QL.

## `composite`: paginate every bucket deterministically

`terms` shows you the *top* buckets and caps at `size`. When you need **all**
buckets — exporting every brand, feeding a downstream job — `composite` streams
them in sorted order, a page at a time, using an `after_key` cursor.

```
GET /products/_search
{
  "size": 0,
  "aggs": {
    "all_brands": {
      "composite": {
        "size": 5,
        "sources": [ { "brand": { "terms": { "field": "brand" } } } ]
      }
    }
  }
}
#  >>> response includes after_key; pass it back as "after" for the next page
```

| | `terms` | `composite` |
|---|---|---|
| Returns | top-`size` buckets only | **every** bucket, paged |
| Accuracy | approximate on many shards | exact, complete |
| Ordering | by count or a sub-metric | by the source key(s) only |
| Sub-aggs | yes | yes |

The catch: **`composite` sorts by its source keys, not by a metric** — you can't
ask it for "top brands by revenue" in one pass. It's for completeness, not
ranking.

## Escaping and extending the scope

- **`filter` / `filters` agg** — a bucket restricted to a sub-query. `filters`
  makes several named cohort buckets (e.g. `in_stock` vs not) in one request.
- **`global` agg** — ignores the surrounding `query` and aggregates the whole
  index, so you can show "avg price of chairs" *next to* "avg price of everything"
  in a single call.
- **Heavier analytics** — for continuously materialised rollups or SQL-style
  analytics beyond ad-hoc aggs, reach for **transforms** or **ES|QL** (lesson 12).

## Cheat sheet

- **Three families:** metric (numbers), bucket (groups), pipeline (aggs over agg
  output). Nest bucket → sub-aggs to build a whole report in one request.
- Always `size: 0` for pure aggs. Aggs run over the **query result set**;
  filtering changes buckets. Use filter context — scores are irrelevant.
- **Aggregate `keyword`, never `text`** — `text` needs expensive `fielddata`.
- **`terms` is approximate on multi-shard indices**: shards return their top
  `shard_size`, coordinator merges → check `doc_count_error_upper_bound` and
  `sum_other_doc_count`; raise `shard_size` to reduce error.
- **`cardinality` (HLL++, `precision_threshold`)** and **`percentiles` (TDigest,
  `compression`)** are approximate — memory-for-accuracy knobs.
- Nesting/high cardinality → **request circuit breaker** + `search.max_buckets`.
- **`composite`** pages *all* buckets deterministically (`after_key`) but sorts by
  key, not metric. `global` escapes the query scope.

## Lab

```
# 1. size:0 metric — one-pass stats
GET /products/_search
{ "size": 0, "aggs": { "p": { "stats": { "field": "price" } } } }

# 2. query changes the buckets — same agg, in-stock only
GET /products/_search
{ "size": 0, "query": { "term": { "in_stock": true } },
  "aggs": { "by_cat": { "terms": { "field": "category" } } } }

# 3. nested report: avg price + max rating per category, sorted by price
GET /products/_search
{ "size": 0, "aggs": { "by_cat": {
    "terms": { "field": "category", "order": { "avg_price": "desc" } },
    "aggs": { "avg_price": { "avg": { "field": "price" } },
              "max_rating": { "max": { "field": "rating" } } } } } }

# 4. see the error fields — on this 1-shard index they're 0 (no merge)
GET /products/_search
{ "size": 0, "aggs": { "b": { "terms": { "field": "brand", "size": 3,
    "show_term_doc_count_error": true } } } }
#  >>> note doc_count_error_upper_bound and sum_other_doc_count

# 5. date_histogram + pipeline running total
GET /products/_search
{ "size": 0, "aggs": {
    "per_month": { "date_histogram": { "field": "created",
                     "calendar_interval": "month" },
      "aggs": { "spend": { "sum": { "field": "price" } },
                "running": { "cumulative_sum": { "buckets_path": "spend" } } } } } }

# 6. composite — page ALL brands, then feed after_key back as "after"
GET /products/_search
{ "size": 0, "aggs": { "all": { "composite": { "size": 5,
    "sources": [ { "brand": { "terms": { "field": "brand" } } } ] } } } }

# 7. footgun: aggregate the analyzed text field
GET /products/_search
{ "size": 0, "aggs": { "n": { "terms": { "field": "name" } } } }
#  >>> error: set fielddata=true (don't) — aggregate name.raw instead
```

Next: [07 — Sharding & replication](07-sharding-replication.md)
