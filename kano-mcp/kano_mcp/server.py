"""FastMCP server exposing the Kano API.

Run it directly over stdio:

    uv run kano-mcp

or explore it in the MCP Inspector:

    uv run mcp dev kano_mcp/server.py

The server exposes:
  * Tools     — model-invoked actions: create/list projects and features.
  * Resources — readable data the client can pull into context (projects).
  * Prompts   — a reusable template to kick off a prioritization project.
"""

from __future__ import annotations

import json
import logging
import sys
from typing import Any

from mcp.server.fastmcp import FastMCP

from kano_mcp.kano_client import KanoApiError, KanoClient

# IMPORTANT (stdio transport): never write to stdout — it carries the JSON-RPC
# stream and any stray bytes corrupt the protocol. Log to stderr instead.
logging.basicConfig(level=logging.INFO, stream=sys.stderr)
logger = logging.getLogger("kano-mcp")

mcp = FastMCP("kano")

# A single shared client keeps one cookie jar (session) and one cached CSRF token
# alive for the lifetime of the server process.
_client: KanoClient | None = None


def get_client() -> KanoClient:
    global _client
    if _client is None:
        _client = KanoClient()
        logger.info("Kano client initialized against %s", _client.base_url)
    return _client


def _format(value: Any) -> str:
    """Render a dict/list result as pretty JSON for the model to read."""
    return json.dumps(value, indent=2, default=str)


# =============================================================================
# Tools — actions the model can choose to invoke (with user approval).
# FastMCP turns the type hints + docstring below into the JSON schema the
# client/model sees, so name your args well and write a clear docstring.
# =============================================================================


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


@mcp.tool()
async def create_feature(
    project_id: str,
    name: str,
    description: str | None = None,
    acknowledge_epoch_bump: bool = False,
) -> str:
    """Create a feature inside a Kano project.

    If the project already has a poll at its current epoch, the API refuses the
    change with a 409 and requires an explicit acknowledgement, because adding a
    feature would start a new epoch (a new version of the feature set that
    respondents see). Re-run with ``acknowledge_epoch_bump=true`` to proceed.

    Args:
        project_id: UUID of the project to add the feature to.
        name: Feature name (max 200 chars).
        description: Optional feature description (max 2048 chars).
        acknowledge_epoch_bump: Set true to confirm bumping the epoch when a poll
            already exists at the current epoch.
    """
    client = get_client()
    try:
        feature = await client.create_feature(
            project_id=project_id,
            name=name,
            description=description,
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


@mcp.tool()
async def list_features(project_id: str, epoch: int) -> str:
    """List every feature recorded for a project at a specific epoch.

    This returns the frozen historical set for that epoch, including soft-deleted
    features (is_active=false) — useful to reconstruct what respondents saw.

    Args:
        project_id: UUID of the project.
        epoch: The epoch to read (1-based, up to the project's current_epoch).
    """
    try:
        return _format(await get_client().list_features_at_epoch(project_id, epoch))
    except KanoApiError as exc:
        return f"Could not list features: {exc.title} — {exc.detail}"


# =============================================================================
# Resources — read-only data, addressed by URI, that a client can load into
# context. Use a resource (not a tool) when the model just needs to *read*
# something with no side effects.
# =============================================================================


@mcp.resource("kano://projects")
async def projects_resource() -> str:
    """The full list of Kano projects as JSON."""
    return _format(await get_client().list_projects())


@mcp.resource("kano://projects/{project_id}")
async def project_resource(project_id: str) -> str:
    """A single Kano project (with current-epoch features) as JSON."""
    return _format(await get_client().get_project(project_id))


# =============================================================================
# Prompts — user-invoked templates that seed a conversation. The client surfaces
# these (e.g. as slash commands); the returned text becomes the user message.
# =============================================================================


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


def main() -> None:
    """Console-script entry point: run the server over stdio."""
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
