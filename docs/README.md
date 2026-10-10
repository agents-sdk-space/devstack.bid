# เอกสาร NVX Stack Builder · Documentation map

> ภาษาหลักของเอกสารชุดนี้คือภาษาไทย โดยคงศัพท์เทคนิคเป็นภาษาอังกฤษ (เช่น template, composer, rate limit) เพื่อให้ค้นหาในโค้ดได้ตรงตัว หน้าที่มีฉบับภาษาอังกฤษจะระบุไว้ · Primary language: Thai with English technical terms. English sections are marked.

NVX Stack Builder เป็นเว็บแอป (Next.js 16 App Router + TypeScript + Tailwind v4) ที่เปลี่ยน "คำสั่งตั้งค่าโปรเจกต์" ให้เป็น **Stack Template** ที่เรียงลำดับแล้ว ตัดคำสั่งซ้ำแล้ว และมีคำอธิบายสองภาษา ผู้ใช้เลือกเทมเพลตหรือให้ AI agent วางแผนให้ จากนั้นปรับลำดับ ลบ เพิ่มขั้นตอน แล้วคัดลอก แชร์ หรือดาวน์โหลดเป็น `setup.sh` / `setup.ps1` / `.zip` ได้ **เซิร์ฟเวอร์ไม่เคยรันคำสั่งใด ๆ** ทุกคำสั่งเป็นข้อความให้ผู้ใช้ตรวจและรันเองบนเครื่องของตน

เอกสารชุดนี้สร้างจากโค้ดและ git history จริง (v0.1.0 → v0.2.0 → v0.3.0 → terminal theme v0.4 → v0.5) ทุกข้อเท็จจริงด้านประวัติอ้างอิง commit hash และ tag เพื่อให้ตรวจสอบย้อนกลับได้ และมีสคริปต์ `npm run docs:check` คอยตรวจว่าเอกสารยังตรงกับโค้ด (ดู [docs-maintenance](./contributing/docs-maintenance.md))

## ใครควรอ่านอะไร · Who should read what

| ผู้อ่าน | เริ่มที่ | จากนั้น |
|---|---|---|
| ผู้ใช้ทั่วไป (นักพัฒนาที่อยากได้คำสั่งตั้งค่าโปรเจกต์) | [Getting started](./user-guide/getting-started.md) | [Builder](./user-guide/builder.md), [AI agent](./user-guide/ai-agent.md), [Downloads](./user-guide/downloads.md), [FAQ](./user-guide/troubleshooting.md) |
| ผู้ร่วมพัฒนา (contributor) | [Concepts: Stack Template](./concepts/stack-template.md) | [Add a template](./contributing/add-template.md), [Testing](./contributing/testing.md), [File map](./reference/file-map.md) |
| ผู้ดูแลระบบ / DevOps | [Local dev](./operations/local-dev.md) | [Env & secrets](./operations/env-secrets.md), [Deploy](./operations/deploy-cloudflare.md), [Rollback](./operations/rollback.md), [Monitoring](./operations/monitoring.md) |
| สถาปนิก / reviewer | [Architecture overview](./architecture/overview.md) | [Data flow](./architecture/data-flow.md), [Subsystem history](./history/SUBSYSTEM-HISTORY.md) |
| AI agent ที่ต้องดูแลแพลตฟอร์ม | [AGENTS.md](../AGENTS.md) | [Agent playbook](./agents/AGENT-PLAYBOOK.md), [platform-manifest.json](./agents/platform-manifest.json) |

## แผนผังเอกสาร · Site map

