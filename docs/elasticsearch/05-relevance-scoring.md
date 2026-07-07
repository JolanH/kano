# 05 — Relevance & scoring

A filter answers a yes/no question; a query answers "how well?". The moment you
leave filter context, every hit carries a `_score` — a float that decides the
order of your results. Get relevance wrong and the right document is on page 3.
This lesson is about *where that number comes from*, how to read it, and the
levers you pull to move a document up or down without lying to your users.

## What `_score` is

`_score` is a positive float Elasticsearch computes **per matching document, per
query**, then sorts on by default (descending). It is not a probability, not a
percentage, and not stable across queries. It exists only to rank *this* result
set. Ask for it explicitly with a bare `match`:

```
GET /products/_search
{ "query": { "match": { "name": "ergonomic chair" } } }
#  >>> hits sorted by _score desc; chairs whose name contains both terms score highest
```

Add a `sort` clause and scoring is skipped entirely (`_score` comes back
`null`) — sorting by a field is cheaper because Lucene never runs the scoring
math. Filter context (`bool.filter`, `constant_score`) is the same: match/no-
match only, no `_score` contribution, and cacheable.

## BM25: the three levers

The default `similarity` is **BM25** (Okapi BM25), Lucene's since 6.x. Skip the
formula; internalise the three inputs it balances for every `term`:

```
term frequency (TF)   how often the term appears IN the document  ── more = higher, but SATURATING
inverse doc freq (IDF) how RARE the term is across the shard       ── rarer = higher
field length          how long the matched field is               ── shorter field = higher
```

- **TF — saturating, not linear.** A doc mentioning `chair` five times is more
  relevant than one mentioning it once, but not five times as relevant. BM25
  bends the curve so the 20th occurrence barely moves the needle. This is the
  key improvement over the old TF/IDF, which grew without bound.
- **IDF — rare terms weigh more.** `ergonomic` appears in a handful of our docs;
  `chair` in fewer still versus a corpus of common words. A term that matches
  almost everything tells you nothing, so BM25 discounts it. This is why a match
  on a distinctive brand outranks a match on a generic noun.
