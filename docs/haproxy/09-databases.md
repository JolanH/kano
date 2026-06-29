# 09 — Exposing databases (TCP mode)

Putting a database behind HAProxy is genuinely useful — a stable endpoint,
automatic failover, read scaling, connection capping — but it's also where
people get burned, because **a database is not a stateless web app**. This
lesson covers the patterns that work, the ones that quietly corrupt your day,
and full configs for Postgres, MySQL/Galera, and Redis.

## Why this is different from HTTP

In `mode tcp` HAProxy sees an opaque byte stream. Consequences that drive
*everything* below:

- **Load balancing is per-connection, not per-query.** Once a client connects,
  it's pinned to one server for the life of that TCP connection. With a
  connection pool (every real app has one), each pooled connection sticks to
  one DB server. So "round-robin across replicas" only balances *new
  connections*, not queries.
- **No query inspection.** HAProxy can't tell a `SELECT` from an `UPDATE`. It
  cannot route reads to replicas and writes to the primary by content. (That's a
  job for a SQL-aware proxy like pgpool, PgCat, ProxySQL, or app-side routing.)
- **Failover means cutting connections.** When the primary dies, existing
  connections break; clients must reconnect. HAProxy can point new connections
  at the new primary, but it can't migrate an open transaction.

Internalize this: **HAProxy gives databases a highly-available *endpoint* and
connection management — not query routing.** Design around that and it's
excellent; expect magic R/W splitting and you'll corrupt data.

## Pattern A — single primary with automatic failover (the safe default)

The most common and safest setup: one writable endpoint that always points at
the *current* primary, regardless of which physical node that is.

The trick: a health check that returns healthy **only on the primary**, plus
`backup` servers so exactly one node receives traffic.

```haproxy
defaults
    mode tcp
    timeout connect 5s
    timeout client  1h          # DB sessions are long-lived; don't kill idle pools
    timeout server  1h
    retries 3

listen pg_write
    bind :5432
    mode tcp
    option pgsql-check user kano
    # custom check: only the primary answers "I'm writable"
    # (see http-check-via-xinetd / agent pattern below for true primary detection)
    server pg_primary pg-primary:5432 check
    server pg_standby pg-replica:5432 check backup
```

`backup` means `pg_standby` gets traffic **only when `pg_primary` is down**. On
primary failure HAProxy fails new connections over to the standby. But there's a
catch: this only fails over *connections*, it does **not** promote the standby.
You need either:

- an external HA controller (**Patroni**, repmgr, pg_auto_failover) that
  promotes the standby and updates which node is primary, **or**
- a check that reflects the *real* writable state so HAProxy follows the
  controller's decision.

### Detecting the real primary (xinetd / agent check)

Patroni (the de-facto Postgres HA stack) exposes a **REST health endpoint** per
node: `GET /primary` returns 200 only on the leader, `GET /replica` only on
followers. Point HAProxy's HTTP check at it even though traffic is TCP:

```haproxy
listen pg_write
    bind :5432
    mode tcp
    option httpchk GET /primary          # Patroni REST API on :8008
    http-check expect status 200
    default-server inter 3s fall 3 rise 2 on-marked-down shutdown-sessions
    server pg1 10.0.0.1:5432 check port 8008
    server pg2 10.0.0.2:5432 check port 8008
    server pg3 10.0.0.3:5432 check port 8008

listen pg_read
    bind :5433
    mode tcp
    balance leastconn
    option httpchk GET /replica          # 200 only on replicas
    http-check expect status 200
    default-server inter 3s fall 3 rise 2
    server pg1 10.0.0.1:5432 check port 8008
    server pg2 10.0.0.2:5432 check port 8008
    server pg3 10.0.0.3:5432 check port 8008
```

This is the **canonical production Postgres-behind-HAProxy design**: two
endpoints — `:5432` write (always the single current leader, because only it
passes `GET /primary`) and `:5433` read (all current replicas, `leastconn`).
Patroni handles promotion; HAProxy's checks follow automatically within a few
seconds. **`on-marked-down shutdown-sessions`** on the write listener is
critical: when the old primary is demoted, HAProxy kills its existing
connections so clients reconnect to the new leader instead of writing to a node
that's now read-only.

> Without an HA controller, use `option pgsql-check user kano` for "is Postgres
> accepting auth'd connections" and the `backup` pattern (Pattern A) for a
> manual/simple failover. The Patroni pattern is what you want for real
> automatic failover.

## Pattern B — read scaling (split endpoints, app cooperates)

