# kano-mcp

An [MCP](https://modelcontextprotocol.io) server that exposes the **Kano API** to MCP clients
(Claude Desktop, Claude Code, the MCP Inspector, …). It lets a model create and read **projects**
and **features**.

> Learning to build this from scratch? Read **[TUTORIAL.md](./TUTORIAL.md)** — it explains every MCP
> concept and builds this server step by step. This README is just how to run the finished result.

## What it exposes

| Kind | Name | What it does |
| --- | --- | --- |
| Tool | `create_project` | Create a project (`name`, `version`). |
| Tool | `create_feature` | Add a feature to a project; handles the epoch-bump 409. |
| Tool | `list_projects` | List all projects. |
| Tool | `get_project` | Get one project + its current-epoch features. |
| Tool | `list_features` | List a project's features at a given epoch. |
| Resource | `kano://projects` | All projects as JSON. |
| Resource | `kano://projects/{project_id}` | One project as JSON. |
| Prompt | `kickoff_prioritization` | Template to start a project and seed features. |

## Prerequisites

- Python ≥ 3.10 and [`uv`](https://docs.astral.sh/uv/).
- A running Kano backend. From the repo root: `docker compose up --build`
  (health check: `GET http://localhost:5001/api/v1/health` — compose maps the API to host port 5001).

## Install & configure

```bash
cd kano-mcp
uv sync                 # create the venv and install deps
cp .env.example .env    # set KANO_API_BASE if your backend isn't on :5000
```

`KANO_API_BASE` defaults to `http://localhost:5001/api/v1`.

## Configuration

| Variable | Default | Applies to | Meaning |
| --- | --- | --- | --- |
| `KANO_API_BASE` | `http://localhost:5001/api/v1` | both | Where the Kano API lives (host port 5001 under docker). |
| `KANO_MCP_TRANSPORT` | `stdio` | both | How clients connect to this server: `stdio` \| `streamable-http` \| `sse`. |
| `KANO_MCP_HOST` | `127.0.0.1` | HTTP/SSE | Interface to bind; use `0.0.0.0` for non-local clients. |
| `KANO_MCP_PORT` | `8000` | HTTP/SSE | Port to listen on; endpoint is `http://HOST:PORT/mcp`. |

## Run & explore

The server runs over **stdio** (default) or **Streamable HTTP**. Explore it either way with the
[MCP Inspector](https://github.com/modelcontextprotocol/inspector).

**stdio — Inspector launches the server (simplest for local dev):**

```bash
uv run mcp dev kano_mcp/server.py        # boots proxy + Inspector + server, opens the UI
# or run the bare stdio server (what a desktop host launches):
uv run kano-mcp
```

`mcp dev` is **always stdio** (`KANO_MCP_TRANSPORT` is ignored here). The spawned server inherits your
shell env, so `KANO_API_BASE=… uv run mcp dev …` to point at a different backend.

**Streamable HTTP — you run the server, attach the Inspector:**

```bash
# terminal 1
KANO_MCP_TRANSPORT=streamable-http uv run kano-mcp   # → http://127.0.0.1:8000/mcp
# terminal 2
npx @modelcontextprotocol/inspector
#   UI: Transport Type = "Streamable HTTP", URL = http://127.0.0.1:8000/mcp
```

> **HTTP won't connect?** Two usual causes: (1) you used `mcp dev` (stdio-only) — for HTTP you must run
> the server yourself and attach a standalone Inspector; (2) recent Inspectors require a **proxy auth
> token** — use the pre-filled URL it prints, paste the token in *Configuration → Proxy Auth Token*, or
> for local-only use `DANGEROUSLY_OMIT_AUTH=true npx @modelcontextprotocol/inspector`. See
> [TUTORIAL.md](./TUTORIAL.md#exploring-your-server-with-the-mcp-inspector) for the full troubleshooting table.

## Connect to a client

**Claude Code:**

```bash
claude mcp add kano -- uv --directory /ABSOLUTE/PATH/TO/kano-mcp run kano-mcp
```

**Claude Desktop** — add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "kano": {
      "command": "uv",
      "args": ["--directory", "/ABSOLUTE/PATH/TO/kano-mcp", "run", "kano-mcp"]
    }
  }
}
```