- **Field length — short fields win.** A term found in a 3-word `name` is a
  stronger signal than the same term buried in a 300-word description. BM25
  normalizes by field length (relative to the field's average).

## Reading a real score: `_explain`

Two ways to see the math. `"explain": true` on a search annotates every hit;
the `_explain` API dissects one document by id.

```
GET /products/_explain/6
{ "query": { "match": { "name": "ergonomic chair" } } }
```

The response is a nested tree of `description`/`value`/`details`. You'll see the
score decompose into a `sum` of two `weight(name:ergonomic)` and
`weight(name:chair)` clauses, each breaking down into `boost`, `idf`
(with `n` = docs containing the term and `N` = total docs), and `tf`
(with the field-length terms `dl` and `avgdl`). Read it top-down: the root
`value` is the `_score`, children explain the contributions. When a result
ranks "wrong", `_explain` almost always shows why in the `idf` or `tf` node.

## Scores are not comparable across queries — or shards

Two traps:

- **Across queries/indices.** A `_score` of `6.1` from one query says nothing
  about a `2.4` from another. Different terms, different IDF, different length
  norms. Never threshold a fixed number across unrelated searches, and never
  compare scores between two indices.
- **Per-shard IDF (the tiny-index gotcha).** IDF is computed **per shard**, not
  cluster-wide. Each shard only knows its own document frequencies. On a large,
  evenly-distributed index this washes out; on a small one it does not. Our
  `products` index has a single shard so we dodge it — but split it across
  shards and identical documents could score differently depending on which
  shard they landed on. The fix is `dfs_query_then_fetch`, which runs a
  preliminary round to gather **global** term frequencies before scoring:

```
GET /products/_search?search_type=dfs_query_then_fetch
{ "query": { "match": { "name": "ergonomic mesh chair" } } }
```

> **Rule of thumb.** If test relevance looks erratic on a small or multi-shard
> index, add `search_type=dfs_query_then_fetch` before you suspect BM25 — it's
> almost always per-shard IDF skew, not the algorithm.

## Boosting: nudging the ranking

From cheapest to most powerful:

| Technique | Where | Effect |
|---|---|---|
| Field boost `^` | `multi_match` fields | Weight one field over another |
| Query-time `boost` | any leaf query | Scale that clause's contribution |
| `should` clauses | `bool` | Optional matches add score, don't filter |
| `boosting` query | top level | **Demote** without excluding |

**Field boost** — a name match should beat a tag match:

```
GET /products/_search
{ "query": { "multi_match": {
    "query": "ergonomic", "fields": ["name^3", "tags"] } } }
#  >>> name matches count triple; tag-only matches trail
```

**`should` to nudge** — return all chairs, but float the premium ones up. In a
`bool`, `should` clauses that aren't required simply add to `_score`:

```
GET /products/_search
{ "query": { "bool": {
    "filter": [ { "term": { "category": "chairs" } } ],
    "should": [ { "term": { "tags": "premium" } } ] } } }
```

**`boosting` query — demote, don't drop.** Show everything but push discontinued
or out-of-stock items down instead of hiding them:

```
GET /products/_search
{ "query": { "boosting": {
    "positive": { "match": { "name": "chair" } },
    "negative": { "term":  { "in_stock": false } },
    "negative_boost": 0.3 } } }
#  >>> out-of-stock chairs still appear, at 30% of their score
```

## `function_score`: relevance × business signal

When ranking must fold in a signal BM25 can't see — a rating, freshness, price
proximity — reach for `function_score`. It multiplies (or replaces) the query
score with functions you define. One worked example: rank chairs by text
relevance, boosted by `rating`, with newer products favoured via a `gauss`
decay on `created`.

```
GET /products/_search
{ "query": { "function_score": {
    "query": { "match": { "name": "chair" } },
    "functions": [
      { "field_value_factor": {
          "field": "rating", "factor": 1.2, "modifier": "sqrt", "missing": 1 } },
      { "gauss": { "created": { "origin": "now", "scale": "90d", "decay": 0.5 } } }
    ],
    "score_mode": "sum",       # combine the functions with each other
    "boost_mode": "multiply"   # then combine with the query _score
} } }
```

- **`field_value_factor`** turns `rating` into a multiplier; `modifier: sqrt`
  keeps a 4.8 from crushing a 4.2, `missing` guards null fields (and avoids a
  hard error).
- **decay functions** (`gauss`, `exp`, `linear`) score by distance from an
  `origin`: full weight at `origin`, falling to `decay` (0.5 here) at one
  `scale` away. Great for **recency** (`created`) or **price proximity** to a
  target. `gauss` is the smooth default; `exp` drops fast then flattens;
  `linear` is a straight ramp to zero.
- **`score_mode`** combines functions with each other (`sum`/`avg`/`max`/
  `multiply`/`first`); **`boost_mode`** combines the result with the query score
  (`multiply`/`sum`/`replace`). Mixing these up is the classic
  `function_score` bug — `boost_mode: replace` silently throws away BM25.

## Precision vs recall, practically

Relevance is a dial between returning *everything relevant* (recall) and *only*
relevant things (precision):

- **Broaden (more recall):** put terms in `should` with `minimum_should_match`
  so any N-of-M can match; use `match` (OR) over `match_phrase`; add `fuzziness`.
- **Tighten (more precision):** move constraints into `filter`; use
  `match_phrase` for exact word order; raise `minimum_should_match`.

```
GET /products/_search
{ "query": { "match": {
    "name": { "query": "ergonomic mesh desk", "minimum_should_match": "2" } } } }
#  >>> docs matching any 2 of the 3 terms — looser than the implicit AND, tighter than OR
```

- **`min_score` is a blunt instrument.** `{"min_score": 1.5}` drops hits below a
  threshold, but since scores aren't stable across queries you can't hard-code
  one that stays sensible. Use it for exploratory culling, not as a contract.
- **Semantic relevance.** BM25 is lexical — it can't match "office seat" to
  "chair". For vector/kNN semantic ranking see lesson 12.

## Cheat sheet

- `_score` ranks **one** result set; not a probability, not comparable across
  queries or indices. `sort`/filter context skip it.
- **BM25 levers:** TF (saturating), IDF (rarer = higher, **per-shard**), field
  length (shorter = higher).
- **`_explain`/`"explain": true`** decompose a score into `idf`/`tf`/`boost`.
- Tiny or multi-shard index scoring erratic? `search_type=dfs_query_then_fetch`.
- Boost order of reach: field `^`, query `boost`, `should` nudge, `boosting`
  (demote via `negative`/`negative_boost`).
- `function_score`: `field_value_factor` for signals, decay (`gauss`/`exp`/
  `linear`) for recency/proximity; mind `score_mode` vs `boost_mode`.
- Recall via `should`+`minimum_should_match`/OR; precision via `filter`/phrase.
  `min_score` is fragile.

## Lab

```
# 1. see the score, then explain it
GET /products/_search
{ "query": { "match": { "name": "ergonomic chair" } } }

GET /products/_explain/6
{ "query": { "match": { "name": "ergonomic chair" } } }   # read idf + tf on doc 6

# 2. field boost — name beats tags
GET /products/_search
{ "query": { "multi_match": { "query": "ergonomic", "fields": ["name^3", "tags"] } } }

# 3. demote, don't drop, out-of-stock items
GET /products/_search
{ "query": { "boosting": {
    "positive": { "match": { "name": "monitor" } },
    "negative": { "term": { "in_stock": false } }, "negative_boost": 0.3 } } }

# 4. function_score: relevance × rating × recency
GET /products/_search
{ "query": { "function_score": {
    "query": { "match": { "name": "desk" } },
    "functions": [
      { "field_value_factor": { "field": "rating", "modifier": "sqrt", "missing": 1 } },
      { "gauss": { "created": { "origin": "now", "scale": "90d", "decay": 0.5 } } } ],
    "boost_mode": "multiply" } } }

# 5. per-shard skew — compare ordering with and without dfs
GET /products/_search?search_type=dfs_query_then_fetch
{ "query": { "match": { "name": "ergonomic mesh chair" } } }
```

Next: [06 — Aggregations](06-aggregations.md)
