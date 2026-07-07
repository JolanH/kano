# 02 — Documents & CRUD

Elasticsearch is a document store before it's a search engine: you put JSON in,
get JSON out, address documents by `_id`. This lesson covers the read/write API
and the two things people get wrong — **refresh** (why a doc you just wrote
isn't in search yet) and **concurrency** (how not to clobber a write).

## Index a document

```
POST /products/_doc
{ "name": "Desk Lamp", "category": "lighting", "price": 39.0 }
```

`_doc` is the fixed endpoint (the old per-type name is gone — one index, one
schema). Omit the id and Elasticsearch generates one. To choose the id, use
`PUT` with an explicit id:

```
PUT /products/_doc/1000
{ "name": "Desk Lamp", "category": "lighting", "price": 39.0 }
```

The response tells you what happened:

```json
{ "_index":"products", "_id":"1000",
  "_version":1,                 #  >>> bumps on every write to this id
  "result":"created",           #  >>> "created" first time, "updated" after
  "_seq_no":42, "_primary_term":1 }   #  >>> concurrency tokens — see below
```

`PUT .../_doc/1000` is a full **upsert-by-replace**: it replaces the whole
document. To *require* creation (fail if the id exists), use the `_create`
endpoint:

```
PUT /products/_create/1000
{ ... }        # 409 conflict if 1000 already exists
```

## Get, exists, delete

```
GET  /products/_doc/1000        # full doc + metadata
GET  /products/_source/1000     # just the _source, no metadata
HEAD /products/_doc/1000        # 200 if exists, 404 if not
DELETE /products/_doc/1000
```

`GET` by id is **real-time** — it reads through the in-memory buffer, so you see
the latest version even before a refresh (unlike search; see below).

## Update: partial, scripted, upsert

`_update` changes a document without you resending the whole thing. Under the
hood it still fetches, merges, and re-indexes the full document (segments are
immutable — lesson 01), but it's atomic and saves a round trip.

```
POST /products/_update/1000
{ "doc": { "price": 34.99 } }              #  >>> partial merge
```

Scripted update (e.g. atomic increment) and upsert (insert-or-update):

```
POST /products/_update/1000
{
  "script": { "source": "ctx._source.price *= params.factor", "params": { "factor": 0.9 } },
  "upsert": { "name": "Desk Lamp", "price": 39.0 }   # used only if 1000 doesn't exist
}
```

## Bulk: the only way to write at volume

One-doc-per-request does not scale. The `_bulk` API packs many operations into a
single request using **newline-delimited JSON (NDJSON)**: an action line, then
(for index/create/update) a source line. The trailing newline is required.

```
POST /_bulk
{ "index":  { "_index": "products", "_id": "1" } }
{ "name": "Aeron Chair", "category": "chairs", "price": 1395.0 }
{ "update": { "_index": "products", "_id": "1" } }
{ "doc": { "price": 1295.0 } }
{ "delete": { "_index": "products", "_id": "99" } }
```

`_bulk` is what `seed-data.sh` uses. Key facts:

- **Partial failure is normal.** Bulk returns `200` even if some items failed —
  you *must* check the top-level `"errors": true/false` and per-item status.
  Silently ignoring this is a classic data-loss bug.
- **Size the batch by bytes, not just count** — a few MB or 1k–5k docs per
  request is a good starting range. Bigger isn't always faster (lesson 08 tunes
  this).

## Refresh: why your new doc isn't in search yet

Indexing writes to an in-memory buffer + translog. The document is **not
searchable** until a **refresh** turns the buffer into a searchable Lucene
segment. Default: every **1 second** per index that's being searched. This is
the "near-real-time" in NRT.

So this sequence surprises people:

```
POST /products/_doc/1     { ... }
GET  /products/_search    # ← may NOT include doc 1 yet (refresh hasn't run)
GET  /products/_doc/1     # ← DOES return it (get-by-id is real-time)
```

The `refresh` parameter on a write controls this:

| Value | Meaning | Use when |
|---|---|---|
| (default) | Wait for the periodic 1s refresh | Normal high-throughput indexing |
| `refresh=wait_for` | Block the call until the next scheduled refresh makes it visible | You need read-your-write and can wait ~1s |
| `refresh=true` | **Force an immediate refresh now** | Tests / one-off — creates a tiny segment; **do not** use per-doc in production, it wrecks indexing throughput and merge load |

> **Rule of thumb.** Never set `refresh=true` on hot-path writes. Use
> `wait_for`, or design around the 1s delay. Forcing refreshes is the most
> common self-inflicted indexing-performance wound.

## Concurrency: don't clobber writes

Elasticsearch has **no document locks**. Concurrent updates use **optimistic
concurrency control** via two tokens returned on every write: `_seq_no` (a
per-shard sequence number) and `_primary_term` (bumps when a shard's primary
changes). To make a write conditional on "nobody changed this since I read it",
echo them back:

```
PUT /products/_doc/1000?if_seq_no=42&if_primary_term=1
{ ... full updated doc ... }
#  >>> 409 conflict if someone else wrote 1000 in the meantime — you re-read and retry
```

This is how you implement safe read-modify-write. (There's also an internal
`_version` you can see, but `if_seq_no`/`if_primary_term` is the correct
mechanism — plain version numbers can't distinguish concurrent primaries.)

## Cheat sheet

- `POST /idx/_doc` (auto id) · `PUT /idx/_doc/{id}` (replace) · `PUT
  /idx/_create/{id}` (fail if exists).
- `_update` = fetch-merge-reindex, atomic; supports `doc`, `script`, `upsert`.
- **`_bulk` for volume** — NDJSON, trailing newline, and **always check
  `"errors"`** in the response.
- **Get-by-id is real-time; search is not** — new docs appear after the ~1s
  **refresh**.
- `refresh=wait_for` for read-your-write; **avoid `refresh=true`** on hot paths.
- Safe concurrent writes = `if_seq_no` + `if_primary_term` (optimistic locking),
  retry on 409.

## Lab

```
# 1. real-time get vs near-real-time search
POST /products/_doc/demo1
{ "name": "Refresh Test", "category": "misc", "price": 1.0 }
GET  /products/_doc/demo1         # present immediately
GET  /products/_search?q=name:Refresh   # may be empty for up to ~1s, then appears

# 2. read-your-write on demand
POST /products/_doc/demo2?refresh=wait_for
{ "name": "Wait For Test", "category": "misc", "price": 2.0 }
GET  /products/_search?q=name:Wait      # guaranteed to include demo2

# 3. optimistic concurrency — grab tokens, then force a conflict
GET  /products/_doc/demo1               # note _seq_no / _primary_term
PUT  /products/_doc/demo1?if_seq_no=<stale>&if_primary_term=1
{ "name": "Stale Write", "category": "misc", "price": 9.0 }
#  >>> 409 version_conflict_engine_exception

# 4. clean up
DELETE /products/_doc/demo1
DELETE /products/_doc/demo2
```

Next: [03 — Mapping & analysis](03-mapping-analysis.md)
