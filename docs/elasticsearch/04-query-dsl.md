# 04 — Query DSL & search

Now that documents are indexed and mapped correctly, you can ask questions.
Elasticsearch's Query DSL is a JSON tree you send to `_search`; every query is a
node, and you compose them into bigger nodes. The single idea that separates
people who wield it well from people who fight it is **query context vs filter
context** — whether a clause contributes to relevance scoring or just answers a
yes/no question. Get that distinction, learn which queries analyze their input
and which don't (lesson 03's footgun again), and the rest is composition.

## The `_search` request and response shape

A search is `GET /products/_search` with a JSON body. The default query returns
everything:

```
GET /products/_search
{ "query": { "match_all": {} } }
```

The response has a predictable shape:

```
{
  "took": 4,                    #  >>> query time in ms (coordinator-side)
  "timed_out": false,
  "_shards": { "total": 1, "successful": 1, ... },
  "hits": {
    "total": { "value": 15, "relation": "eq" },   #  >>> total matching docs
    "max_score": 1.0,
    "hits": [                   #  >>> the actual page of results
      { "_index": "products", "_id": "1", "_score": 1.0, "_source": { ... } },
      ...
    ]
  }
}
```

`hits.total.value` is the match count; `relation: "eq"` means exact, `"gte"`
means "at least this many" (Elasticsearch stops counting past `track_total_hits`,
10000 by default, to save work). `_score` is the relevance number (lesson 05);
`match_all` gives every doc a flat `1.0`. Control the page with `size` (how many
hits, default 10) and `from` (offset, default 0):

```
GET /products/_search
{ "query": { "match_all": {} }, "size": 5, "from": 0 }
```

## Query context vs filter context — the central idea

Every clause runs in one of two contexts, and it changes both the result and the
cost:

| | Query context | Filter context |
|---|---|---|
| Question asked | "How *well* does this doc match?" | "Does this doc match — yes or no?" |
| Produces `_score`? | **Yes** — computes relevance | No — score is irrelevant, treated as `0` |
| Cacheable? | Not by the filter cache | **Yes** — the node caches the matching doc set |
| Use for | Full-text relevance ranking | Exact/boolean/range constraints |

The `bool` query is where you assign context. It has four clause types:

```
GET /products/_search
{
  "query": {
    "bool": {
      "must":     [ ... ],   # query context  — must match, CONTRIBUTES to _score
      "should":   [ ... ],   # query context  — nice-to-match, BOOSTS _score
      "filter":   [ ... ],   # filter context — must match, NO score, CACHED
      "must_not": [ ... ]    # filter context — must NOT match, NO score
    }
  }
}
```

- **`must`** — the doc must satisfy every clause; each contributes to `_score`.
- **`filter`** — the doc must satisfy every clause, but scoring is skipped and
  the result set is cached. This is the cheapest, most reusable clause.
- **`should`** — OR-ish. If there's no `must`/`filter`, at least one `should`
  must match; when there *is* a `must`/`filter`, `should` clauses are pure
  boosters (matching more of them ranks a doc higher). Tune with
  `minimum_should_match`.
- **`must_not`** — exclusion, in filter context (no scoring cost).

> **Rule of thumb.** If a clause doesn't need to influence ranking — a category,
> a boolean, a date or price range — put it in `filter`, not `must`. You get the
> same documents, a cacheable result set, and less work per query.

## Full-text queries (for `text` fields — they analyze)

Full-text queries run the **same analyzer** over your search terms that indexed
the field, so case and tokenization line up.

```
# match: analyze the input, OR the resulting terms together
GET /products/_search
{ "query": { "match": { "name": "ergonomic chair" } } }
#  >>> matches docs containing "ergonomic" OR "chair" (both → higher score)

# match_phrase: terms must be adjacent and in order
GET /products/_search
{ "query": { "match_phrase": { "name": "standing desk" } } }
#  >>> "Electric Standing Desk 60in" matches; "Desk ... Standing" would not

# multi_match: one query string across several fields
GET /products/_search
{ "query": { "multi_match": { "query": "mesh", "fields": ["name", "tags"] } } }
```

`match` is your default full-text query. `match_phrase` cares about word order
and proximity. `multi_match` fans one query across fields (with modes like
`best_fields` and `cross_fields`).

## Term-level queries (for `keyword`/numbers/dates — no analysis)

Term-level queries look up the value **verbatim** in the inverted index — no
lowercasing, no tokenizing. Perfect for `keyword`, numbers, booleans, dates.

```
GET /products/_search
{ "query": { "term":  { "category": "chairs" } } }          # exact keyword

GET /products/_search
{ "query": { "terms": { "brand": ["LG", "Samsung"] } } }    # any of these

GET /products/_search
{ "query": { "range": { "price": { "gte": 200, "lte": 500 } } } }

GET /products/_search
{ "query": { "exists": { "field": "rating" } } }            # field is present + non-null

GET /products/_search
{ "query": { "prefix": { "name.raw": "Ultrawide" } } }      # starts-with (on keyword)
```

Reminder from lesson 03: `term` does **not** analyze, so `term: { name: "Chair" }`
on the analyzed `text` field returns **zero hits, no error** — the stored term is
lowercased `chair`. Run term-level queries against `keyword` fields (here,
`category`, `brand`, `tags`, or the `name.raw` sub-field), never raw `text`.
`prefix` and `wildcard` are expensive (they expand across the term dictionary) —
fine for the lab, but reach for a proper `text` analyzer or `search_as_you_type`
in production.

