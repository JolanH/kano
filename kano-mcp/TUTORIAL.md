# Building an MCP Server, Step by Step

A hands-on tutorial that teaches the **Model Context Protocol (MCP)** by building a real server in
Python. By the end you'll have a working server that lets an AI assistant **create and read projects
and features** in the [Kano](../kano-backend) API.

We'll go from "what even is MCP" to a server with **Tools, Resources, and Prompts** that you can drive
from the MCP Inspector, Claude Code, or Claude Desktop.

The finished code lives next to this file in [`kano_mcp/`](./kano_mcp). You can follow along and write it
yourself, or read the code and use this document to understand *why* each piece exists.

---

## Table of contents

1. [What is MCP, and why?](#1-what-is-mcp-and-why)
2. [The mental model: hosts, clients, servers](#2-the-mental-model-hosts-clients-servers)
3. [The three server primitives](#3-the-three-server-primitives)
4. [Transports (and the one rule that bites everyone)](#4-transports-and-the-one-rule-that-bites-everyone)
5. [Our target: the Kano API](#5-our-target-the-kano-api)
6. [Setting up the project](#6-setting-up-the-project)
7. [Exercise 1 — Talking to Kano (the HTTP client)](#exercise-1--talking-to-kano-the-http-client)
8. [Exercise 2 — Your first tool: `create_project`](#exercise-2--your-first-tool-create_project)
9. [Exercise 3 — Read tools and error handling](#exercise-3--read-tools-and-error-handling)
10. [Exercise 4 — `create_feature` and the epoch-bump conflict](#exercise-4--create_feature-and-the-epoch-bump-conflict)
11. [Exercise 5 — Resources](#exercise-5--resources)
12. [Exercise 6 — Prompts](#exercise-6--prompts)
13. [Running and connecting your server](#7-running-and-connecting-your-server)
14. [Troubleshooting](#8-troubleshooting)
15. [Where to go next](#9-where-to-go-next)

---

## 1. What is MCP, and why?

Large language models are good at reasoning over text, but on their own they can't *do* anything:
they can't read your files, call your APIs, or query your database. The usual fix is "tool use" /
"function calling" — you describe some functions to the model, it asks to call one, your code runs it,
and you feed the result back.

That works, but every application re-invents the wiring: each app hand-codes its integrations, and none
of them are reusable across apps. **MCP standardizes that wiring.** It's an open protocol that defines
how an application gives a model access to **tools, data, and prompt templates** through a uniform
interface.

The payoff: you write a *Kano MCP server* **once**, and it works in **any** MCP-compatible host — Claude
Desktop, Claude Code, IDE extensions, your own app — without changing the server. Think of MCP as
"a USB-C port for AI applications": one connector, many devices.

> **Analogy that helps:** MCP is to AI integrations what the Language Server Protocol (LSP) is to editors.
> Before LSP, every editor wrote its own integration for every language. After LSP, one language server
> works in every editor. MCP does the same for model ↔ tool/data integrations.

---

## 2. The mental model: hosts, clients, servers

Three roles, and it's worth being precise about them because the docs use these words constantly:

- **Host** — the AI application the user interacts with (Claude Desktop, Claude Code, an IDE plugin).
  The host contains the model and decides *when* to use a server's capabilities.
- **Client** — a connector living *inside* the host. The host creates **one client per server**, and
  that client speaks MCP to exactly one server. (You rarely write a client by hand; the host provides it.)
- **Server** — a program that *exposes capabilities* (tools/resources/prompts) over MCP. **This is what
  you build.** Our Kano server is one.

```
┌─────────────────────────── Host (e.g. Claude Code) ───────────────────────────┐
│   the model  ◄──────────►  MCP client A  ◄════ MCP / JSON-RPC ════►  Server A  │
│                            MCP client B  ◄════ MCP / JSON-RPC ════►  Server B  │
└────────────────────────────────────────────────────────────────────────────────┘
                                                       (Server A = our kano-mcp)
```

Under the hood, client and server exchange **JSON-RPC 2.0** messages (requests, responses,
notifications). The good news: the Python SDK hides JSON-RPC almost entirely. You'll write plain Python
functions and the SDK generates the protocol messages and the JSON schemas for you.

---

## 3. The three server primitives

A server can offer three kinds of capability. The distinction is really about **who is in control**:

| Primitive | Controlled by | Think of it as | Side effects? | Our examples |
| --- | --- | --- | --- | --- |
| **Tools** | the **model** | a function the model can call (function calling) | yes, usually | `create_project`, `create_feature`, `list_projects`, … |
| **Resources** | the **application** | a file/URL the app can read into context | no (read-only) | `kano://projects`, `kano://projects/{id}` |
| **Prompts** | the **user** | a saved template / slash command | n/a | `kickoff_prioritization` |

- **Tools** are *model-controlled*: during a conversation the model decides it needs to act and asks the
  host to invoke a tool (the host typically asks the user to approve). Tools are the heart of "let the AI
  *do* something" — creating a Kano project is a tool.
- **Resources** are *application-controlled*: they're addressable read-only data (each has a URI like
  `kano://projects`). The host decides when to pull them into context. Use a resource when the model just
  needs to *read* state with no side effects.
- **Prompts** are *user-controlled*: pre-written templates the user explicitly picks (often surfaced as
  slash commands). They seed a conversation with a well-structured request.

We'll build all three. Most real servers lean heavily on tools, so we start there.

---

## 4. Transports (and the one rule that bites everyone)

The protocol is transport-agnostic; the SDK ships two you'll actually use:

- **stdio** — the server runs as a **subprocess** of the host and exchanges JSON-RPC over stdin/stdout.
  This is the default for local servers and what we use in this tutorial. Zero networking, the host
  launches and supervises the process.
- **Streamable HTTP** — the server is a long-running HTTP service. This is the choice for **remote**
  servers shared by many users. (We mention it in the [final section](#9-where-to-go-next).)

> ⚠️ **The rule that bites everyone (stdio):** *never write to stdout.* Under stdio, stdout **is** the
> JSON-RPC channel — a stray `print()` injects garbage into the protocol stream and breaks the
> connection. Send all logging to **stderr** (or a file). In Python:
>
> ```python
> import logging, sys
> logging.basicConfig(level=logging.INFO, stream=sys.stderr)  # ✅ stderr is safe
> # print("debug")            # ❌ corrupts the stdio JSON-RPC stream
> print("debug", file=sys.stderr)  # ✅ also fine
> ```

---

## 5. Our target: the Kano API

Kano is a small Flask + Pydantic service for running Kano-model feature prioritization. The two
write operations we'll wrap are **create a project** and **create a feature**; we'll also add read
operations. Here's everything our server needs to know.

**Base URL:** `http://localhost:5000/api/v1` (the backend listens on port 5000; start it with
`docker compose up --build` from the repo root, health check `GET /api/v1/health`).

### Authentication: session cookie + CSRF token (no bearer tokens!)

This is the most instructive wrinkle, and it's realistic — plenty of APIs work this way.

Kano's read routes (`GET`) are open. But **write routes** (`POST/PATCH/DELETE`) are protected by a
**Flask session cookie plus a CSRF token**:

1. `GET /api/v1/csrf-token` → returns `{"csrf_token": "..."}` **and** sets a session cookie
   (`Set-Cookie`).
2. Every later write must (a) send that cookie back and (b) echo the token in an `X-CSRF-Token` header.

We'll handle this with a single HTTP client that keeps a cookie jar, so the session cookie persists
automatically; we just cache the token string. (See [Exercise 1](#exercise-1--talking-to-kano-the-http-client).)

### Endpoints we'll use

| Operation | Method & path | Body | Returns |
| --- | --- | --- | --- |
| Create project | `POST /projects` | `{name, version}` | `{id, name, version, current_epoch, created_at, updated_at}` |
| List projects | `GET /projects` | – | array of project summaries |
| Get project | `GET /projects/{id}` | – | project + `active_features[]` |
| Create feature | `POST /projects/{id}/features` | `{name, description?}` (+ optional `acknowledged`) | `{id, feature_key, name, description, is_active, created_at, epoch}` |
| List features at epoch | `GET /projects/{id}/epochs/{epoch}/features` | – | array of feature rows |

Constraints: `name ≤ 200`, `version ≤ 50`, `description ≤ 2048` chars. A feature belongs to a project
via the `{id}` in the URL path.

### The epoch concept (and a 409 you must handle)

Each project has a `current_epoch`. An **epoch** is a frozen version of the feature set — once
respondents start answering a poll, the features they saw must not silently change. So:

- If **no poll** exists at the current epoch, creating a feature just works (it lands at `current_epoch`).
- If a **poll already exists** at the current epoch, creating a feature would change what's being polled.
  The API refuses with **`409 Conflict`** (`type: .../problems/epoch-bump-required`), including
  `current_epoch` and `would_be_epoch`. To proceed you must re-send the request with
  `{"acknowledged": true}`, which bumps the epoch and carries the feature set forward.

We'll turn this into a clean tool experience in [Exercise 4](#exercise-4--create_feature-and-the-epoch-bump-conflict).

### Errors are RFC 7807 `problem+json`

Failures come back as a problem document:

```json
{
  "type": "https://kano.example.com/problems/validation-error",
  "title": "Request validation failed",
  "status": 400,
  "detail": "1 validation error for ProjectCreate ...",
  "instance": "/api/v1/projects",
  "request_id": "..."
}
```

We'll parse this into a typed exception so tools can return helpful messages.

---

## 6. Setting up the project

We use [`uv`](https://docs.astral.sh/uv/) (fast Python package manager). Install it if needed:

```bash
# macOS / Linux
curl -LsSf https://astral.sh/uv/install.sh | sh
```

Create the project and add dependencies:

```bash
uv init kano-mcp
cd kano-mcp
uv add "mcp[cli]" httpx pydantic
```

- `mcp[cli]` — the official MCP Python SDK (the `[cli]` extra gives you the `mcp` command, including the
  **Inspector**). Requires Python ≥ 3.10 and SDK ≥ 1.2.0.
- `httpx` — async HTTP client for calling Kano.
- `pydantic` — already a transitive dependency of `mcp`; handy for typed models.

Target layout (matches the files in this folder):

```
kano-mcp/
├── pyproject.toml
├── .env.example
└── kano_mcp/
    ├── __init__.py
    ├── kano_client.py   # the HTTP wrapper (Exercise 1)
    └── server.py        # the MCP server (Exercises 2–6)
```

---

## Exercise 1 — Talking to Kano (the HTTP client)

> 📄 Full file: [`kano_mcp/kano_client.py`](./kano_mcp/kano_client.py)

Before any MCP code, we need to *call Kano correctly* — including the CSRF dance. Keeping this in its own
module keeps the MCP layer clean: the server file will only worry about MCP concerns.

**Key ideas:**

1. **One `httpx.AsyncClient` for the whole process.** It owns a cookie jar, so the session cookie set by
   `/csrf-token` is automatically sent on every later request — exactly what Flask's session auth needs.
2. **Lazily fetch the CSRF token once** and cache it; attach it as `X-CSRF-Token` on writes only.
3. **Map errors to a typed exception** carrying the RFC 7807 fields, so callers can detect the
   epoch-bump 409 specifically.

The typed error:

```python
class KanoApiError(Exception):
    def __init__(self, status_code: int, problem: dict[str, Any]):
        self.status_code = status_code
        self.problem = problem
        # `type` is a URL; its last path segment is a stable machine code.
        self.problem_type = str(problem.get("type", "")).rstrip("/").rsplit("/", 1)[-1]
        self.title = problem.get("title", "Kano API error")
        self.detail = problem.get("detail", "")
        super().__init__(f"{status_code} {self.title}: {self.detail}")

    @property
    def is_epoch_bump_required(self) -> bool:
        return self.status_code == 409 and self.problem_type == "epoch-bump-required"
```

The CSRF bootstrap and request helper:

```python
class KanoClient:
    def __init__(self, base_url: str | None = None):
        self.base_url = (base_url or os.environ.get("KANO_API_BASE", DEFAULT_BASE_URL)).rstrip("/")
        self._client = httpx.AsyncClient(base_url=self.base_url, timeout=30.0)
        self._csrf_token: str | None = None

    async def _ensure_csrf(self) -> str:
        if self._csrf_token is None:
            resp = await self._client.get("/csrf-token")  # also sets the session cookie
            resp.raise_for_status()
            self._csrf_token = resp.json()["csrf_token"]
        return self._csrf_token

    async def _request(self, method, path, *, json=None):
        headers = {}
        if method.upper() in {"POST", "PATCH", "PUT", "DELETE"}:
            headers["X-CSRF-Token"] = await self._ensure_csrf()
        resp = await self._client.request(method, path, json=json, headers=headers)
        if resp.is_success:
            return resp.json() if resp.content else None
        try:
            problem = resp.json()
        except Exception:
            problem = {"title": resp.reason_phrase, "detail": resp.text}
        raise KanoApiError(resp.status_code, problem)
```

The public methods are thin wrappers — see the full file for `list_projects`, `get_project`,
`create_project`, `create_feature(..., acknowledged=False)`, and `list_features_at_epoch`.

**Takeaway:** none of this is MCP-specific. Keeping your "domain client" separate from your MCP server is
good practice — it's easy to test, and the MCP layer stays a thin adapter.

---

## Exercise 2 — Your first tool: `create_project`

> 📄 Full file: [`kano_mcp/server.py`](./kano_mcp/server.py)

Now the MCP part. Create the server instance and your first tool.

```python
import json, logging, sys
from mcp.server.fastmcp import FastMCP
from kano_mcp.kano_client import KanoApiError, KanoClient

logging.basicConfig(level=logging.INFO, stream=sys.stderr)  # remember: stderr, not stdout!

mcp = FastMCP("kano")          # the server; "kano" is its name

_client = None
def get_client() -> KanoClient:
    global _client
    if _client is None:
        _client = KanoClient()  # one shared client => one session + cached CSRF token
    return _client

def _format(value) -> str:
    return json.dumps(value, indent=2, default=str)


@mcp.tool()
async def create_project(name: str, version: str) -> str:
    """Create a new Kano project.

    Args:
        name: Human-readable project name (max 200 chars).
        version: Version label for the project, e.g. "1.0" (max 50 chars).
    """
    try:
        project = await get_client().create_project(name=name, version=version)
    except KanoApiError as exc:
        return f"Failed to create project: {exc.title} — {exc.detail}"
    return f"Created project '{project['name']}' (id={project['id']}, epoch={project['current_epoch']})."
```

### Anatomy of a FastMCP tool — why this is all you write

`FastMCP` inspects your function and builds the MCP tool definition automatically:

- **The function name** (`create_project`) becomes the tool name.
- **The type hints** (`name: str`, `version: str`, return `-> str`) become the input/output **JSON
  schema** that the model sees. This is why type hints aren't optional decoration — they're the contract.
- **The docstring** becomes the tool's description, and the `Args:` lines describe each parameter.
  **The model reads this to decide whether and how to call the tool**, so write it for the model, not just
  for humans. Be explicit about units, formats, and constraints.
- `async def` is supported (and preferred when you do I/O like HTTP calls).

> **Why return a string?** A tool can return rich structured content, but a short human-readable string is
> often the most reliable thing to hand back to a model — it states the outcome and the IDs it now needs.
> We return JSON strings for reads (Exercise 3) and summary strings for writes.

### Run it in the MCP Inspector

The Inspector is a local web UI that speaks MCP to your server — the fastest way to test without wiring up
a full host.

```bash
# make sure the Kano backend is running first: docker compose up --build
uv run mcp dev kano_mcp/server.py
```

Open the printed URL. You should see `create_project` under **Tools**. Click it, fill in `name` and
`version`, and **Run**. You'll get back `Created project '...' (id=..., epoch=1).` 🎉

You just built a working MCP server with one tool. Everything else is more of the same.

---

## Exercise 3 — Read tools and error handling

Acting is half the job; the model also needs to *read* state (e.g. to find a `project_id` before adding a
feature). Add read tools:

```python
@mcp.tool()
async def list_projects() -> str:
    """List all Kano projects (newest first), as a JSON array of summaries."""
    return _format(await get_client().list_projects())


@mcp.tool()
async def get_project(project_id: str) -> str:
    """Get one Kano project with its current-epoch active features.

    Args:
        project_id: UUID of the project to fetch.
    """
    try:
        return _format(await get_client().get_project(project_id))
    except KanoApiError as exc:
        return f"Could not fetch project {project_id}: {exc.title} — {exc.detail}"
```

### Error handling is a UX decision

When the API fails, you have two options:

1. **Raise** — the SDK marks the tool result as an error. Fine for truly unexpected failures.
2. **Return a clear message** — better for *expected* failures (not found, validation, conflict). The
   model reads the message and can recover (e.g. ask the user, or call a different tool).

We prefer option 2 for known cases: returning `"Could not fetch project <id>: Entity not found"` lets the
model say something useful instead of just erroring out. This pays off enormously in Exercise 4.

In the Inspector, call `get_project` with a bogus UUID and watch it return a tidy "not found" message
rather than a stack trace.

---

## Exercise 4 — `create_feature` and the epoch-bump conflict

This is where a real API forces real handling. Recall: if a poll already exists at the project's current
epoch, `POST .../features` returns **409 `epoch-bump-required`** unless you pass `{"acknowledged": true}`.

We surface that as an explicit, model-friendly two-step:

```python
@mcp.tool()
async def create_feature(
    project_id: str,
    name: str,
    description: str | None = None,
    acknowledge_epoch_bump: bool = False,
) -> str:
    """Create a feature inside a Kano project.

    If the project already has a poll at its current epoch, the API refuses the change
    with a 409 and requires acknowledgement, because adding a feature would start a new
    epoch (a new version of the feature set respondents see). Re-run with
    acknowledge_epoch_bump=true to proceed.

    Args:
        project_id: UUID of the project to add the feature to.
        name: Feature name (max 200 chars).
        description: Optional feature description (max 2048 chars).
        acknowledge_epoch_bump: Set true to confirm bumping the epoch.
    """
    try:
        feature = await get_client().create_feature(
            project_id=project_id, name=name, description=description,
            acknowledged=acknowledge_epoch_bump,
        )
    except KanoApiError as exc:
        if exc.is_epoch_bump_required:
            cur = exc.problem.get("current_epoch")
            nxt = exc.problem.get("would_be_epoch")
            return (
                f"This project has a poll at epoch {cur}. Adding '{name}' would start "
                f"epoch {nxt} (a new version of the feature set). Re-run create_feature "
                f"with acknowledge_epoch_bump=true to confirm."
            )
        return f"Failed to create feature: {exc.title} — {exc.detail}"
    return (
        f"Created feature '{feature['name']}' (id={feature['id']}, "
        f"feature_key={feature['feature_key']}, epoch={feature['epoch']})."
    )
```

**Why expose `acknowledge_epoch_bump` as a parameter instead of always sending `true`?** Because the bump
is a *meaningful, semi-destructive* decision (it starts a new version of the study). The clean MCP pattern
is:

1. First call fails safely → the tool returns a plain-language explanation of the consequence.
2. The model relays that to the user and gets confirmation.
3. Second call passes `acknowledge_epoch_bump=true`.

This is a reusable pattern for any "are you sure?" API: **don't hide the decision — turn the conflict into
a clear message plus a confirm flag.**

**Try it:** with a fresh project (no polls), `create_feature` returns `epoch=1` immediately. To see the
409 path, create a poll for the project first, then call `create_feature` — you'll get the explanation,
and a second call with `acknowledge_epoch_bump=true` succeeds at the next epoch.

---

## Exercise 5 — Resources

Tools are model-invoked *actions*. **Resources** are application-loaded *read-only data*, each addressed
by a URI. Expose projects both ways and you cover both "the model decided to look something up" (tool) and
"the app wants this data in context" (resource).

```python
@mcp.resource("kano://projects")
async def projects_resource() -> str:
    """The full list of Kano projects as JSON."""
    return _format(await get_client().list_projects())


@mcp.resource("kano://projects/{project_id}")
async def project_resource(project_id: str) -> str:
    """A single Kano project (with current-epoch features) as JSON."""
    return _format(await get_client().get_project(project_id))
```

Notes:

- The decorator argument is the **URI**. The scheme (`kano://`) is yours to choose.
- `kano://projects/{project_id}` is a **resource template**: the `{project_id}` placeholder becomes a
  function parameter. Clients can list the static resource and read parameterized ones by URI.
- Resources should be **side-effect-free reads**. (Creating a project is a tool, never a resource.)

**Tool vs resource — how to choose:** if calling it *changes* something, or the *model* should decide when
to trigger it mid-task, make it a **tool**. If it's read-only reference data the *host/user* pulls in
(like attaching a file), make it a **resource**. It's fine — common, even — to expose the same data as
both, as we do here.

In the Inspector, open the **Resources** tab, read `kano://projects`, then read
`kano://projects/<some-id>`.

---

## Exercise 6 — Prompts

**Prompts** are user-invoked templates. A host typically surfaces them as slash commands; when the user
picks one, the returned text is injected as a starting message. They're great for encoding a repeatable
workflow.

```python
@mcp.prompt()
def kickoff_prioritization(project_name: str, version: str = "1.0") -> str:
    """Template: start a new Kano prioritization project and seed its features."""
    return (
        f"I want to run a Kano feature-prioritization study called '{project_name}' "
        f"(version {version}).\n\n"
        "Please:\n"
        f"1. Create the project '{project_name}' with version '{version}'.\n"
        "2. Ask me for the list of candidate features (name + one-line description).\n"
        "3. Add each feature to the project.\n"
        "4. Show me the resulting project so I can confirm the feature set.\n\n"
        "If adding a feature reports that an epoch bump is required, explain why and "
        "ask me to confirm before retrying with acknowledgement."
    )
```

- The function name is the prompt name; parameters (`project_name`, `version`) become arguments the user
  fills in. Defaults are respected.
- Returning a plain string makes it the user message. (You can also return structured message lists for
  multi-turn templates — see the SDK docs.)
- Notice the prompt *orchestrates the tools we built*: it tells the model to call `create_project`, then
  `create_feature` repeatedly, and how to handle the epoch-bump case. Prompts are how you ship a
  best-practice workflow alongside your tools.

In the Inspector's **Prompts** tab, select `kickoff_prioritization`, enter a name, and see the rendered
template.

---

## 7. Running and connecting your server

### As a stdio server

The bottom of `server.py`:

```python
def main() -> None:
    mcp.run(transport="stdio")

if __name__ == "__main__":
    main()
```

`pyproject.toml` also exposes a console script, so `uv run kano-mcp` starts it. A host launches this
process and talks to it over stdin/stdout — you won't run it by hand often, but it's the entry point hosts
use.

### MCP Inspector (development)

```bash
uv run mcp dev kano_mcp/server.py
```

Your one-stop shop for testing tools, resources, and prompts during development.

### Claude Code

```bash
claude mcp add kano -- uv --directory /ABSOLUTE/PATH/TO/kano-mcp run kano-mcp
```

Then in a session, `/mcp` shows the server and its tools; ask Claude to "create a Kano project called
Demo, version 1.0" and watch it call your tool (you'll be asked to approve).

### Claude Desktop

Edit `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/`):

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

Use an **absolute** path; if `uv` isn't found, use its full path (`which uv`). Restart Claude Desktop;
the tools appear behind the tools/🔌 icon.

---

## 8. Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Server connects but immediately drops / "invalid JSON" | You wrote to **stdout** under stdio | Route all logging to **stderr**; remove stray `print()`. |
| `403 csrf-validation-failed` on create | Token/cookie not flowing | Use **one** `httpx.AsyncClient` for the whole process (shared cookie jar) and send `X-CSRF-Token`. Don't recreate the client per call. |
| `Connection refused` to `:5000` | Backend not up, or wrong base URL | `docker compose up --build`; check `GET /api/v1/health`; verify `KANO_API_BASE`. |
| `409 epoch-bump-required` | A poll exists at the current epoch | Re-call `create_feature` with `acknowledge_epoch_bump=true`. |
| Tools don't appear in the host | Bad config path / `uv` not found | Use absolute `--directory`; use the full path to `uv`; restart the host. |
| CORS errors | You're hitting PM routes from a browser origin | Irrelevant for MCP (server-to-server); only affects the SPA. |

A good habit: keep the Inspector open in one terminal while you edit `server.py` — it's the tightest
feedback loop.

---

## 9. Where to go next

You've built a complete MCP server with all three primitives, talking to a real API with real auth and a
real conflict case. To go further:

- **Structured output & richer returns.** Tools can return typed objects (the SDK builds an output schema
  from a Pydantic/typed return) instead of strings — useful when the host post-processes results.
- **Remote deployment.** Swap stdio for **Streamable HTTP** (`mcp.run(transport="streamable-http")`,
  often with `stateless_http=True`) to host the server for many users. Then add real auth in front of it.
- **More of the Kano API.** Update/soft-delete features, polls, analysis endpoints — same patterns.
- **Tests.** Because the HTTP client is isolated in `kano_client.py`, you can unit-test it against a mock
  Kano, and test tools by calling the functions directly.
- **Read the spec & SDK docs:**
  - MCP intro & concepts — https://modelcontextprotocol.io
  - Build a server (Python) — https://modelcontextprotocol.io/docs/develop/build-server
  - Python SDK — https://github.com/modelcontextprotocol/python-sdk

The big idea to carry forward: **a tool is just a well-documented function, a resource is a read-only URI,
and a prompt is a parameterized template.** Type hints and docstrings *are* the interface the model sees —
write them well and the rest follows.
