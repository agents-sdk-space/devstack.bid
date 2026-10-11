"""Run the Image and Research Orchestrator: ensure the saved agent, start (or continue) a session,
send a message, stream events, run function tools, and print the final answer.

  python -m orchestrator.run "ค้นหาข้อมูล Agents SDK แล้วสรุป" [--session-id sess_...] [--model gpt-6-astra]
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import sys
import time
from datetime import datetime

from openai import APIError, AsyncOpenAI

from .agent_store import ensure_agent
from .config import LOG_DIR, Settings, environment_config
from .tools import ImageTool, ToolError, generate_ai_agents_website, get_agents_sdk_info

TERMINAL_ROOT = {"agent.session.turn.completed", "agent.session.turn.failed", "agent.session.turn.cancelled"}


_ID_PATTERNS = [
    (re.compile(r'"remote_url":\s*"[^"]*"'), '"remote_url": "<redacted>"'),
    (re.compile(r"ccarenv_[A-Za-z0-9]+"), "ccarenv_<redacted>"),
    (re.compile(r"sk-[A-Za-z0-9_\-]{8,}"), "sk-<redacted>"),
]


def redact_ids(text: str) -> str:
    """Environment ids / remote URLs identify a live sandbox; keep them out of logs."""
    for pat, rep in _ID_PATTERNS:
        text = pat.sub(rep, text)
    return text


class Runner:
    def __init__(self, client: AsyncOpenAI, s: Settings, log_path):
        self.client, self.s = client, s
        self.handlers = {
            "generate_ai_agents_website": generate_ai_agents_website,
            "get_agents_sdk_info": get_agents_sdk_info,
            "generate_image": ImageTool(client, s),
        }
        self.log = open(log_path, "w", encoding="utf-8")
        self.subagent_turns: dict[str, str | None] = {}
        self.handled_calls: set[str] = set()
        self.session_id: str | None = None
        self.text: dict[str, str] = {}
        self.usage = None
        self.root_turn_id: str | None = None

    # ---- event display -------------------------------------------------------------------
    def show(self, ev) -> None:
        d = ev.to_dict() if hasattr(ev, "to_dict") else dict(ev)
        self.log.write(redact_ids(json.dumps(d, ensure_ascii=False)) + "\n")
        t = d.get("type", "")
        if t == "agent.session.created":
            self.session_id = d["session"]["id"]
            env = d["session"].get("environment") or {}
            print(f"[session] {self.session_id} environment={env.get('type')} {env.get('container_size', '')}", flush=True)
        elif t.startswith("agent.session.environment."):
            print(f"[env] {t.rsplit('.', 1)[-1]}", flush=True)
        elif t == "agent.session.turn.created":
            turn = d.get("turn", {})
            self.subagent_turns[turn.get("id")] = turn.get("subagent_id")
            who = f"subagent {turn['subagent_id']}" if turn.get("subagent_id") else "main"
            if not turn.get("subagent_id"):
                self.root_turn_id = turn.get("id")
            print(f"[turn] started ({who})", flush=True)
        elif t == "agent.session.subagent.created":
            print(f"[subagent] created {json.dumps({k: v for k, v in d.items() if k not in ('event_id', 'session_id', 'type')}, ensure_ascii=False)[:200]}", flush=True)
        elif t in ("agent.session.turn.item.added", "agent.session.turn.item.done"):
            item = d.get("item", {})
            it = item.get("type")
            if it in ("function_call", "web_search_call", "mcp_call", "command_execution", "create_subagent_call",
                      "wait_for_subagents_call", "send_subagent_input_call", "close_subagent_call"):
                who = "sub" if self.subagent_turns.get(d.get("turn_id")) else "main"
                brief = {k: item.get(k) for k in ("name", "arguments", "action", "command", "server_label", "status") if item.get(k)}
                print(f"[{who}:{it}] {t.rsplit('.', 1)[-1]} {json.dumps(brief, ensure_ascii=False)[:240]}", flush=True)
        elif t == "agent.session.turn.reasoning_summary_text.done":
            print(f"[reasoning summary] {d.get('text', '')[:300]}", flush=True)
        elif t == "agent.session.turn.output_text.delta":
            if not self.subagent_turns.get(d.get("turn_id")):
                sys.stdout.write(d.get("delta", ""))
                sys.stdout.flush()
        elif t == "agent.session.turn.output_text.done":
            if not self.subagent_turns.get(d.get("turn_id")):
                self.text[d.get("item_id", "")] = d.get("text", "")
                print("", flush=True)
        elif t in TERMINAL_ROOT:
            turn = d.get("turn", {})
            if not turn.get("subagent_id"):
                self.usage = d.get("usage") or turn.get("usage")
            print(f"[turn] {t.rsplit('.', 1)[-1]} ({'subagent' if turn.get('subagent_id') else 'main'})", flush=True)
        elif t in ("error", "agent.session.failed"):
            print(f"[error] {json.dumps(d, ensure_ascii=False)[:400]}", flush=True)

    # ---- tool calls ----------------------------------------------------------------------
    async def handle_required_actions(self, session: dict) -> None:
        results = []
        for action in session.get("required_actions") or []:
            if action.get("type") != "function_call" or action.get("call_id") in self.handled_calls:
                continue
            self.handled_calls.add(action["call_id"])
            name, args = action.get("name"), action.get("arguments") or {}
            if isinstance(args, str):
                args = json.loads(args or "{}")
            base = {"type": "agent.session.input.tool_result", "turn_id": action["turn_id"], "call_id": action["call_id"]}
            handler = self.handlers.get(name)
            started = time.monotonic()
            try:
                if not handler:
                    raise ToolError(f"Unknown function {name}")
                output = await handler(args, self.s)
                text = json.dumps(output, ensure_ascii=False)
                results.append({**base, "success": True, "output": text[:200_000]})
                print(f"[tool] {name} ok in {time.monotonic() - started:.1f}s ({len(text)} chars)", flush=True)
            except (ToolError, ValueError, APIError, OSError) as err:
                msg = str(err)[:500]
                results.append({**base, "success": False, "error": msg})
                print(f"[tool] {name} failed: {msg}", flush=True)
        if results:
            await self.client.beta.agents.sessions.events.create(self.session_id, events=results)

    async def consume(self, stream) -> None:
        async for ev in stream:
            self.show(ev)
            t = ev.type
            if t == "agent.session.requires_action":
                await self.handle_required_actions(ev.session.to_dict())
            elif t == "error":
                raise RuntimeError(getattr(ev.error, "message", "stream error"))
            elif t in ("agent.session.failed", "agent.session.environment.failed"):
                raise RuntimeError(f"Agent lifecycle failure: {t}")
            elif t in TERMINAL_ROOT and getattr(ev.turn, "subagent_id", None) is None:
                if t != "agent.session.turn.completed":
                    raise RuntimeError(f"{t}: {getattr(getattr(ev.turn, 'error', None), 'message', '')}")
                return
        raise RuntimeError("Stream closed before the turn ended; retrieve the session to recover.")

    async def run(self, agent_id: str, message: str, session_id: str | None) -> None:
        if not session_id and self.s.environment == "self_hosted":
            # Create the session first, attach our executor to its environment, then send input.
            from .executor import ExecTarget, Executor, parse_raw

            key_raw = os.environ.get("CODEX_EXEC_RAW")
            key = parse_raw(key_raw).key if key_raw else os.environ.get("OPENAI_EXECUTOR_API_KEY", "")
            if not key:
                raise RuntimeError("self_hosted needs CODEX_EXEC_RAW or OPENAI_EXECUTOR_API_KEY (environment key)")
            session = await self.client.beta.agents.sessions.create(
                agent_id=agent_id, agent={"model": self.s.model}, environment=environment_config(self.s),
                metadata={"app": "devstack-orchestrator-cli", "environment": "self_hosted"},
            )
            env = session.environment
            self.executor = Executor(ExecTarget(key, env.remote_url, env.id), LOG_DIR / f"executor-{session.id}.log")
            self.executor.start()
            print(f"[session] {session.id} environment=self_hosted (executor started as sandbox user)", flush=True)
            session_id = session.id
        if session_id:
            self.session_id = session_id
            events = await self.client.beta.agents.sessions.events.stream(session_id)
            async with events:
                await self.client.beta.agents.sessions.events.create(session_id, events=[{
                    "type": "agent.session.input.message",
                    "input": [{"role": "user", "content": [{"type": "input_text", "text": message}]}],
                }])
                await asyncio.wait_for(self.consume(events), self.s.turn_timeout_s)
            return
        stream = await self.client.beta.agents.sessions.create(
            agent_id=agent_id,
            agent={"model": self.s.model},
            environment=environment_config(self.s),
            input=message,
            metadata={"app": "devstack-orchestrator-cli"},
            stream=True,
        )
        try:
            await asyncio.wait_for(self.consume(stream), self.s.turn_timeout_s)
        except asyncio.TimeoutError:
            if self.session_id:
                await self.client.beta.agents.sessions.events.create(self.session_id, events=[{"type": "agent.session.input.cancel"}])
            raise RuntimeError(f"Turn timed out after {self.s.turn_timeout_s:.0f}s and was cancelled")

    async def list_artifacts(self) -> list:
        if not self.session_id:
            return []
        page = await self.client.beta.agents.sessions.artifacts.list(self.session_id)
        return [{"path": a.path, "size_bytes": a.size_bytes, "id": a.id} for a in page.data]


async def amain(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("message", nargs="?", default="สวัสดี! แนะนำตัวสั้นๆ แล้วค้นหาว่า DevStack มีเทมเพลตอะไรบ้าง พร้อมแหล่งอ้างอิง")
    p.add_argument("--session-id", help="continue an existing session")
    p.add_argument("--model", help="override model (default gpt-6.1-sol; spec: gpt-6-astra)")
    p.add_argument("--environment", choices=["openai_hosted", "self_hosted", "none"])
    p.add_argument("--update-agent", action="store_true", help="push agent.json to the saved agent")
    a = p.parse_args(argv)
    if not os.environ.get("OPENAI_API_KEY"):
        print("OPENAI_API_KEY is not set", file=sys.stderr)
        return 2
    s = Settings.from_env()
    if a.model or a.environment:
        s = Settings(**{**s.__dict__, **({"model": a.model} if a.model else {}), **({"environment": a.environment} if a.environment else {})})
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    log_path = LOG_DIR / f"run-{datetime.now():%Y%m%d-%H%M%S}.jsonl"
    async with AsyncOpenAI() as client:
        agent_id = await ensure_agent(client, s.model, force_update=a.update_agent)
        runner = Runner(client, s, log_path)
        started = time.monotonic()
        try:
            await runner.run(agent_id, a.message, a.session_id)
        except (RuntimeError, APIError) as err:
            print(f"\n[failed] {err}", file=sys.stderr)
            return 1
        finally:
            runner.log.close()
            if getattr(runner, "executor", None):
                runner.executor.stop()
        if runner.session_id and runner.root_turn_id:
            for _ in range(6):  # usage is recorded shortly after the turn completes
                turn = await client.beta.agents.sessions.turns.retrieve(runner.root_turn_id, session_id=runner.session_id)
                if turn.usage:
                    runner.usage = turn.usage.model_dump()
                    break
                await asyncio.sleep(1.5)
        files = await runner.list_artifacts()
        print("\n========== result ==========")
        print(f"agent_id:   {agent_id}\nsession_id: {runner.session_id}\nmodel:      {s.model}\nenvironment:{s.environment}")
        print(f"usage:      {json.dumps(runner.usage)}\nartifacts:  {files}\nelapsed:    {time.monotonic() - started:.1f}s\nevent log:  {log_path}")
    return 0


def main() -> None:
    raise SystemExit(asyncio.run(amain()))


if __name__ == "__main__":
    main()
