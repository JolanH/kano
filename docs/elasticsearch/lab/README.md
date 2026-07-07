# Elasticsearch lab sandbox

The runnable sandbox for the [Elasticsearch course](../README.md). A **3-node
cluster** (`es01`/`es02`/`es03`) plus **Kibana**, with TLS and authentication on
— the way Elasticsearch 9.x ships by default. Built once, reused by every
lesson.

## Layout

```
lab/
├── docker-compose.yml   # 3 es nodes + kibana + one-shot cert `setup` service
├── .env                 # STACK_VERSION, passwords, ports, heap sizes
├── seed-data.sh         # loads the `products` sample index (lessons 04-06)
└── certs/               # ca.crt copied out by seed-data.sh (git-ignored)
```

## Host prerequisite (do this first)

Every Elasticsearch node mmaps its Lucene files and enforces a **bootstrap
check** on `vm.max_map_count`. If it's too low the nodes exit immediately with
`max virtual memory areas vm.max_map_count [65530] is too low, increase to at
least [262144]`.

```bash
# temporary (until reboot)
sudo sysctl -w vm.max_map_count=262144
# permanent
echo 'vm.max_map_count=262144' | sudo tee /etc/sysctl.d/99-elasticsearch.conf
```

## Quickstart

```bash
cd docs/elasticsearch/lab

docker compose up -d            # first run pulls images + generates certs (~1-2 min)
docker compose ps               # es01/02/03 = healthy, setup = exited (0)

# cluster is green with 3 nodes?
source .env
docker compose cp es01:/usr/share/elasticsearch/config/certs/ca/ca.crt certs/ca/ca.crt
curl -s --cacert certs/ca/ca.crt -u "elastic:$ELASTIC_PASSWORD" \
  "https://localhost:$ES_PORT/_cluster/health?pretty"
#  >>> "status" : "green",  "number_of_nodes" : 3
```

Kibana comes up at **http://localhost:5601** (log in as `elastic` /
`ELASTIC_PASSWORD` from `.env`). Its **Dev Tools → Console** is where you paste
every `GET /...` snippet in the lessons — it handles auth and TLS for you.

## Two ways to run the snippets

Lessons show requests in **Console** form (`GET /_cluster/health`). Run them
either way:

- **Kibana Dev Tools** (recommended) — paste as-is, hit the ▶ button.
- **curl** — expand to the full HTTPS call:

  ```bash
  # helper for the shell examples; run once per terminal
  source .env
  es() { curl -s --cacert certs/ca/ca.crt -u "elastic:$ELASTIC_PASSWORD" \
             "https://localhost:$ES_PORT$1" "${@:2}"; }

  es /_cluster/health?pretty
  es /products/_count -X GET
  ```

## Seed the sample data

```bash
./seed-data.sh                  # (re)creates the `products` index, 15 docs
```

Used by lessons 04 (query DSL), 05 (relevance), and 06 (aggregations).

## Published ports

| Host port | Service | Notes |
|---|---|---|
| 9200 | es01 HTTP API | HTTPS only; auth required |
| 5601 | Kibana | Dev Tools console lives here |

`es02`/`es03` are reachable on the internal Docker network only — that's fine,
every client talks to the cluster through `es01`.

## Common operations

```bash
docker compose logs -f es01           # follow a node's log
docker compose restart es02           # bounce one node (watch health go yellow → green)
docker compose stop es03              # simulate a node loss (lesson 07/09)
docker compose down                   # stop, keep data volumes
docker compose down -v                # stop + wipe data AND certs (full reset)
```

## Troubleshooting

- **Nodes restart-loop** → almost always `vm.max_map_count` (see above), or the
  host mem limit is too low; each node wants ~2 GB.
- **`setup` never turns healthy** → check `docker compose logs setup`; a stale
  `certs` volume from an older run can conflict — `docker compose down -v` and
  retry.
- **TLS errors from host curl** → you're missing `--cacert certs/ca/ca.crt`, or
  the copy step didn't run. Use `-k` to skip verification in a pinch.
