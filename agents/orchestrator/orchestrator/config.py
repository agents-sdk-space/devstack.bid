"""Configuration: the shared agent definition (agent.json) plus env overrides.

agent.json is the single source of truth for name, instructions and tools. The Next.js Worker
(src/lib/chat/agent-config.ts) imports the same file, so the CLI and the /chat page behave alike.
"""
from __future__ import annotations

import hashlib
import json
import os
from dataclasses import dataclass
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = APP_DIR.parent.parent
AGENT_FILE = APP_DIR / "agent.json"
STATE_DIR = APP_DIR / ".state"
OUT_DIR = APP_DIR / "out"
LOG_DIR = APP_DIR / "logs"

# Public chat default is the cheaper model; the PDF spec's gpt-6-astra costs ~5x more per token.
DEFAULT_MODEL = "gpt-6.1-sol"
SPEC_MODEL = "gpt-6-astra"


def load_agent_definition() -> dict:
    return json.loads(AGENT_FILE.read_text(encoding="utf-8"))


def definition_hash(defn: dict) -> str:
    return hashlib.sha256(json.dumps(defn, sort_keys=True).encode()).hexdigest()[:16]


@dataclass(frozen=True)
class Settings:
    model: str
    environment: str  # "openai_hosted" | "self_hosted" | "none"
    container_size: str
    image_model: str
    image_quality: str
    max_images: int
    site: str
    turn_timeout_s: float

    @staticmethod
    def from_env() -> "Settings":
        env = os.environ.get
        return Settings(
            model=env("ORCHESTRATOR_MODEL", DEFAULT_MODEL),
            environment=env("ORCHESTRATOR_ENVIRONMENT", "openai_hosted"),
            container_size=env("ORCHESTRATOR_CONTAINER_SIZE", "small"),
            image_model=env("ORCHESTRATOR_IMAGE_MODEL", "gpt-image-2.5-sunburst"),
            image_quality=env("ORCHESTRATOR_IMAGE_QUALITY", "low"),
            max_images=int(env("ORCHESTRATOR_MAX_IMAGES", "2")),
            site=env("DEVSTACK_SITE", "https://devstack.bid").rstrip("/"),
            turn_timeout_s=float(env("ORCHESTRATOR_TURN_TIMEOUT_S", "300")),
        )


def environment_config(s: Settings) -> dict:
    """OpenAI-hosted sandbox (the Worker cannot run a self-hosted `codex exec-server`).

    Network is restricted to the two research domains; the agent's own web_search runs on the
    OpenAI side and is not affected by this sandbox policy.
    """
    if s.environment == "none":
        return {"type": "none"}
    if s.environment == "self_hosted":
        # Your own machine runs `codex exec-server` (see orchestrator/executor.py).
        return {"type": "self_hosted", "workspace_directory": os.environ.get("ORCHESTRATOR_SANDBOX_DIR", "/opt/nvx-agent/sandbox-workspace/devbox")}
    return {
        "type": "openai_hosted",
        "container_size": s.container_size,
        "network": {"access": "restricted", "allowed_domains": ["devstack.bid", "agents-sdk.space"]},
        "setup_commands": [{"command": "mkdir -p /workspace/outputs"}],
    }
