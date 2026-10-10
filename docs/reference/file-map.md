# File map

แผนที่ไฟล์ทั้งหมดใน repo (ยกเว้น `node_modules`, ไฟล์ build และภาพหน้าจอ) พร้อมลิงก์และหน้าที่ ใช้หาว่า "ต้องแก้ที่ไหน" docs:check ตรวจว่าทุกลิงก์ในหน้านี้ยังชี้ไฟล์ที่มีอยู่จริง

## Root

| ไฟล์ | หน้าที่ |
|---|---|
| [`package.json`](../../package.json) | dependencies, npm scripts ([npm-scripts.md](./npm-scripts.md)) |
| [`next.config.ts`](../../next.config.ts) | Cache Components, security headers, real-404 rewrite, dev bindings |
| [`wrangler.jsonc`](../../wrangler.jsonc) | Worker config, vars, rate limits |
| [`open-next.config.ts`](../../open-next.config.ts) | OpenNext: static-assets incremental cache |
| [`cloudflare-env.d.ts`](../../cloudflare-env.d.ts) | ชนิดของ Cloudflare bindings |
| [`tsconfig.json`](../../tsconfig.json), [`eslint.config.mjs`](../../eslint.config.mjs), [`vitest.config.mts`](../../vitest.config.mts) | TypeScript, ESLint, Vitest |
| [`.env.example`](../../.env.example), [`.dev.vars.example`](../../.dev.vars.example) | ตัวอย่าง env |
| [`AGENTS.md`](../../AGENTS.md) | กติกาสำหรับ AI agent |
| [`README.md`](../../README.md), [`CHANGELOG.md`](../../CHANGELOG.md), [`CONTRIBUTING.md`](../../CONTRIBUTING.md), [`CODE_OF_CONDUCT.md`](../../CODE_OF_CONDUCT.md), [`LICENSE`](../../LICENSE), [`NOTICE`](../../NOTICE) | เอกสารโครงการ, สัญญาอนุญาต (MIT), เครื่องหมายการค้า |
| [`public/_headers`](../../public/_headers) | headers ของ static assets บน Workers |
| [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) | CI: lint, typecheck, test, docs:check |

## `src/app` — routes

| ไฟล์ | หน้าที่ |
|---|---|
| [`src/app/layout.tsx`](../../src/app/layout.tsx) | root layout, ฟอนต์, `<html class="dark">`, สคริปต์ pre-paint, providers |
| [`src/app/page.tsx`](../../src/app/page.tsx) | หน้าแรก `/` |
| [`src/app/templates/page.tsx`](../../src/app/templates/page.tsx) | catalog `/templates` |
| [`src/app/templates/[id]/page.tsx`](../../src/app/templates/[id]/page.tsx) | รายละเอียดเทมเพลต |
| [`src/app/builder/page.tsx`](../../src/app/builder/page.tsx) | `/builder` |
| [`src/app/design/page.tsx`](../../src/app/design/page.tsx) | `/design` style guide |
| [`src/app/not-found.tsx`](../../src/app/not-found.tsx) | หน้า 404 |
| [`src/app/api/plan/route.ts`](../../src/app/api/plan/route.ts) | API `/api/plan` |
| [`src/app/tokens.css`](../../src/app/tokens.css), [`src/app/globals.css`](../../src/app/globals.css) | design tokens และ Tailwind theme |

## `src/components` — feature components

| ไฟล์ | หน้าที่ |
|---|---|
| [`builder.tsx`](../../src/components/builder.tsx) | ตัวสร้าง 4 ขั้น, state, export |
| [`builder-loader.tsx`](../../src/components/builder-loader.tsx) | โหลด builder ฝั่ง client + skeleton |
| [`sortable-steps.tsx`](../../src/components/sortable-steps.tsx) | ลากจัดลำดับ (dnd-kit) |
| [`step-card.tsx`](../../src/components/step-card.tsx) | การ์ดขั้นตอน |
| [`agent-panel.tsx`](../../src/components/agent-panel.tsx) | แผง AI agent |
| [`catalog.tsx`](../../src/components/catalog.tsx), [`template-card.tsx`](../../src/components/template-card.tsx), [`template-detail.tsx`](../../src/components/template-detail.tsx) | catalog และรายละเอียด |
| [`header.tsx`](../../src/components/header.tsx) | header, nav, footer |
| [`command-palette.tsx`](../../src/components/command-palette.tsx) | Ctrl/⌘+K |
| [`prefs.tsx`](../../src/components/prefs.tsx), [`providers.tsx`](../../src/components/providers.tsx) | ภาษา/ธีม, providers (toast, tooltip) |
| [`os-toggle.tsx`](../../src/components/os-toggle.tsx), [`copy-button.tsx`](../../src/components/copy-button.tsx) | สลับ POSIX/Windows, ปุ่มคัดลอก |
| [`design-system.tsx`](../../src/components/design-system.tsx) | เนื้อหา `/design` |
| [`brand/tool-icon.tsx`](../../src/components/brand/tool-icon.tsx), [`brand/brand-icons.data.ts`](../../src/components/brand/brand-icons.data.ts) | โลโก้เครื่องมือ |
| [`ui/index.ts`](../../src/components/ui/index.ts) | ไลบรารีคอมโพเนนต์ NVX UI (badge, button, card, checkbox, code-block, dialog, empty-state, field, kbd, segmented, skeleton, stepper, tabs, toast, tooltip, icons, cn, copy) |