HAProxy can't split reads/writes by query, but **your app can choose an
endpoint**. Most ORMs/drivers support a primary DSN and a replica DSN:

- writes + read-your-writes → `:5432` (write endpoint, the leader)
- analytics / dashboards / eventually-consistent reads → `:5433` (read endpoint,
  `leastconn` across replicas)

This pushes the routing decision to where the knowledge is (the code knows if a
query must be consistent), and HAProxy provides a stable, balanced, HA endpoint
for each role. For Kano's Flask app that means configuring two SQLAlchemy
engines/binds — write to one, route reporting queries to the other.

**Replication lag caveat:** a read on `:5433` immediately after a write on
`:5432` may not see the write. Only route *lag-tolerant* reads to replicas.
You can even gate a replica out of rotation when it lags using an agent check
that reports lag (below).

## The connection-pooling interaction (read this)

Almost every app uses a client-side pool (SQLAlchemy `pool_size`, HikariCP,
pgbouncer). Two things to get right:

1. **Long pooled connections + per-connection balancing = lumpy distribution.**
   If your pool opens 10 connections once at startup, `leastconn` balances those
   10 across replicas and then they basically never move. That's usually fine,
   but don't expect query-level evenness.
2. **Idle timeouts must agree.** If HAProxy's `timeout client/server` is shorter
   than the pool's idle-connection lifetime, HAProxy silently cuts idle pooled
   connections and the app gets random "server closed the connection
   unexpectedly" errors. **Set DB-mode timeouts long** (`1h`+) or, better, set
   them *longer than* the pool's `idle_timeout`/`max_lifetime`, and enable
   TCP keepalives:
   ```haproxy
   defaults
       mode tcp
       timeout client 1h
       timeout server 1h
       option clitcpka              # TCP keepalive toward client
       option srvtcpka              # TCP keepalive toward server
       option tcplog
   ```

Consider running **pgbouncer** *behind* HAProxy (HAProxy → pgbouncer → Postgres)
so connection multiplexing is handled by the right tool and HAProxy just does
HA/failover. That's a common, robust topology.

## Preserving the client IP: PROXY protocol

In TCP mode the DB sees HAProxy's IP for every connection — bad for
`pg_hba.conf` rules and audit logs. Use the **PROXY protocol** to carry the real
client address:

```haproxy
    server pg1 10.0.0.1:5432 check send-proxy-v2
```

Postgres supports PROXY protocol... only via a helper in some setups; pgbouncer
supports it natively (`so_reuseport`/`proxy = 1`-style config). Check your DB's
support before enabling — if the backend doesn't speak PROXY protocol, it'll
choke on the prepended header. When in doubt, terminate PROXY protocol at
pgbouncer.

## MySQL / Galera (multi-primary) example

Galera is multi-primary, but writing to all nodes at once invites deadlocks/cert
failures. Common pattern: **write to one node, others as backup; read across
all.** Plus a check that excludes nodes not in `Synced` state.

```haproxy
listen galera_write
    bind :3306
    mode tcp
    balance source
    option mysql-check user haproxy
    server g1 10.0.0.1:3306 check
    server g2 10.0.0.2:3306 check backup
    server g3 10.0.0.3:3306 check backup

listen galera_read
    bind :3307
    mode tcp
    balance leastconn
    option mysql-check user haproxy
    server g1 10.0.0.1:3306 check
    server g2 10.0.0.2:3306 check
    server g3 10.0.0.3:3306 check
```

For real Galera you want an **agent/xinetd check** (the classic
`clustercheck` script, or `mysqlchk` over xinetd) that reports a node DOWN
unless `wsrep_local_state_comment = Synced` and it's not read-only/donor —
`option mysql-check` alone won't catch a node that's joined but not synced.

## Redis (primary/replica with Sentinel) example

Redis Sentinel promotes a new primary on failure. HAProxy gives clients a stable
write endpoint by health-checking which node currently answers `role:master`:

```haproxy
listen redis_write
    bind :6379
    mode tcp
    balance first
    option tcp-check
    tcp-check connect
    tcp-check send AUTH\ yourpassword\r\n        # if auth enabled
    tcp-check expect string +OK
    tcp-check send PING\r\n
    tcp-check expect string +PONG
    tcp-check send info\ replication\r\n
    tcp-check expect string role:master          # only the primary passes
    server r1 10.0.0.1:6379 check inter 1s
    server r2 10.0.0.2:6379 check inter 1s
    server r3 10.0.0.3:6379 check inter 1s
```

