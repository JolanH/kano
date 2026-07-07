# 08 — Indexing performance

Reads get the attention, but a cluster that can't ingest fast enough falls over
long before search does. Slow indexing usually isn't Elasticsearch being slow —
it's you paying for durability, visibility, and redundancy you didn't need
during a bulk load, one document at a time. This lesson is about knowing which
of those costs you're paying and turning the dials down while a load runs, then
turning them back up. Everything here builds on the write path from lesson 01
and the `_bulk` mechanics from lesson 02 — we won't re-explain NDJSON or
`if_seq_no`.

## The write path, as a set of costs

Every knob below maps to one stage of this pipeline:

```
      indexing request
            │
            ▼
   ┌──────────────────┐        append (fsync?)     ┌───────────┐
   │ in-memory buffer │ ─────────────────────────▶ │  translog │  durability
   └──────────────────┘                            └───────────┘
            │ refresh (~1s, or refresh_interval)
            ▼
      new SEGMENT  ──── searchable now, but NOT yet durable on its own
            │ flush: Lucene commit (fsync segments) + trim translog
            ▼
    committed segments ──── background MERGE combines small → big
```

Read it as three independent costs. **Refresh** controls *visibility* (how soon
a doc is searchable) and how many small segments you spawn. The **translog**
controls *durability* (surviving a crash before the next flush). **Merges**
reclaim the churn both of those create. Tuning indexing is deciding, per stage,
how much you actually need while the load runs.

## `refresh_interval`: stop making tiny segments

The default 1s refresh is a read-latency feature: it makes writes visible fast.
During a bulk load nobody is searching the half-loaded index, so that 1s cadence
just manufactures hundreds of tiny segments that immediately have to be merged —
pure overhead. Raise the interval, or disable it outright, for the duration:

```
PUT /products/_settings
{ "index": { "refresh_interval": "30s" } }
```

For a one-shot backfill you can go further and disable periodic refresh
entirely, then force one refresh at the end:

```
PUT /products/_settings
{ "index": { "refresh_interval": "-1" } }
# ... run the bulk load ...
POST /products/_refresh
PUT /products/_settings
{ "index": { "refresh_interval": "1s" } }      # restore
```

**Restore it afterwards.** `-1` left on a live index means new docs never become
searchable — a genuinely mysterious "my writes aren't showing up" incident.
Treat the raise/restore as a paired operation around the load.

## Translog durability: `request` vs `async`

The translog is the write-ahead log that lets a refreshed-but-not-yet-flushed
segment survive a crash. By default (`durability: request`) Elasticsearch
`fsync`s the translog on *every* indexing request before acking it — that fsync
is often the single biggest per-request cost. Switching to `async` fsyncs on a
timer (`sync_interval`, default 5s) instead, trading a bounded data-loss window
for throughput:

```
PUT /products/_settings
{ "index": {
    "translog.durability": "async",
    "translog.sync_interval": "30s"
} }
```

| `durability` | fsync when | Throughput | Crash risk |
|---|---|---|---|
| `request` (default) | Before acking every write | Lower | None acked-then-lost — a `200` means it's on disk |
| `async` | Every `sync_interval` | Higher | Writes in the last `sync_interval` can be lost on node crash |

**`async` lies about durability by design.** A `200` no longer means "fsynced".
Fine for a reload-from-source backfill (just re-run the load), dangerous for a
system of record. Scope it to the load window, not to your steady state.

## Bulk sizing: bytes over count, saturate with clients

Lesson 02 established `_bulk` as the only sane way to write at volume and that
you must check `"errors"`. Two tuning points on top of that:

- **Size by bytes, not document count.** "5000 docs" means nothing when one doc
  is 200 bytes and another embeds a 50 KB blob. Aim for a few MB of request
  body (a common sweet spot is **5–15 MB**, roughly 1k–5k typical docs), then
  *measure* — plot docs/sec against batch size and stop where the curve flattens.
  Too-large batches cause memory pressure and long GC pauses, not more speed.
- **One client won't saturate the cluster.** A single bulk stream leaves most of
  your shards idle. Run **several concurrent bulk clients** (start around the
  number of data nodes and climb until throughput plateaus or `429`s / write
  rejections appear). The `write` thread pool is bounded — pushing past it just
  fills the queue.
- **Check every item, not just the request.** A bulk request returns `200` even
  when individual items fail (mapping conflict, version conflict). Iterate
  `items[]` and inspect per-item `status`; a `429` on an item means back off and
  retry *that* item, not the whole batch.

## Replicas: load at zero, restore after

Each replica repeats the full indexing work on another node — index into a
2-replica index and you're doing the work three times. For a large initial load
into a *new* index, set replicas to zero, load, then restore:

```
PUT /products/_settings
{ "index": { "number_of_replicas": 0 } }
# ... bulk load ...
PUT /products/_settings
{ "index": { "number_of_replicas": 1 } }   # ES builds replicas by copying finished segments
```

Restoring replicas copies already-merged segments across the network instead of
re-indexing — much cheaper than having indexed with replicas on the whole time.

| Replicas during load | Indexing cost | Availability while loading |
|---|---|---|
| `1`+ (steady-state) | Every doc indexed on N+1 nodes | Full HA throughout |
| `0` (load window) | Each doc indexed once | A node loss loses the shard — only safe when the source is replayable |

**Only drop to zero when you can re-run the load.** For an initial import from a
system of record, fine. For appending to a live production index that's also
serving reads, the availability hit usually isn't worth it.

## Cheaper documents: ids, `doc_values`, `_source`, mappings