## `src/lib` — logic

| ไฟล์ | หน้าที่ |
|---|---|
| [`types.ts`](../../src/lib/types.ts) | ชนิดข้อมูลหลัก |
| [`composer.ts`](../../src/lib/composer.ts), [`placeholders.ts`](../../src/lib/placeholders.ts) | ประกอบคำสั่ง |
| [`scripts.ts`](../../src/lib/scripts.ts), [`download.ts`](../../src/lib/download.ts) | setup.sh/ps1/README/zip |
| [`share.ts`](../../src/lib/share.ts) | ลิงก์แชร์ |
| [`sanitize.ts`](../../src/lib/sanitize.ts) | sanitizer |
| [`i18n.ts`](../../src/lib/i18n.ts) | ข้อความ UI สองภาษา, `CATEGORY_LABELS` |
| [`design-tokens.ts`](../../src/lib/design-tokens.ts) | manifest ของ token |
| [`rate-limit.ts`](../../src/lib/rate-limit.ts) | limiter ในหน่วยความจำ |
| [`security-headers.ts`](../../src/lib/security-headers.ts) | CSP และ headers |
| [`ai/openai.ts`](../../src/lib/ai/openai.ts), [`ai/schema.ts`](../../src/lib/ai/schema.ts), [`ai/plan.ts`](../../src/lib/ai/plan.ts), [`ai/fallback.ts`](../../src/lib/ai/fallback.ts), [`ai/types.ts`](../../src/lib/ai/types.ts) | AI planner |
| [`server/env.ts`](../../src/lib/server/env.ts), [`server/http.ts`](../../src/lib/server/http.ts), [`server/rate-limit.ts`](../../src/lib/server/rate-limit.ts) | ฝั่งเซิร์ฟเวอร์เท่านั้น (`server-only`) |

## `src/data` — templates

| ไฟล์ | หน้าที่ |
|---|---|
| [`templates/index.ts`](../../src/data/templates/index.ts) | registry |
| [`template-ids.ts`](../../src/data/template-ids.ts) | id สำหรับ 404 rewrite |
| [`common-steps.ts`](../../src/data/common-steps.ts), [`runtime-steps.ts`](../../src/data/runtime-steps.ts), [`addon-steps.ts`](../../src/data/addon-steps.ts) | ขั้นร่วม, runtime, add-on |
| [`templates/nextjs-dashboard.ts`](../../src/data/templates/nextjs-dashboard.ts) · [`vite-react-game.ts`](../../src/data/templates/vite-react-game.ts) · [`express-api.ts`](../../src/data/templates/express-api.ts) · [`fastapi-ai.ts`](../../src/data/templates/fastapi-ai.ts) · [`streamlit-dashboard.ts`](../../src/data/templates/streamlit-dashboard.ts) · [`node-cli-npx.ts`](../../src/data/templates/node-cli-npx.ts) · [`pypi-package.ts`](../../src/data/templates/pypi-package.ts) · [`collab-workspace.ts`](../../src/data/templates/collab-workspace.ts) · [`react-admin-tool.ts`](../../src/data/templates/react-admin-tool.ts) · [`nextjs-ai-chat.ts`](../../src/data/templates/nextjs-ai-chat.ts) | เทมเพลต 10 ตัว |

## `scripts/` และ `tests/`

| ไฟล์ | หน้าที่ |
|---|---|
| [`scripts/export-template.ts`](../../scripts/export-template.ts) | CLI export |
| [`scripts/gen-brand-icons.mjs`](../../scripts/gen-brand-icons.mjs) | สร้างข้อมูลโลโก้ |
| [`scripts/patch-opennext.mjs`](../../scripts/patch-opennext.mjs) | patch adapter |
| [`scripts/docs-check.mjs`](../../scripts/docs-check.mjs), [`scripts/docs-pdf.mjs`](../../scripts/docs-pdf.mjs) | เครื่องมือเอกสาร |
| [`tests/composer.test.ts`](../../tests/composer.test.ts), [`tests/scripts-share-ai.test.ts`](../../tests/scripts-share-ai.test.ts), [`tests/production.test.ts`](../../tests/production.test.ts), [`tests/tokens.test.ts`](../../tests/tokens.test.ts), [`tests/ui-components.test.tsx`](../../tests/ui-components.test.tsx), [`tests/tool-icons.test.tsx`](../../tests/tool-icons.test.tsx), [`tests/docs-check.test.ts`](../../tests/docs-check.test.ts), [`tests/setup.ts`](../../tests/setup.ts) | ชุด test ([testing.md](../contributing/testing.md)) |

## `docs/`

ดู [docs/README.md](../README.md) สำหรับแผนผังเอกสารทั้งหมด