The scripted `tcp-check` is the star: it walks the Redis protocol and only marks
a node UP for the write endpoint if `INFO replication` reports `role:master`.
After a Sentinel failover, the new primary starts reporting `role:master`,
passes the check, and HAProxy steers writes to it — usually within 1–2s with
`inter 1s`. A parallel `redis_read` listener can expect `role:slave` (or accept
all) for read scaling.

## Agent checks for lag/load-aware DB routing

An **agent check** (lesson 04) lets a tiny sidecar on each DB node report
weight/state based on real conditions — replication lag, connection count, sync
state. Example: a script that returns `drain` when `pg_last_xact_replay` lag >
10s, so a lagging replica leaves the read pool automatically, then `ready` when
it catches up. This is how you keep stale replicas out of rotation without app
changes.

## TLS to the database

You can terminate or pass through DB TLS:

- **Passthrough** (recommended for DBs): `mode tcp`, don't touch the TLS — the
  client and DB negotiate TLS end-to-end; HAProxy just forwards bytes. The DB
  keeps cert ownership and you keep true end-to-end encryption. (You lose
  `pgsql-check`'s auth handshake unless you check a separate plaintext/health
  port — use the Patroni REST check, which is independent.)
- **Re-encrypt**: terminate client TLS, open new TLS to the DB
  (`server ... ssl verify required ...`). Adds CPU and a trust boundary; rarely
  worth it for databases vs passthrough.

For Postgres specifically, note its TLS is negotiated *inside* the protocol
(`SSLRequest`), so plain SNI routing doesn't apply — passthrough just works.

## What HAProxy does NOT solve for databases

Be honest with stakeholders:

- ❌ **No query-based read/write split** — use app-side routing or a SQL proxy.
- ❌ **No automatic promotion** — use Patroni/repmgr/Sentinel/Orchestrator;
  HAProxy only *follows* the elected topology via checks.
- ❌ **No transaction migration on failover** — open transactions die; the app
  must retry. Make writes idempotent/retryable.
- ❌ **No multi-write conflict resolution** — that's the DB's (Galera/CRDB) job.
- ✅ **What it does give you:** one stable HA endpoint per role, fast failover of
  *new* connections, `leastconn` read balancing, per-server connection caps
  (`maxconn` protects the DB from connection storms), and IP preservation.

## Lab

Bring up the DB tier and prove failover of the write endpoint with the simple
`backup` pattern.

```bash
cd docs/haproxy/lab
# set up the replica once (base backup from primary). Simplified for the lab:
docker compose --profile db up -d pg-primary
# (replica wiring: pg_basebackup -h pg-primary -U kano -D /var/lib/postgresql/data -R
#  then start pg-replica; for the lab you can also just run two primaries to see
#  connection-level failover behavior.)
docker compose --profile db up -d pg-replica

# use the Pattern A listener (pg_write with primary + standby backup), then:
docker compose restart haproxy

# connect through HAProxy
PGPASSWORD=change-me psql -h localhost -p 5432 -U kano -d kano -c 'select inet_server_addr();'

# kill the primary; new connections fail over to the standby (backup)
docker compose stop pg-primary
sleep 6   # let fall*inter elapse
PGPASSWORD=change-me psql -h localhost -p 5432 -U kano -d kano -c 'select inet_server_addr();'
# ^ now answered by the standby's address

# watch HAProxy mark it down
docker compose logs --tail=5 haproxy | grep -i 'is DOWN\|backup'
```

For the read endpoint, point a second `psql -p 5433` and run `select`s; with
both replicas up and `balance leastconn`, new connections spread across them.

## Cheat sheet

- DBs → `mode tcp`. LB is **per-connection**, no query routing, no auto-promote.
- Postgres production: **Patroni** + two listeners — `:5432` write
  (`httpchk GET /primary`, `on-marked-down shutdown-sessions`) and `:5433` read
  (`httpchk GET /replica`, `leastconn`).
- Simple/manual: `option pgsql-check` + primary `server` + `backup` standby.
- Match timeouts to your **connection pool** (`timeout 1h`, `clitcpka`/`srvtcpka`)
  or you'll get phantom connection drops.
- Preserve client IP with `send-proxy-v2` (only if the DB/pgbouncer speaks it).
- Protocol-aware checks: `pgsql-check`, `mysql-check`, scripted `tcp-check` for
  Redis `role:master`. Agent checks for lag-aware routing.
- TLS: **passthrough** for DBs (end-to-end, DB owns cert).
- Pair with **pgbouncer** for pooling; HAProxy for HA/failover.

Next: [10 — Security & traffic shaping](10-security.md)
