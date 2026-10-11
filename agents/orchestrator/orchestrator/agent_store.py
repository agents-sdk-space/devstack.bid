"""Create the reusable agent once, store its id, and keep it in sync with agent.json."""
from __future__ import annotations

import json

from openai import AsyncOpenAI

from .config import STATE_DIR, definition_hash, load_agent_definition

STATE_FILE = STATE_DIR / "agent.json"


def _create_params(defn: dict, model: str) -> dict:
    keys = ("name", "instructions", "tools", "multi_agent", "reasoning", "text")
    params = {k: defn[k] for k in keys if k in defn}
    params["model"] = model
    params["metadata"] = {"app": "devstack-orchestrator", "definition": definition_hash(defn)}
    return params


async def ensure_agent(client: AsyncOpenAI, model: str, force_update: bool = False) -> str:
    """Return the saved agent id, creating or updating the agent when agent.json changed."""
    defn = load_agent_definition()
    digest = definition_hash(defn)
    state = json.loads(STATE_FILE.read_text()) if STATE_FILE.exists() else {}
    params = _create_params(defn, model)

    if state.get("agent_id"):
        if state.get("definition") == digest and state.get("model") == model and not force_update:
            return state["agent_id"]
        agent = await client.beta.agents.update(state["agent_id"], **params)
        action = "updated"
    else:
        agent = await client.beta.agents.create(**params)
        action = "created"

    STATE_DIR.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps({"agent_id": agent.id, "definition": digest, "model": model}, indent=2))
    print(f"[agent] {action} '{defn['name']}' -> {agent.id} (model {model})", flush=True)
    return agent.id
