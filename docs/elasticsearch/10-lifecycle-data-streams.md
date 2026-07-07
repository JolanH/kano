# 10 — Lifecycle & data streams

Logs, metrics, traces, events — append-only, timestamped, and *unbounded*. Nobody
edits yesterday's log line, but the data keeps arriving forever. Model that as one
giant index and you inherit every pain from lesson 07 at once: a primary that grows
past 50 GB, merges that never finish, and a shard count you can't change without a
reindex. The fix is not a bigger index — it's *many* time-bucketed indices created
and retired automatically. This lesson wires up the four pieces that do that:
**rollover**, **data streams**, **ILM**, and **snapshots/SLM**.

## Rollover: retire the write index at a threshold

Rollover flips writes from a current index to a fresh one when the current index
hits a ceiling — a max age, size, or doc count. You point writes at an *alias* (or,
better, a data stream) and let Elasticsearch make the new backing index:

```
POST /my-alias/_rollover
{
  "conditions": {
    "max_primary_shard_size": "50gb",
    "max_age": "7d",
    "max_docs": 200000000
  }
}
```

The naive alternative is a daily index named by date (`logs-2026.07.03`). It works
until volume swings: a quiet Sunday gives you a 2 MB shard, a traffic spike gives
you a 200 GB one. **Rollover decouples shard size from calendar time** — it cuts a
new index precisely when `max_primary_shard_size` says so, keeping every shard in
the ~10–50 GB sweet spot from lesson 07 regardless of ingest rate. That single
property is why rollover beats index-per-day.

## Data streams: the modern append-only abstraction

A **data stream** is a named handle over a sequence of hidden, auto-rolled backing
indices. You write to the stream name; reads span all of them; the newest one takes
writes:

```
                 data stream  "logs-app-prod"
   write ─▶ ┌──────────────────────────────────────────────┐
            │  .ds-logs-app-prod-2026.06.20-000001  (old)   │
            │  .ds-logs-app-prod-2026.06.27-000002          │  ◀─ reads span
            │  .ds-logs-app-prod-2026.07.03-000003  (write) │◀── writes here
            └──────────────────────────────────────────────┘
                 rollover ─▶ mints -000004 and moves the write pointer
```

Backing indices are named `.ds-<stream>-<date>-NNNNNN`, hidden, and immutable in
name. A stream is **append-only**: `PUT` by `_id` is rejected — you `POST` new docs
(or `op_type=create` in `_bulk`). Every document needs a `@timestamp` field, which
is how a write is routed to the current generation and how reads prune backing
indices by time range.

You don't `PUT` a data stream directly — you declare it in an **index template**
whose pattern matches the stream name, with a `data_stream: {}` block. Any write to
a matching name auto-creates the stream:

```
PUT /_index_template/logs-app
{
  "index_patterns": ["logs-app-*"],
  "data_stream": {},
  "template": {
    "settings": { "number_of_shards": 1, "number_of_replicas": 1 },
    "mappings": {
      "properties": {
        "@timestamp": { "type": "date" },
        "level":      { "type": "keyword" },
        "message":    { "type": "text" }
      }
    }
  },
  "priority": 200
}
```

On 9.x, logs-shaped streams can opt into **`logsdb` index mode**
(`"settings": { "index.mode": "logsdb" }`), which applies synthetic `_source` and
aggressive columnar storage for a large disk saving on high-volume logs — worth
enabling for anything genuinely log-like.

## ILM: phases and per-phase actions

Rollover answers *when to cut a new index*. **Index Lifecycle Management** answers
*what to do with the old ones as they age* — move them to cheaper hardware, shrink
them, freeze them, delete them. A policy is a set of **phases** an index walks
through in order:

```
hot ──▶ warm ──▶ cold ──▶ frozen ──▶ delete
(index+   (fewer   (rarely  (searchable  (reclaim
 query)    writes)  read)    snapshot)    space)
```

| Phase | Typical actions | Why |
|---|---|---|
| `hot` | `rollover`, `set_priority` | Active writes + heaviest queries; fastest tier |
| `warm` | `forcemerge`, `shrink`, `allocate`, `set_priority` | Read-mostly; merge to one segment, fewer shards |
| `cold` | `allocate`, `searchable_snapshot` | Rare reads; move to cheap disk |
| `frozen` | `searchable_snapshot` | Query straight from object storage, minimal local cache |
| `delete` | `delete` | Retention cutoff — actually frees the disk |

`allocate` moves shards onto a data tier (`data_warm`, `data_cold` — the node roles
from lesson 09), which is how ILM turns "age" into "cheaper hardware". Wire the
policy to the same template so it applies from the stream's first index:

```
PUT /_ilm/policy/logs-app-policy
{
  "policy": {
    "phases": {
      "hot":    { "actions": { "rollover": { "max_primary_shard_size": "50gb", "max_age": "7d" } } },
      "warm":   { "min_age": "7d",  "actions": { "forcemerge": { "max_num_segments": 1 }, "shrink": { "number_of_shards": 1 } } },
      "cold":   { "min_age": "30d", "actions": { "set_priority": { "priority": 0 } } },
      "delete": { "min_age": "90d", "actions": { "delete": {} } }
    }
  }
}
```

Then reference it in the template settings: `"index.lifecycle.name": "logs-app-policy"`.
Inspect where any index sits with:

```
GET /logs-app-prod/_ilm/explain
#  >>> "phase": "warm", "action": "forcemerge", "age": "9.2d"
```

- **Templates apply only to indices created *after* them.** A template is a
  stamp pressed at creation time. Register it *before* the first write; changing a
  template never retro-fits an existing index — you'd reindex or wait for the next
  rollover.
