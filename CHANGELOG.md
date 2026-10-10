# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-10-10

### Added

- **NVX UI design tokens** (`src/app/tokens.css`): semantic colour, spacing (4px unit), radius, typography (Geist + IBM Plex Sans Thai + Geist Mono), shadow and motion tokens for light and dark, mapped into the Tailwind v4 theme; honours `prefers-reduced-motion`.
- **Component library** (`src/components/ui`): Button, Input, Textarea, Select, Field/Label, Checkbox, Switch, Segmented, Card, Badge, Tabs, Dialog/Sheet, Toast, Tooltip, CodeBlock (copy + toast), Stepper, EmptyState, Skeleton/Spinner, Kbd — Radix UI primitives for interactive parts.
- **Living style guide** at `/design` (Thai + English) showing every token and component variant with usage snippets.
- **Command palette** (Ctrl/⌘ + K) to jump to pages and templates, open a template in the builder, and toggle theme/language.
- **Mobile navigation** sheet and a search trigger in the header.
- **Builder wizard**: 4-stage Stepper flow (Start → Configure → Review & reorder → Export) with a sticky stack summary; "Ask AI / Pick a template" tabs.
- **Drag-and-drop step reordering** (dnd-kit) with full keyboard support and bilingual screen-reader announcements; the ↑/↓ buttons remain.
- **Toast feedback** for copy, download, share link, add/remove step, reset, plan loaded.
- **AI agent loading skeleton**, idle empty state, and error empty state with "Try again" / "Use offline planner".
- Empty states for "no templates match" (clear filters), "all steps removed" (reset) and the 404 page.
- `docs/UI-FRAMEWORK.md` (TH + EN): tokens, components, how to add a component, accessibility rules.
- Component tests (Testing Library + jsdom) and a WCAG contrast test for token pairs in both themes.

### Changed

- Home, catalog, template detail (breadcrumb, sticky sidebar), builder and AI agent panel rebuilt on NVX UI; all raw palette colours replaced by semantic tokens.
- Thai font switched from Noto Sans Thai to IBM Plex Sans Thai.
- The builder now opens at the matching stage: shared links → Review, `#t=<template>` links → Configure.

### Removed

- Legacy global utility classes (`.card`, `.btn-*`, `.input`, `.chip`, `.label`, `.code`) in favour of components.

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

[Unreleased]: https://github.com/OWNER/nvx-stack-builder/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/OWNER/nvx-stack-builder/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/OWNER/nvx-stack-builder/releases/tag/v0.1.0
