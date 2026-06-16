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
  (health check: `GET http://localhost:5000/api/v1/health`).

## Install & configure

```bash
cd kano-mcp
uv sync                 # create the venv and install deps
cp .env.example .env    # set KANO_API_BASE if your backend isn't on :5000
```

`KANO_API_BASE` defaults to `http://localhost:5000/api/v1`.

## Run

Explore interactively in the MCP Inspector:

```bash
uv run mcp dev kano_mcp/server.py
```

Run as a plain stdio server (what a client launches):

```bash
uv run kano-mcp
```

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
