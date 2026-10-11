# Image and Research Orchestrator (reference app)

แอป Python อ้างอิงที่สร้าง agent จากสเปก PDF ด้วย OpenAI Agents API (beta) — Python reference app for the agent that powers Dev Chat.

## Setup

```bash
cd agents/orchestrator
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
export OPENAI_API_KEY=...        # never commit; never paste into files
python -m orchestrator.run "Research handoffs in the Agents SDK"
```

`agent.json` is the single definition used by both this app and the Worker (`CHAT_AGENT_ID=""` → inline config).

## Environments

| `--environment` | หมายเหตุ / Notes |
|---|---|
| `none` | no sandbox |
| `openai_hosted` (default) | OpenAI runs a small restricted Linux sandbox |
| `self_hosted` | starts `codex exec-server` as `nvxagent` (workspace `ORCHESTRATOR_SANDBOX_DIR`, default `/opt/nvx-agent/sandbox-workspace/devbox`). The key comes from `CODEX_EXEC_RAW` or `OPENAI_EXECUTOR_API_KEY` and is passed only as `CODEX_API_KEY` via env/stdin |

The persistent box executor lives in `/opt/nvx-agent/devbox` (`devboxctl start|stop|restart|status|ensure|logs`).

## Switching models

Set `ORCHESTRATOR_MODEL=gpt-6-astra` (or edit `agent.json`). Astra costs 5× sol ($10 / $1 cached / $50 per M tokens).

## Costs (gpt-6.1-sol)

$2 input / $0.10 cached / $10 output per M tokens. A simple turn ≈ 47–70k input tokens (mostly cached) ≈ $0.01–0.06; a heavy multi-subagent turn ≈ $0.25.

Logs in `logs/` are JSONL with secrets, environment ids and remote URLs redacted.
