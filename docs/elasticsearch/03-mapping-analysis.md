# 03 — Mapping & analysis

Mapping is your schema; analysis is how text becomes searchable terms. Get these
right and queries are fast and correct. Get them wrong and you'll hit the two
canonical Elasticsearch surprises: **`term` on a `text` field returns nothing**,
and **a runaway mapping melts your cluster**. Both are explained here.

## Dynamic mapping (and why to distrust it)

Index a document into a fresh index and Elasticsearch infers a mapping:

```
POST /demo/_doc
{ "title": "Hello", "views": 42, "published": "2025-01-01", "active": true }

GET /demo/_mapping
```

It guesses `title → text` (with a `.keyword` sub-field), `views → long`,
`published → date`, `active → boolean`. Convenient for exploration, but three
problems in production:

- **First-seen wins.** If the first `price` it sees is `"39"` (a string), the
  field becomes `text` forever; later numeric queries break. Mapping types are
  **immutable** — you can add fields but not change an existing field's type.
  Fixing it means reindexing (lesson 12).
- **Mapping explosion.** Every new field name creates mapping entries across the
  cluster state. Indexing documents with unbounded/dynamic keys (e.g. user-
  supplied JSON) can create thousands of fields and destabilise the whole
  cluster. There's a default limit of 1000 fields per index for exactly this
  reason.
- **`text` + `keyword` on everything** doubles the work when you only needed one.

> **Rule of thumb.** Explore with dynamic mapping; **ship with an explicit
> mapping.** For semi-structured input, set `"dynamic": "strict"` (reject
> unknown fields) or `"false"` (store but don't index them) rather than letting
> the schema grow itself.

## The one distinction that matters: `text` vs `keyword`

Both hold strings. They are **completely different**:

| | `text` | `keyword` |
|---|---|---|
| Analyzed? | **Yes** — broken into terms, lowercased, etc. | **No** — stored as one exact term |
| Good for | Full-text search (`match`) | Exact match, sort, aggregate, filter (`term`) |
| `"Herman Miller"` becomes | `["herman", "miller"]` | `"Herman Miller"` (one token) |
| Sortable / aggregatable | No (no doc values by default) | Yes |

This is *the* footgun. A `term` query does an **exact term lookup** with no
analysis. Run `term: { name: "Aeron" }` against a `text` field whose stored
terms are lowercased (`aeron`) and you get **zero hits and no error** — the
query term `Aeron` never matches the indexed term `aeron`.

```
# name is `text` → analyzed to lowercase terms
GET /products/_search
{ "query": { "term": { "name": "Aeron" } } }      #  >>> 0 hits (case mismatch, silent)

GET /products/_search
{ "query": { "match": { "name": "Aeron" } } }     #  >>> works — match analyzes the query too
```

The fix used everywhere: index strings as `text` **and** as a `keyword`
sub-field (a **multi-field**), then pick per query.

## Multi-fields: index one value several ways

```
PUT /catalog
{
  "mappings": {
    "properties": {
      "name": {
        "type": "text",                              # full-text search
        "fields": {
          "raw":  { "type": "keyword" },             # exact match / sort / aggregate
          "eng":  { "type": "text", "analyzer": "english" }  # stemmed variant
        }
      }
    }
  }
}
```

Now `match` on `name`, `term`/`sort`/aggregate on `name.raw`, and stemmed
full-text on `name.eng` — one source value, three indexing strategies, no extra
data sent. The `products` index from `seed-data.sh` does exactly this
(`name` + `name.raw`).

## Analysis: how `text` becomes terms

An **analyzer** runs at both index time and query time and has three stages:

```
input ─▶ char filters ─▶ tokenizer ─▶ token filters ─▶ terms
"The Aeron Chair!"          split          lowercase,
                          on whitespace/   stopwords,
                          punctuation      stemming...
         ─▶  ["aeron", "chair"]   (standard analyzer: split, lowercase, drop "the")
```

- **Char filters** — pre-process raw text (strip HTML, map characters).
- **Tokenizer** — split into tokens (the `standard` tokenizer splits on word
  boundaries).
- **Token filters** — transform the token stream (lowercase, stop-words,
  stemming, synonyms, n-grams).

The default `standard` analyzer covers most cases. `_analyze` lets you *see* the
terms a field will produce — invaluable for debugging "why doesn't this match":

```
GET /products/_analyze
{ "field": "name", "text": "Aeron Ergonomic Chair" }
#  >>> tokens: aeron, ergonomic, chair
```

Key rule: **index-time and query-time analysis must agree.** `match` analyzes
your query with the same analyzer, which is why it works where `term` doesn't.
Change an analyzer and you must reindex — existing terms were produced by the
old one.

## Common field types worth knowing

- **Numbers:** `long`/`integer`/`double`, plus `scaled_float` (store a float as
  an integer × factor — great for money/prices) and `half_float` (cheap, low-
  precision — fine for ratings). The `products` mapping uses both.
- **`date`** — stored as epoch millis; accepts ISO strings and custom `format`s.
- **`boolean`**, **`ip`**, **`geo_point`**.
- **`object`** (nested JSON, flattened by default) vs **`nested`** (preserves
  array-of-objects relationships — use when you must query "same array element
  matched both conditions").
- **`flattened`** — collapse an object with many/unknown keys into one field:
  the escape hatch against mapping explosion for arbitrary key/value blobs.

## Cheat sheet

- **Explore dynamic, ship explicit.** Field types are **immutable** — wrong type
  means reindex.
- **`text` = analyzed, for `match`; `keyword` = exact, for `term`/sort/agg.**
  `term` on a `text` field silently returns nothing.
- Use a **multi-field** (`text` + `.raw` keyword) to get both from one value.
- Analyzer = char filters → tokenizer → token filters; **index- and query-time
  analysis must match**. Debug with `_analyze`.
- Guard against **mapping explosion**: `dynamic: strict/false`, the 1000-field
  limit, or the `flattened` type for arbitrary keys.
- `scaled_float` for money, `half_float` for cheap approximate numbers, `nested`
  for array-of-objects you must query together.

## Lab

```
# 1. see analysis in action — same text, different fields
GET /products/_analyze
{ "field": "name", "text": "Ergonomic Mesh Chair" }      # analyzed → 3 lowercase terms

GET /products/_analyze
{ "field": "category", "text": "Ergonomic Mesh Chair" }  # keyword → 1 term, verbatim

# 2. reproduce the footgun, then fix it
GET /products/_search
{ "query": { "term":  { "name": "Chair" } } }            # 0 hits (case/analysis mismatch)
GET /products/_search
{ "query": { "match": { "name": "Chair" } } }            # matches the chairs
GET /products/_search
{ "query": { "term":  { "name.raw": "Aeron Ergonomic Office Chair" } } }  # exact keyword match

# 3. prove immutability
PUT /products/_mapping
{ "properties": { "price": { "type": "text" } } }
#  >>> 400 error: cannot change type of existing field `price`
```

Next: [04 — Query DSL & search](04-query-dsl.md)
