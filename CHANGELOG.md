# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-10-10

### Added
- Next.js 16 (App Router, TypeScript, Tailwind CSS v4) app "NVX Stack Builder".
- Template catalog with 10 curated Stack Templates as data files (`src/data/templates`): Next.js dashboard,
  Vite + React canvas game, Express REST API, FastAPI + OpenAI app, Streamlit dashboard, Node CLI via npx,
  Python package for PyPI, realtime collaborative workspace (Yjs), React Admin internal tool, Next.js AI chat.
  Every step has bilingual (TH/EN) explanation, exact commands (POSIX + PowerShell), OS notes, expected result
  and a verification command.
- Stack Builder: Node (nvm) / Python versions, npm/pnpm/yarn, pip/uv, add-ons (TypeScript, Tailwind,
  ESLint/Ruff, testing, Docker, GitHub Actions CI); ordered, de-duplicated composition; reorder/remove/restore
  and custom steps; copy all; download `setup.sh`, `setup.ps1`, `README.md` and a starter zip.
- AI agent (`POST /api/plan`) using the OpenAI Responses API with Structured Outputs (model via `OPENAI_MODEL`,
  default `gpt-6.1-sol`), optional per-request user key, zod validation + command/path sanitisation,
  in-memory rate limit, and a deterministic rule-based fallback planner.
- Thai/English toggle, dark mode, share links encoded in the URL hash.
- Vitest unit tests (21), `npm run export` CLI for contributors, MIT license, README (TH+EN),
  CONTRIBUTING, CODE_OF_CONDUCT, `.env.example`.

[Unreleased]: https://github.com/OWNER/nvx-stack-builder/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/OWNER/nvx-stack-builder/releases/tag/v0.1.0
