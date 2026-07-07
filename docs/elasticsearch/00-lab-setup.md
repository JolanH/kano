# 00 — Lab setup

Every lesson runs against a real **3-node Elasticsearch cluster** with Kibana,
secured with TLS and passwords exactly like a production deployment. Running
three nodes from the start means sharding, replication, allocation, and master
election are things you *watch happen*, not diagrams you take on faith.

## What you're building

```
        ┌──────────── es-lab cluster ────────────┐
        │   es01        es02        es03          │   each: master-eligible
        │  (master+    (master+    (master+       │   + data + ingest
        │    data)       data)       data)        │
        └──────┬──────────────────────────────────┘
               │ https :9200 (TLS + auth)
        ┌──────▼──────┐        ┌──────────────┐
        │   your      │        │   Kibana     │  http :5601
        │   curl /    │◀──────▶│  Dev Tools   │  (paste snippets here)
        │   client    │        └──────────────┘
        └─────────────┘
```

The Docker Compose project lives in `docs/elasticsearch/lab/`. A one-shot
`setup` service generates a certificate authority and per-node certificates on
first boot, then sets the `kibana_system` password and exits. The three ES nodes
and Kibana share those certs through a named volume.

## Prerequisite: raise `vm.max_map_count`

Elasticsearch memory-maps its Lucene index files and refuses to start if the
kernel limit is too low. This is the **single most common** first-run failure.

```bash
sudo sysctl -w vm.max_map_count=262144                       # until reboot
echo 'vm.max_map_count=262144' | sudo tee /etc/sysctl.d/99-elasticsearch.conf   # permanent
```

If you skip this, the nodes exit on boot with `max virtual memory areas
vm.max_map_count [65530] is too low, increase to at least [262144]`. That
message is a **bootstrap check** — Elasticsearch runs a battery of these at
startup and refuses to form a cluster if any fail, precisely so you don't
discover the problem under load.

> **Rule of thumb.** In production the bootstrap checks (memory lock, file
> descriptors, `max_map_count`, a real discovery config) are your friend. Never
> disable them to "make it start" — fix the host.

## Bring it up

```bash
cd docs/elasticsearch/lab

docker compose up -d          # first run: pulls images, mints certs (~1-2 min)
docker compose ps             # es01/02/03 → healthy, setup → exited (0), kibana → healthy
```

Passwords and the version live in `lab/.env`. The bootstrap superuser is
`elastic` / `ELASTIC_PASSWORD`.

## Verify the cluster

Copy the CA out so host `curl` can verify TLS, then hit `_cluster/health`:

```bash
source .env
docker compose cp es01:/usr/share/elasticsearch/config/certs/ca/ca.crt certs/ca/ca.crt
curl -s --cacert certs/ca/ca.crt -u "elastic:$ELASTIC_PASSWORD" \
  "https://localhost:$ES_PORT/_cluster/health?pretty"
```

```json
{
  "cluster_name" : "es-lab",
  "status" : "green",            #  >>> green = all shards assigned
  "number_of_nodes" : 3,         #  >>> all three joined
  "number_of_data_nodes" : 3,
  "active_shards_percent_as_number" : 100.0
}
```

`green` means every primary and replica shard is assigned. `yellow` means
primaries are fine but some replica is unassigned (normal on a single node);
`red` means a primary is missing — you're losing data availability. You'll
deliberately drive the cluster yellow and back in lesson 07.

Confirm all three nodes and who's the elected master:

```bash
curl -s --cacert certs/ca/ca.crt -u "elastic:$ELASTIC_PASSWORD" \
  "https://localhost:$ES_PORT/_cat/nodes?v"
#  the node with a '*' in the master column is the elected master
```

## Kibana + Dev Tools

Open **http://localhost:5601** and log in as `elastic`. Go to **Management →
Dev Tools** (the hamburger menu, top-left). This Console is where you'll run almost every snippet in the
course — it manages auth and TLS for you, autocompletes the API, and lets you
paste a `GET /_cluster/health` and hit ▶ with zero ceremony. When a lesson
shows:

```
GET /_cluster/health
```

that's a Dev Tools request. The [lab README](lab/README.md) shows the `curl`
equivalent if you'd rather stay in the shell.

## Seed the sample data

Most query and aggregation lessons use a small `products` index:

```bash
./seed-data.sh                # (re)creates `products`, loads 15 documents
```

We walk through what that script does — mappings, `_bulk`, `refresh` — in
[lesson 02](02-documents-crud.md) and [lesson 03](03-mapping-analysis.md).

## The loop you'll repeat

```bash
# 1. run a request (Dev Tools, or curl via the `es()` helper in lab/README.md)
# 2. observe with the _cat APIs — human-readable cluster introspection
curl -s --cacert certs/ca/ca.crt -u "elastic:$ELASTIC_PASSWORD" "https://localhost:$ES_PORT/_cat/indices?v"
# 3. reset when needed
docker compose down -v        # wipe data + certs and start clean
```

## Cheat sheet

- 3 nodes, all master-eligible + data; clients talk to the cluster via `es01:9200`.
- **Raise `vm.max_map_count` to 262144** before first boot — the #1 gotcha.
- Security is **on**: HTTPS + `elastic` password; pass `--cacert` to curl or use
  Kibana Dev Tools.
- Health: `green` = all shards assigned, `yellow` = replica missing, `red` =
  primary missing.
- The `_cat/*` APIs (`nodes`, `indices`, `shards`, `health`) are your go-to
  human-readable introspection.
- `docker compose down -v` = full reset.

## Lab

1. Bring the cluster up and confirm `status: green`, `number_of_nodes: 3`.
2. Find the elected master with `_cat/nodes?v`.
3. Stop one node — `docker compose stop es03` — and re-check health. It stays
   green (no indices yet) but `_cat/nodes` now shows two. Start it again:
   `docker compose start es03`.
4. Seed the sample data and confirm `GET /products/_count` returns 15.

Next: [01 — Architecture & mental model](01-architecture.md)