## Combining with `bool` — the worked example

Find in-stock chairs mentioning "ergonomic" in the name, priced under 600,
ranked by textual relevance:

```
GET /products/_search
{
  "query": {
    "bool": {
      "must":   { "match": { "name": "ergonomic" } },    # scores relevance
      "filter": [
        { "term":  { "category": "chairs" } },            # no score, cached
        { "term":  { "in_stock": true } },
        { "range": { "price": { "lt": 600 } } }
      ]
    }
  }
}
#  >>> "Aeron Ergonomic Office Chair" and "Ergonomic Mesh Task Chair",
#      ranked by how well `name` matches "ergonomic"; the keyword/range
#      constraints just narrow the set without touching _score.
```

This is the canonical shape: **relevance signals in `must`/`should`, hard
constraints in `filter`.**

## Sorting and `_source` filtering

Add `sort` to order by a field instead of `_score`. You can sort on
`keyword`/numeric/date fields (they have doc values) but **not** on analyzed
`text` — that's why the mapping gives `name` a `name.raw` keyword sub-field:

```
GET /products/_search
{
  "query": { "term": { "category": "monitors" } },
  "sort": [ { "price": "desc" }, { "name.raw": "asc" } ],
  "_source": ["name", "price"]     # trim the returned document to two fields
}
```

Sorting by anything other than `_score` skips relevance computation (like a
filter). `_source` filtering (`["name", "price"]`, or `includes`/`excludes`)
shrinks the payload the coordinator ships back — cheap and worth doing on wide
documents.

## Pagination and why deep paging hurts

`from`/`size` works, but only shallowly. Recall the scatter-gather flow from
lesson 01: to return `from: 10000, size: 10`, **every shard** must produce its
top 10,010 hits and send them to the coordinator, which merges, sorts, and
discards all but 10. Cost grows with `from`, across every shard.

```
┌─ from: 10000, size: 10 ──────────────────────────────┐
│  each shard  →  builds + sends 10,010 sorted hits     │
│  coordinator →  merges N×10,010, keeps 10, drops rest │
└───────────────────────────────────────────────────────┘
```

Elasticsearch caps this at `index.max_result_window` (**10000** by default);
past it you get an error rather than a silently ruinous query. For real deep
paging or full exports, use `search_after` with a Point-in-Time (lesson 12),
which pages by a sort cursor instead of an offset and stays flat-cost.

Finally, Query DSL isn't the only way to ask: **ES|QL**, a piped query language
(`FROM products | WHERE ... | STATS ...`), is a compact alternative for
analytics-style queries — deep-dived in lesson 12.

## Cheat sheet

- `_search` returns `hits.total`, per-hit `_score` + `_source`, and `took`;
  page with `size`/`from`.
- **Query context scores; filter context is yes/no, unscored, and cached.** Put
  constraints (`term`, `range`, booleans, dates) in `filter`; relevance signals
  in `must`/`should`.
- `bool`: `must` (match + score), `filter` (match, cached, no score), `should`
  (OR-ish booster, `minimum_should_match`), `must_not` (exclude).
- **Full-text** (`match`, `match_phrase`, `multi_match`) analyzes input → use on
  `text`. **Term-level** (`term`, `terms`, `range`, `exists`, `prefix`) is
  verbatim → use on `keyword`/numbers/dates. `term` on `text` = 0 hits, silent.
- Sort on `keyword`/number/date only — use `name.raw`, not `name`. Trim results
  with `_source`.
- Deep `from`/`size` is O(shards × (from+size)); capped at
  `index.max_result_window` 10000. Use `search_after` + PIT for deep paging.

## Lab

```
# 1. shape of a response — note took, hits.total, _score
GET /products/_search
{ "query": { "match_all": {} }, "size": 3 }
#  >>> 15 total; three hits each with _score 1.0

# 2. same docs, two contexts — watch _score
GET /products/_search
{ "query": { "match":  { "category": "chairs" } } }   # query context → 3 chairs, each with a non-zero _score
GET /products/_search
{ "query": { "bool": { "filter": { "term": { "category": "chairs" } } } } }
#  >>> 3 chairs, every _score = 0.0 (filter context skips scoring)

# 3. the worked bool: relevance in must, constraints in filter
GET /products/_search
{
  "query": { "bool": {
    "must":   { "match": { "name": "ergonomic" } },
    "filter": [
      { "term":  { "category": "chairs" } },
      { "term":  { "in_stock": true } },
      { "range": { "price": { "lt": 600 } } }
    ]
  } }
}
#  >>> 2 in-stock ergonomic chairs under 600, ranked by name match

# 4. should as a booster + minimum_should_match
GET /products/_search
{
  "query": { "bool": {
    "filter": { "term": { "category": "peripherals" } },
    "should": [ { "term": { "tags": "wireless" } },
                { "term": { "tags": "premium" } } ]
  } }
}
#  >>> all peripherals returned; wireless/premium ones rank higher

# 5. sort + _source (note name.raw, not name)
GET /products/_search
{ "query": { "match_all": {} },
  "sort": [ { "rating": "desc" }, { "price": "asc" } ],
  "_source": ["name", "rating", "price"], "size": 5 }

# 6. deep-pagination guard
GET /products/_search
{ "query": { "match_all": {} }, "from": 10000, "size": 10 }
#  >>> 400: Result window is too large (index.max_result_window = 10000)
```

Next: [05 — Relevance & scoring](05-relevance-scoring.md)
