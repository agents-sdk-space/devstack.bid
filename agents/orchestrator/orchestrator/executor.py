"""Self-hosted sandbox executor (`codex exec-server`) for the orchestrator.

The OpenAI-hosted sandbox is the default. This module is for running the agent against your own
self-hosted environment (e.g. a devbox): it parses a raw ``codex exec-server`` command, starts the
executor as the unprivileged sandbox user, and reports whether the environment connects.

Secrets: the executor key is passed only through stdin into ``CODEX_API_KEY`` inside an
``env -i`` wrapper (never argv, files or logs). Nothing derived from the key, the remote URL or the
environment id is printed; logs are redacted before they are written.
"""

from __future__ import annotations

import os
import re
import shlex
import subprocess
import threading
import time
from dataclasses import dataclass
from pathlib import Path

SANDBOX_USER = os.environ.get("ORCHESTRATOR_SANDBOX_USER", "nvxagent")
SANDBOX_WORKSPACE = os.environ.get("ORCHESTRATOR_SANDBOX_WORKSPACE", "/opt/nvx-agent/sandbox-workspace")
CODEX_BIN = os.environ.get("ORCHESTRATOR_CODEX_BIN", "/usr/local/bin/codex")

_QUOTES = {"\u2018": "'", "\u2019": "'", "\u201c": '"', "\u201d": '"', "\u00a0": " "}


@dataclass(frozen=True)
class ExecTarget:
    key: str
    remote_url: str
    environment_id: str

    def __repr__(self) -> str:  # never leak values through repr/logging
        return "ExecTarget(<redacted>)"


def parse_raw(raw: str) -> ExecTarget:
    """Parse `CODEX_API_KEY='…' codex exec-server --remote '<url>' --environment-id '<id>'`.

    Tolerates smart quotes, line breaks/backslash continuations and `--flag=value` forms."""
    s = raw
    for k, v in _QUOTES.items():
        s = s.replace(k, v)
    s = re.sub(r"\\\s*\n", " ", s).replace("\r", " ").replace("\n", " ").strip()
    tokens = shlex.split(s)
    key = remote = env_id = None
    i = 0
    while i < len(tokens):
        tok = tokens[i]
        if tok.startswith("CODEX_API_KEY="):
            key = tok.split("=", 1)[1]
        elif tok in ("--remote", "--environment-id") and i + 1 < len(tokens):
            if tok == "--remote":
                remote = tokens[i + 1]
            else:
                env_id = tokens[i + 1]
            i += 1
        elif tok.startswith("--remote="):
            remote = tok.split("=", 1)[1]
        elif tok.startswith("--environment-id="):
            env_id = tok.split("=", 1)[1]
        i += 1
    key = re.sub(r"\s+", "", key or "")
    missing = [n for n, v in (("CODEX_API_KEY", key), ("--remote", remote), ("--environment-id", env_id)) if not v]
    if missing:
        raise ValueError(f"could not parse: missing {', '.join(missing)}")
    if not re.match(r"^(wss?|https?)://", remote or ""):
        raise ValueError("could not parse: --remote is not a URL")
    return ExecTarget(key=key, remote_url=remote.strip(), environment_id=env_id.strip())


class Executor:
    """`codex exec-server` running as the sandbox user; stops when stop() closes stdin."""

    def __init__(self, target: ExecTarget, log_path: Path, name: str = "nvx-devbox"):
        self.t = target
        self.log_path = log_path
        self.name = name
        self.proc: subprocess.Popen[str] | None = None
        self.lines: list[str] = []
        self._secrets = [v for v in (target.key, target.remote_url, target.environment_id) if v]

    def redact(self, text: str) -> str:
        for v in self._secrets:
            text = text.replace(v, "<redacted>")
        text = re.sub(r"sk-[A-Za-z0-9_\-]{8,}", "sk-<redacted>", text)
        return re.sub(r"ccarenv_[A-Za-z0-9]+", "ccarenv_<redacted>", text)

    def start(self) -> None:
        wrapper = (
            'IFS= read -r CODEX_API_KEY || exit 97; export CODEX_API_KEY; cd "$WS" || exit 98; '
            'exec "$CODEX" exec-server --remote "$REMOTE" --environment-id "$ENVID" '
            '--name "$NAME" --exit-on-stdin-close'
        )
        # REMOTE/ENVID travel as env assignments for `env -i` (argv of sudo); they are identifiers,
        # not credentials. The key only ever goes through stdin.
        cmd = [
            "sudo", "-n", "-u", SANDBOX_USER, "/usr/bin/env", "-i",
            f"HOME={SANDBOX_WORKSPACE}", "PATH=/usr/local/bin:/usr/bin:/bin",
            f"WS={SANDBOX_WORKSPACE}", f"CODEX={CODEX_BIN}", f"NAME={self.name}",
            f"REMOTE={self.t.remote_url}", f"ENVID={self.t.environment_id}",
            "/bin/bash", "-c", wrapper,
        ]
        self.log_path.parent.mkdir(parents=True, exist_ok=True)
        self.proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
        assert self.proc.stdin is not None
        self.proc.stdin.write(self.t.key + "\n")
        self.proc.stdin.flush()
        threading.Thread(target=self._pump, daemon=True).start()

    def _pump(self) -> None:
        assert self.proc and self.proc.stdout
        fd = os.open(self.log_path, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
        with os.fdopen(fd, "a") as fh:
            for line in self.proc.stdout:
                clean = self.redact(line.rstrip("\n"))
                self.lines.append(clean)
                fh.write(f"{time.strftime('%H:%M:%S')} {clean}\n")
                fh.flush()

    def alive(self) -> bool:
        return bool(self.proc and self.proc.poll() is None)

    def stop(self) -> None:
        if not self.proc:
            return
        try:
            if self.proc.stdin:
                self.proc.stdin.close()
            self.proc.wait(timeout=10)
        except Exception:
            subprocess.run(["sudo", "-n", "pkill", "-TERM", "-u", SANDBOX_USER, "-f", "exec-server"], check=False)