- **Let Elasticsearch generate ids.** An explicit `PUT .../_doc/{id}` forces a
  "does this id already exist?" lookup (an append turns into a potential update).
  Auto-ids (`POST /idx/_doc`) skip that check and index strictly faster. Use
  explicit ids only when you genuinely need idempotent upserts.
- **Never `refresh=true` per document** (lesson 02). It creates a one-doc
  segment per write — the most common self-inflicted indexing wound. This is why
  it's the one rule of thumb below.
- **Drop `doc_values` on fields you never sort, aggregate, or script on.** Doc
  values are the columnar store (lesson 01) built at index time for every
  non-text field by default — real disk and CPU cost. A high-cardinality
  `keyword` you only ever filter or fetch doesn't need them:

  ```
  "sku": { "type": "keyword", "doc_values": false }
  ```

  | `doc_values` | Disk & index cost | Can sort/aggregate/script? |
  |---|---|---|
  | `true` (default, non-text) | Higher | Yes |
  | `false` | Lower | No — `term` filter and fetch still work |

- **Keep `_source` on.** It's tempting to disable it to save space, but `_source`
  is what powers reindex, update, highlighting, and the `_reindex`-based
  zero-downtime migrations in lesson 12. Disabling it is almost always a mistake
  you discover months later when you can't reshape the index.
- **Mapping discipline.** Every mapped field costs indexing time and memory, and
  dynamic mapping on messy input causes field explosion (lesson 03). Fewer,
  deliberate fields index faster — disable `dynamic` or use `strict` mappings on
  high-volume indices.

## Index sorting: pay at write time to save at read time

`index.sort.field` keeps each segment physically sorted at index time. It costs
throughput while loading, but lets certain queries **early-terminate** — once
enough sorted hits are found the shard stops scanning. It only helps when your
common query sorts on the same field (e.g. a time-series index sorted by
timestamp descending), and it can only be set **at index creation**:

```
PUT /events
{ "settings": { "index": {
    "sort.field": "created",
    "sort.order": "desc"
} } }
```

> **Rule of thumb.** During a big load: raise `refresh_interval`, drop
> `number_of_replicas` to `0`, and never `refresh=true` per document — then
> restore refresh and replicas when it's done.

## Monitoring: is the write pipeline the bottleneck?

Two things tell you whether indexing is actually the constraint:

```
GET /_cat/thread_pool/write?v&h=node_name,active,queue,rejected
GET /_nodes/stats/indexing
```

A persistently full `write` queue and climbing `rejected` counts mean the
cluster can't keep up — add bulk concurrency only if `active` is below the pool
size, otherwise you need bigger batches, fewer replicas, or more data nodes.
`_nodes/stats/indexing` exposes `index_total`/`index_time_in_millis` (per-doc
indexing cost) and, tellingly, `refresh` and `merges` totals — if merge time
dominates, your `refresh_interval` is too low and you're drowning in tiny
segments.

## Cheat sheet

- Write path = **buffer + translog (durability)** → **refresh → segment
  (visibility)** → **flush (Lucene commit, trims translog)** → **merge**. Each
  is a separately tunable cost.
- **`refresh_interval`**: `30s` or `-1` during bulk loads to cut segment churn;
  `POST /idx/_refresh` at the end and **restore** the interval.
- **`translog.durability`**: `request` = fsync every write (safe); `async` +
  `sync_interval` = faster but a crash loses the last interval. Scope `async` to
  the load window.
- **Bulk**: size by **bytes** (~5–15 MB), measure the curve, run **multiple
  concurrent clients**, check per-item `status` not just the request.
- **Replicas `0`** for an initial load into a new index, then restore — only
  when the source is replayable.
- Prefer **auto-ids**; never `refresh=true` per doc; drop **`doc_values`** on
  never-sorted/aggregated fields; **keep `_source`**; keep mappings lean.
- **Index sorting** (`index.sort.*`) is set at creation and pays off only for
  matching sort queries via early termination.
- Watch `_cat/thread_pool/write` (queue/rejected) and `_nodes/stats/indexing`.

## Lab

Measure the effect of the two biggest levers on the lab. Time a baseline load,
then a tuned one:

```
# 1. Baseline: default settings, force visibility per request (the anti-pattern)
DELETE /perf
PUT /perf
POST /perf/_bulk?refresh=true
{ "index": {} }
{ "name": "row 1", "n": 1 }
{ "index": {} }
{ "name": "row 2", "n": 2 }
# ... note `took` in the response ...

# 2. Tuned: no replicas, refresh off, one refresh at the end
DELETE /perf
PUT /perf
{ "settings": { "index": {
    "number_of_replicas": 0,
    "refresh_interval": "-1",
    "translog.durability": "async"
} } }
POST /perf/_bulk        # same body, note `took` is lower
{ "index": {} }
{ "name": "row 1", "n": 1 }
{ "index": {} }
{ "name": "row 2", "n": 2 }
POST /perf/_refresh

# 3. Inspect the cost you just avoided: count segments and merge activity
GET /perf/_segments?verbose=false
GET /_nodes/stats/indexing
GET /_cat/thread_pool/write?v&h=node_name,active,queue,rejected

# 4. Restore production settings, then clean up
PUT /perf/_settings
{ "index": { "number_of_replicas": 1, "refresh_interval": "1s",
             "translog.durability": "request" } }
DELETE /perf
```

Compare the two `took` values and the segment counts — the tuned load does the
same work with far less churn. Re-run step 1 with many small `refresh=true`
requests to feel how fast segment count (and merge pressure) explodes.

Next: [09 — Cluster operations & scaling](09-cluster-ops.md)
