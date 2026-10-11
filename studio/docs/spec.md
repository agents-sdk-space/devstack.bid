# DEVSTACK — Original Blueprint (from user)

## 1. Brand system & design language
Premium, developer-centric, ultra-modern aesthetic inspired by VoidZero/Rolldown ecosystem sites (replace their orange with #8BCAFE).
- Base background: #000000
- Surface/container: #0b0c10 or #121318, 1px precise borders
- Primary accent: #8BCAFE (CTAs, highlights, active agent status, focus states)
- Secondary interactive: #1E293B
- Borders/dividers: #1E293B or #2A3649, 1px, occasional linear gradient to #8BCAFE at 20% opacity
- Muted text: #94A3B8; active text: #FFFFFF
- Headlines: geometric sans (Space Grotesk / Syne / Oswald), line-height 1.15, letter-spacing -0.03em
- Code/terminal: JetBrains Mono or Fira Code with ligatures
- UI text: Inter or Plus Jakarta Sans
- Primary AI trigger button: 1px linear-gradient border #8BCAFE -> transparent
- Hover on active panels: box-shadow 0 0 20px rgba(139,202,254,0.15)

## 2. Panels
### A. AI Agent Core Orchestrator
Left sidebar 320px, chat with prompt input at bottom, animated neon pulse (#8BCAFE) while thinking.
Stateful task router: core agent routes to CodeAgent, DesignAgent, DBAgent. Context sync: import Markdown knowledge vaults / Notion-style docs into the LLM system prompt.

### B. Secure Runtime Sandbox
Center-right flexible workspace. Top: multi-file editor with syntax highlighting. Bottom: hot-reloading web preview iframe + web terminal log.
WebContainers API (or similar isolated runtime) spinning up Node.js capable of Vite / Next.js / ESM servers; code strings from CodeAgent written into the FS and run. HMR without losing app state.

### C. Live AI Image Generation
Right floating asset panel / modal. Manual prompts and DesignAgent programmatic requests. Pluggable text-to-image provider (Flux / Stable Diffusion / Imagen). Compress output in a background pipeline, write into sandbox FS at /public/assets/<name>.png.

### D. Integrated Relational & Vector DB ("Data Inspector")
Bottom collapsible panel. Interactive grid of tables, schema topology, vector distance scores.
In-browser SQL engine (e.g. PGlite with pgvector, or SQLite WASM + a vector index). DBAgent alters schema from app mutations in sandbox code. Store embeddings for RAG.

### E. Export Engine
Top-right "DEPLOY / EXPORT" button in #8BCAFE.
1. Zip source bundle (package.json, lockfile, env example)
2. Production deploy payload (Vercel / Cloudflare Pages / container Dockerfile)
3. DB migration blueprint (SQL + Prisma schema)

## 3. Architecture
All engines communicate async through a central typed event broker:
prompt -> core agent emits parallel intents -> DBAgent schema update / CodeAgent code / DesignAgent image -> sandbox FS payload -> HMR reload -> preview -> export engine captures state.
Full type safety, optimized bundle loading (code-split heavy panels), strict #000000 / #8BCAFE identity.