- **user-guide/** คู่มือผู้ใช้
  - [getting-started.md](./user-guide/getting-started.md) เริ่มต้นใช้งานใน 5 นาที
  - [templates.md](./user-guide/templates.md) ค้นหาและใช้ Stack Template ทั้ง 10 แบบ
  - [builder.md](./user-guide/builder.md) ตัวสร้างสแต็ก 4 ขั้น (Start → Configure → Review & reorder → Export)
  - [ai-agent.md](./user-guide/ai-agent.md) AI planner: key ของเซิร์ฟเวอร์, key ของตัวเอง, offline fallback
  - [sharing.md](./user-guide/sharing.md) ลิงก์แชร์ `#s=` และ `#t=`
  - [downloads.md](./user-guide/downloads.md) `setup.sh`, `setup.ps1`, `README.md`, starter `.zip`
  - [language-theme.md](./user-guide/language-theme.md) ภาษาไทย/อังกฤษ, ธีมดำ/สว่าง, command palette
  - [troubleshooting.md](./user-guide/troubleshooting.md) ปัญหาที่พบบ่อยและ FAQ
- **concepts/** แนวคิดเบื้องหลัง
  - [stack-template.md](./concepts/stack-template.md), [composition.md](./concepts/composition.md), [safety-model.md](./concepts/safety-model.md), [design-system.md](./concepts/design-system.md)
- **architecture/** สถาปัตยกรรม
  - [overview.md](./architecture/overview.md), [data-flow.md](./architecture/data-flow.md), [templates-and-composer.md](./architecture/templates-and-composer.md), [scripts-and-share.md](./architecture/scripts-and-share.md), [ai-planner.md](./architecture/ai-planner.md), [api-hardening.md](./architecture/api-hardening.md), [ui-framework.md](./architecture/ui-framework.md), [cloudflare-runtime.md](./architecture/cloudflare-runtime.md)
- **history/** [SUBSYSTEM-HISTORY.md](./history/SUBSYSTEM-HISTORY.md) ไทม์ไลน์ของแต่ละ subsystem พร้อม commit
- **operations/** การรันและดูแล
  - [local-dev.md](./operations/local-dev.md), [env-secrets.md](./operations/env-secrets.md), [deploy-cloudflare.md](./operations/deploy-cloudflare.md), [rollback.md](./operations/rollback.md), [monitoring.md](./operations/monitoring.md), [rate-limits-cost.md](./operations/rate-limits-cost.md), [custom-domain.md](./operations/custom-domain.md)
  - คู่มือ deploy ฉบับเต็มเดิม: [DEPLOY.md](./DEPLOY.md) (TH + EN)
- **contributing/** การร่วมพัฒนา
  - [add-template.md](./contributing/add-template.md), [add-component.md](./contributing/add-component.md), [testing.md](./contributing/testing.md), [release-process.md](./contributing/release-process.md), [docs-maintenance.md](./contributing/docs-maintenance.md)
- **reference/** ข้อมูลอ้างอิง
  - [api-plan.md](./reference/api-plan.md), [template-schema.md](./reference/template-schema.md), [config-env.md](./reference/config-env.md), [npm-scripts.md](./reference/npm-scripts.md), [file-map.md](./reference/file-map.md)
- **agents/** สำหรับ AI agent: [AGENT-PLAYBOOK.md](./agents/AGENT-PLAYBOOK.md), [platform-manifest.json](./agents/platform-manifest.json)
- เอกสารเดิม: [UI-FRAMEWORK.md](./UI-FRAMEWORK.md) (ระบบดีไซน์ NVX UI, TH + EN)

## แหล่งความจริง · Where truth lives

เมื่อเอกสารกับโค้ดขัดกัน **โค้ดคือความจริง** แล้วให้แก้เอกสาร แหล่งความจริงหลัก: รายการเทมเพลต [`src/data/templates/index.ts`](../src/data/templates/index.ts), ชนิดข้อมูล [`src/lib/types.ts`](../src/lib/types.ts), ตรรกะการประกอบคำสั่ง [`src/lib/composer.ts`](../src/lib/composer.ts), ตัวแปรสภาพแวดล้อม [`src/lib/server/env.ts`](../src/lib/server/env.ts), การตั้งค่า Worker [`wrangler.jsonc`](../wrangler.jsonc), ค่าดีไซน์ [`src/app/tokens.css`](../src/app/tokens.css) และประวัติการเปลี่ยนแปลง [`CHANGELOG.md`](../CHANGELOG.md) + `git log`