- **`min_age` is measured from rollover, not index creation.** For a data stream,
  the clock on `warm.min_age: 7d` starts when that backing index *stops being the
  write index*, not when it was minted. Read it as "7 days after this index was
  rolled off", or your data ages to `delete` far sooner than you expect.
- **Deleting via ILM is how you reclaim space — never hand-delete.** The `delete`
  phase is the only thing enforcing retention. Manually `DELETE`-ing backing indices
  fights the manager and corrupts the stream's bookkeeping; set `delete.min_age` and
  let ILM do it.

> **Rule of thumb.** One template owns the mapping, the rollover conditions, *and*
> the ILM policy for a data stream — register all three together, before the first
> document, or the stream starts life unmanaged.

## Snapshots & restore

Replicas survive a node loss; they do not survive a fat-fingered `delete`, a bad
reindex, or a cluster fire. For that you need **snapshots** into a **repository**. In
the lab, the simplest repo is a shared filesystem directory:

```
PUT /_snapshot/lab_backup
{ "type": "fs", "settings": { "location": "/usr/share/elasticsearch/backup" } }
```

The `location` must sit under a `path.repo` configured on *every* node — a security
guard so a snapshot can't be written anywhere on the host. If your lab nodes don't
have it set, this call fails; the Lab section below shows the fix. Once registered:

```
PUT /_snapshot/lab_backup/snap-1?wait_for_completion=true
{ "indices": "logs-app-prod", "include_global_state": false }

GET /_snapshot/lab_backup/_status          # bytes done, files, per-shard progress
POST /logs-app-prod/_close                 # a data stream/index must be closed to restore over it
POST /_snapshot/lab_backup/snap-1/_restore
```

Snapshots are **incremental at the segment level**: the first is a full copy, each
later one stores only segments that changed since the last. That makes frequent
snapshots cheap and is why you never delete individual segments from the repo by
hand — the snapshot metadata reference-counts them.

**Searchable snapshots** power the `cold`/`frozen` tiers: instead of restoring to
local disk, Elasticsearch queries the snapshot *in place* from the repository,
caching only the segments a query touches. A frozen index can hold a year of logs on
object storage with a few GB of local cache — you trade latency for near-zero
storage cost, ideal for data you must keep but rarely read.

## SLM: schedule the backups

A snapshot you have to remember to run is a backup you don't have. **Snapshot
Lifecycle Management** puts it on a cron with a retention policy:

```
PUT /_slm/policy/nightly
{
  "schedule": "0 30 1 * * ?",
  "name": "<nightly-{now/d}>",
  "repository": "lab_backup",
  "config": { "include_global_state": false },
  "retention": { "expire_after": "30d", "min_count": 5, "max_count": 50 }
}
```

`retention` prunes old snapshots automatically — the SLM analogue of the ILM
`delete` phase. Force a run without waiting for the schedule with
`POST /_slm/policy/nightly/_execute`.

## Cheat sheet

- **Rollover** cuts a new index at `max_primary_shard_size` / `max_age` / `max_docs`
  — keeps shards right-sized (lesson 07) regardless of volume; beats index-per-day.
- **Data streams** = append-only, `@timestamp`-required handle over hidden
  `.ds-<name>-<date>-NNNNNN` backing indices. Write to the stream (no `PUT` by `_id`);
  reads span all, writes hit the newest. Declared via an index template with
  `data_stream: {}`. Consider `index.mode: logsdb` on 9.x for logs.
- **ILM** phases `hot → warm → cold → frozen → delete`; actions `rollover`,
  `forcemerge`, `shrink`, `set_priority`, `allocate` (to a tier, lesson 09),
  `searchable_snapshot`, `delete`. Check position with `_ilm/explain`.
- Templates apply only to indices created **after** them; ILM `min_age` counts from
  **rollover**, not creation; **let ILM delete** — don't hand-delete backing indices.
- **Snapshots** are incremental into a registered repo (`fs` needs `path.repo`);
  `_snapshot/_status` for progress; **searchable snapshots** back `cold`/`frozen`.
- **SLM** = scheduled snapshots + retention (`expire_after`, `min_count`/`max_count`).

## Lab

Reuse the running 3-node cluster.

1. Register the ILM policy (`logs-app-policy` above), then the index template
   (`logs-app`) referencing it and declaring `data_stream: {}`.
2. Index a doc — `POST /logs-app-prod/_doc {"@timestamp":"2026-07-03T10:00:00Z","level":"info","message":"boot"}`
   — and confirm the stream and its first backing index exist with
   `GET /_data_stream/logs-app-prod` and `GET /_cat/indices/.ds-logs-app-prod-*?v`.
3. Force a rollover: `POST /logs-app-prod/_rollover` with no conditions, then re-run
   the `_cat/indices` call — spot a second `.ds-...-000002` backing index and note
   the write index moved. Run `GET /logs-app-prod/_ilm/explain` to see each backing
   index's phase.
4. Register the snapshot repo:
   `PUT /_snapshot/lab_backup {"type":"fs","settings":{"location":"/usr/share/elasticsearch/backup"}}`.
   **If it returns a `path.repo` error**, the lab nodes don't allow filesystem repos
   yet: add `path.repo=/usr/share/elasticsearch/backup` to each `es0*` node
   (an `elasticsearch.yml` entry or `- path.repo=...` env in `docker-compose.yml`),
   `docker compose up -d` to recreate the nodes, and retry. Then take a snapshot with
   `PUT /_snapshot/lab_backup/snap-1?wait_for_completion=true` and watch
   `GET /_snapshot/lab_backup/_status`.
5. Create an SLM policy (`nightly` above) and trigger it now with
   `POST /_slm/policy/nightly/_execute`; confirm the new snapshot in
   `GET /_snapshot/lab_backup/_all`.

Next: [11 — Search performance & tuning](11-search-tuning.md)
