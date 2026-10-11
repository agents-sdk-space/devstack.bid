<div align="center">

<img src="./artifacts/devstack-banner.svg" alt="DEVSTACK · devstack.bid: build full-stack apps with AI agents" width="100%"/>

<br/>

[![Live](https://img.shields.io/badge/Live-devstack.bid-4da3ff?style=for-the-badge&logo=cloudflare&logoColor=white)](https://devstack.bid)
[![Docs](https://img.shields.io/badge/Docs-devstack.bid%2Fdocs-0a1520?style=for-the-badge&logo=readthedocs&logoColor=8fc4ff)](https://devstack.bid/docs)
[![License: MIT](https://img.shields.io/badge/License-MIT-0a1520?style=for-the-badge)](./LICENSE)

[English](#english) · [ภาษาไทย](#ภาษาไทย)

</div>

---

```text
~/devstack
```

## English

### What it is

**DevStack** is our community project, and **NVX Stack Builder** is the first product we run for free at [devstack.bid](https://devstack.bid). We built it because we were tired of starting every new project by searching ten tabs for which command comes first and what is different on Windows.

It turns developer command sequences (npm · nvm · npx · pip · PyPI · Node.js · Python) into ordered, de-duplicated, runnable **Stack Templates**, and it adds AI agents that help you plan and build the app.

| Live | What you get |
| --- | --- |
| [devstack.bid](https://devstack.bid) | **Stack Builder**: 10 curated templates and a 4-stage wizard (Start → Configure → Review & reorder → Export). Pick Node.js / Python versions, package managers and add-ons, then copy, share as a link, or download `setup.sh`, `setup.ps1`, `README.md` or a starter `.zip`. An AI planner (with an offline rule-based fallback) can build the plan for you. |
| [devstack.bid/chat](https://devstack.bid/chat) | **User Chat**: free AI chat on Cloudflare Workers AI, with General, Thai, Code, Image and Stronger (Hugging Face) modes. |
| [devstack.bid/chat/dev](https://devstack.bid/chat/dev) | **Dev Chat**: the Image and Research Orchestrator agent (OpenAI Agents API), with a live Sandbox panel showing commands, subagents, docs lookups, files and token usage. |
| [devstack.bid/factory](https://devstack.bid/factory) | **Sandbox Factory**: bring your own OpenAI key, pick a template (Orchestrator or Blank), a model and an environment (OpenAI-hosted or self-hosted with `codex exec-server`). |
| [devstack.bid/docs](https://devstack.bid/docs) | **Docs**: every page is built from the Markdown in `docs/`, with "Copy Markdown", raw `.md` URLs, Thai-aware search, and `/llms.txt` and `/llms-full.txt` for AI agents. |

> 🚧 **Studio workspace (in progress).** We are merging a browser workspace (multi-agent app builder with an in-browser sandbox and database) on the [`feat/studio`](https://github.com/agents-sdk-space/devstack.bid/tree/feat/studio) branch (v0.8.0-rc.2). It is not on `main` or live yet, so we will announce it when it ships.

Our rule since day one: **our server never runs commands for you.** Every command is text that you read, check and run on your own machine. Dev servers, publish steps (`npm publish`, `twine upload`) and manual steps are commented out in the generated scripts.

### Quick start

Requirements: Node.js 20.9+ (Node 22 LTS recommended) and npm.

```bash
git clone https://github.com/agents-sdk-space/devstack.bid.git
cd devstack.bid
npm install
cp .env.example .env.local      # optional: OPENAI_API_KEY for the real AI planner
npm run dev                     # http://localhost:3000
```

Production build: `npm run build` then `npm start`.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server (builds the docs bundle first) |
| `npm run build` / `npm start` | Production build and server |
| `npm test` | Vitest unit and component tests |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run export -- <templateId> [--out dir]` | Write `setup.sh` / `setup.ps1` / `README.md` for a template from the CLI |
| `npm run preview` | Build with OpenNext and preview locally in the Workers runtime |
| `npm run deploy` | Build with OpenNext and deploy to Cloudflare Workers |
| `npm run db:migrate:local` / `db:migrate:remote` | Apply D1 migrations (`nvx-db`) |
| `npm run docs:check` / `docs:bundle` / `docs:pdf` | Check, bundle or export the docs |

### Architecture

```text
Browser (client-first)                Cloudflare Worker: nvx-stack-builder
───────────────────────               ─────────────────────────────────────
pages + components (Next.js 16)  ──►  prerendered assets (OpenNext)
builder state · composer · share      /api/plan     → OpenAI Responses API → HF → offline planner
setup.sh / setup.ps1 / .zip           /api/chat/*   → Workers AI (binding AI) ⇄ Hugging Face
localStorage (lang, theme, state)     /api/factory  → OpenAI (your key, per request)
                                      D1 nvx-db     → chat history + free-tier quota counters
                                      Rate Limiting bindings (in-memory fallback elsewhere)
```

- **Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, Radix UI, zod, Vitest.
- **Data-driven:** templates are data, and composing commands is a pure, tested function.
- **Graceful degradation:** if the AI fails, the rule-based planner answers. If a rate-limit binding is missing, an in-memory limiter takes over.
- **Free-tier quotas** are stored in D1 per cookie, with a per-IP backstop, and reset at midnight Asia/Bangkok. User Chat gets 20 messages and 5 images a day. Dev Chat gets 5 agent turns a day per user and 30 site-wide.

Full write-up: [docs/architecture/overview.md](./docs/architecture/overview.md) · [chat-orchestrator.md](./docs/architecture/chat-orchestrator.md)

### Key handling

- The only server secret is `OPENAI_API_KEY`. It is read in one place (`src/lib/server/env.ts`, `server-only`) and is never logged or returned. `GET /api/plan` returns only `serverKeyConfigured: true/false`.
- **Bring your own key:** a key you paste in the UI goes in the `x-openai-key` header of that single request. It is never stored or logged and is redacted from errors.
- Never commit `.env.local` or `.dev.vars`. Only the empty `.env.example` / `.dev.vars.example` files are committed.
- On Cloudflare, set secrets through stdin so they never reach shell history:

```bash
printenv OPENAI_API_KEY | npx wrangler secret put OPENAI_API_KEY
```

### Deploy on Cloudflare Workers

The app is deployed with `@opennextjs/cloudflare`, and `devstack.bid` / `www.devstack.bid` are Workers Custom Domains (`www` → apex, 308).

```bash
npx wrangler login                 # or CLOUDFLARE_API_TOKEN (Workers Scripts: Edit, Account Settings: Read, D1: Edit)
npm run db:migrate:remote          # D1 migrations
printenv OPENAI_API_KEY | npx wrangler secret put OPENAI_API_KEY
npm run deploy
```

Full guide: [docs/DEPLOY.md](./docs/DEPLOY.md) · [docs/operations/deploy-cloudflare.md](./docs/operations/deploy-cloudflare.md) · [rollback.md](./docs/operations/rollback.md)

### Contributing

1. Fork, then create a branch.
2. Run `npm install` and `npm run dev`.
3. Make your change, add tests, then run `npm test && npm run lint && npm run build`.
4. Open a Pull Request and explain what you changed (Thai or English is fine).

See [CONTRIBUTING.md](./CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md). To add a Stack Template, read [docs/contributing/add-template.md](./docs/contributing/add-template.md).

### License

[MIT](./LICENSE) © 2026 NVX DEVELOPER BOTH and NVX Stack Builder contributors. Tool logos come from [Simple Icons](https://simpleicons.org) (CC0) and are trademarks of their owners. See [NOTICE](./NOTICE).

---

## ภาษาไทย

### DevStack คืออะไร

**DevStack** คือโครงการและชุมชนของเรา ส่วน **NVX Stack Builder** คือผลิตภัณฑ์ตัวแรกที่เราเปิดให้ใช้ฟรีที่ [devstack.bid](https://devstack.bid) เราสร้างมันขึ้นมาเพราะเบื่อการเริ่มโปรเจกต์ใหม่แล้วต้องไล่ค้นคำสั่งจากสิบแท็บ ว่าต้องติดตั้งอะไรก่อนหลัง และบน Windows ต้องพิมพ์ต่างกันตรงไหน

มันเปลี่ยนลำดับคำสั่งของนักพัฒนา (npm · nvm · npx · pip · PyPI · Node.js · Python) ให้เป็น **Stack Template** ที่เรียงลำดับแล้ว ตัดคำสั่งซ้ำแล้ว และรันได้จริง พร้อม AI agent ที่ช่วยวางแผนและสร้างแอป

| ลิงก์ | ได้อะไร |
| --- | --- |
| [devstack.bid](https://devstack.bid) | **Stack Builder** มีเทมเพลตคัดสรร 10 แบบ และวิซาร์ด 4 ขั้น (เริ่มต้น → ตั้งค่า → ตรวจและจัดลำดับ → ส่งออก) เลือกเวอร์ชัน Node.js / Python, package manager และ add-on แล้วคัดลอก แชร์เป็นลิงก์ หรือดาวน์โหลด `setup.sh`, `setup.ps1`, `README.md`, `.zip` ได้ มี AI planner ช่วยวางแผนให้ (ถ้า AI ใช้ไม่ได้จะสลับไปใช้ตัววางแผนแบบกฎที่ทำงานออฟไลน์) |
| [devstack.bid/chat](https://devstack.bid/chat) | **User Chat** แชต AI ฟรีบน Cloudflare Workers AI มีโหมดทั่วไป ภาษาไทย โค้ด ภาพ และโหมดแรงขึ้น (Hugging Face) |
| [devstack.bid/chat/dev](https://devstack.bid/chat/dev) | **Dev Chat** คุยกับ Orchestrator agent (OpenAI Agents API) พร้อมแผง Sandbox ที่แสดงคำสั่ง subagent การค้นเอกสาร ไฟล์ และการใช้ token แบบสด ๆ |
| [devstack.bid/factory](https://devstack.bid/factory) | **Sandbox Factory** ใช้ OpenAI key ของคุณเอง เลือกเทมเพลต (Orchestrator หรือ Blank) โมเดล และสภาพแวดล้อม (OpenAI-hosted หรือ self-hosted ผ่าน `codex exec-server`) |
| [devstack.bid/docs](https://devstack.bid/docs) | **เอกสาร** ทุกหน้าสร้างจาก Markdown ใน `docs/` มีปุ่มคัดลอก Markdown, URL ไฟล์ดิบ `.md`, ช่องค้นหาที่รองรับภาษาไทย และ `/llms.txt`, `/llms-full.txt` สำหรับ AI agent |

> 🚧 **Studio workspace (กำลังพัฒนา)** เรากำลังรวมพื้นที่ทำงานในเบราว์เซอร์ (ตัวสร้างแอปแบบหลาย agent พร้อม sandbox และฐานข้อมูลในเบราว์เซอร์) อยู่ใน branch [`feat/studio`](https://github.com/agents-sdk-space/devstack.bid/tree/feat/studio) (v0.8.0-rc.2) ตอนนี้ยังไม่อยู่บน `main` และยังไม่เปิดใช้จริง เสร็จเมื่อไรเราจะประกาศให้รู้

สิ่งที่เรายึดไว้ตั้งแต่วันแรก: **เซิร์ฟเวอร์ของเราไม่เคยรันคำสั่งใด ๆ แทนคุณ** ทุกคำสั่งเป็นข้อความให้คุณอ่าน ตรวจ แล้วรันเองบนเครื่องของคุณ

### เริ่มต้นใช้งาน

ต้องมี Node.js 20.9 ขึ้นไป (แนะนำ Node 22 LTS) และ npm

```bash
git clone https://github.com/agents-sdk-space/devstack.bid.git
cd devstack.bid
npm install
cp .env.example .env.local      # ไม่บังคับ: ใส่ OPENAI_API_KEY เพื่อใช้ AI planner จริง
npm run dev                     # เปิด http://localhost:3000
```

คำสั่งทั้งหมดดูได้ในตาราง [Scripts](#scripts) ด้านบน หรือที่ [docs/reference/npm-scripts.md](./docs/reference/npm-scripts.md)

### สถาปัตยกรรม

แอป Next.js 16 ที่ทำงานฝั่ง client เป็นหลัก deploy เป็น Cloudflare Worker ผ่าน OpenNext มี `/api/plan` (AI planner), `/api/chat/*` (Workers AI + Hugging Face), `/api/factory` (ใช้ key ของคุณ) และฐานข้อมูล D1 `nvx-db` สำหรับประวัติแชตและตัวนับโควตาฟรี (นับต่อ cookie และมีเพดานต่อ IP รีเซ็ตตอนเที่ยงคืนเวลาไทย) อ่านต่อที่ [docs/architecture/overview.md](./docs/architecture/overview.md)

### การจัดการ key

- secret ฝั่งเซิร์ฟเวอร์มีตัวเดียวคือ `OPENAI_API_KEY` เราอ่านค่านี้ที่เดียว ไม่บันทึก log และไม่ส่งกลับไปที่ client
- key ที่คุณวางใน UI จะถูกส่งไปกับ header `x-openai-key` ในคำขอนั้นครั้งเดียว เราไม่เก็บ ไม่บันทึก log และลบออกจากข้อความ error ทุกข้อความ
- ห้าม commit ไฟล์ `.env.local` และ `.dev.vars` เวลาตั้ง secret บน Cloudflare ให้ส่งผ่าน stdin: `printenv OPENAI_API_KEY | npx wrangler secret put OPENAI_API_KEY`

### Deploy บน Cloudflare Workers

`npm run db:migrate:remote` → ตั้ง secret ผ่าน stdin → `npm run deploy` อ่านคู่มือเต็มได้ที่ [docs/DEPLOY.md](./docs/DEPLOY.md)

### ร่วมพัฒนากับเรา

1. Fork แล้วสร้าง branch ใหม่
2. รัน `npm install` แล้ว `npm run dev`
3. แก้ไขและเพิ่มเทสต์ แล้วรัน `npm test && npm run lint && npm run build` ให้ผ่าน
4. เปิด Pull Request แล้วอธิบายว่าเปลี่ยนอะไร (เขียนไทยหรืออังกฤษก็ได้)

อ่านรายละเอียดที่ [CONTRIBUTING.md](./CONTRIBUTING.md) และโปรดปฏิบัติตาม [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) เรายินดีต้อนรับทุกคนครับ 🙌

### License

[MIT](./LICENSE) © 2026 NVX DEVELOPER BOTH และผู้ร่วมพัฒนา NVX Stack Builder

---

<div align="center">

```text
> curl -fsSL https://devstack.bid/llms.txt
> ▌
```

<sub>Built by the DevStack community · สร้างโดยชุมชน DevStack · <a href="https://devstack.bid">devstack.bid</a></sub>

</div>
