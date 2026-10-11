# เอกสาร DevStack · ยินดีต้อนรับ

สวัสดี และยินดีต้อนรับสู่เอกสารของ **DevStack** ([devstack.bid](https://devstack.bid)) เราสร้าง **NVX Stack Builder** ขึ้นมาเพราะเบื่อการเริ่มโปรเจกต์ใหม่แล้วต้องไล่ค้นคำสั่งจากสิบแท็บ ว่าต้องติดตั้งอะไรก่อนหลัง บน Windows ต้องพิมพ์ต่างกันตรงไหน เอกสารชุดนี้คือที่ที่เราเล่าทุกอย่างให้ชุมชนฟังอย่างตรงไปตรงมา ตั้งแต่วิธีใช้งานไปจนถึงเบื้องหลังที่ทำให้มันทำงานได้

> ภาษาหลักของเอกสารคือภาษาไทย และเราคงศัพท์เทคนิคเป็นภาษาอังกฤษ (เช่น template, composer, rate limit) เพื่อให้ค้นในโค้ดได้ตรงตัว หน้าที่มีฉบับภาษาอังกฤษจะบอกไว้ · Primary language: Thai with English technical terms. English sections are marked.

## DevStack กับ NVX Stack Builder

**DevStack** คือชื่อโครงการและชุมชนของเรา ส่วน **NVX Stack Builder** คือผลิตภัณฑ์ตัวแรกที่เราเปิดให้ใช้ฟรีที่ [devstack.bid](https://devstack.bid) มันเปลี่ยน "คำสั่งตั้งค่าโปรเจกต์" ให้เป็น **Stack Template** ที่เรียงลำดับแล้ว ตัดคำสั่งซ้ำแล้ว และมีคำอธิบายสองภาษา คุณเลือกเทมเพลตเอง หรือให้ AI agent ช่วยวางแผนก็ได้ จากนั้นปรับลำดับ ลบ เพิ่มขั้นตอน แล้วคัดลอก แชร์ หรือดาวน์โหลดเป็น `setup.sh` / `setup.ps1` / `.zip`

สิ่งที่เรายึดไว้ตั้งแต่วันแรกคือ **เซิร์ฟเวอร์ของเราไม่เคยรันคำสั่งใด ๆ แทนคุณ** ทุกคำสั่งเป็นข้อความให้คุณอ่าน ตรวจ แล้วรันเองบนเครื่องของคุณ เหตุผลอยู่ใน [Safety model](./concepts/safety-model.md)

## เอกสารชุดนี้ใช้งานได้จริง ไม่ใช่แค่ตัวอย่าง

ทุกหน้าที่คุณอ่านบน [devstack.bid/docs](https://devstack.bid/docs) สร้างจากไฟล์ Markdown จริงในโฟลเดอร์ `docs/` ของ repo ตอน build ไม่มีการเขียนเนื้อหาซ้ำอีกชุด เราจึงทำให้หยิบไปใช้ต่อได้ทันที:

- ปุ่ม **คัดลอก Markdown** ทุกหน้า ได้ไฟล์ต้นฉบับแบบไบต์ต่อไบต์ เอาไปวางใน wiki ของทีมหรือส่งให้ AI ได้เลย
- **ดูไฟล์ดิบ** เติม `.md` ท้าย URL เช่น `/docs/user-guide/getting-started.md` จะได้ `text/markdown` ตรง ๆ
- ทุกบล็อกโค้ดมีปุ่ม **คัดลอก** ของตัวเอง
- สำหรับ AI agent เรามี `/llms.txt` เป็นสารบัญลิงก์ไฟล์ดิบทุกหน้า และ `/llms-full.txt` รวมทุกหน้าไว้ในไฟล์เดียว
- ช่องค้นหาด้านซ้ายค้นได้ทั้งภาษาไทยและอังกฤษ และค้นจากในเบราว์เซอร์ทั้งหมด

ถ้าอยากรู้ว่าระบบเอกสารนี้ทำงานอย่างไร อ่านต่อที่ [Docs site](./architecture/docs-site.md)

## เริ่มอ่านตรงไหนดี · Who should read what

| คุณคือ | เริ่มที่ | จากนั้น |
|---|---|---|
| นักพัฒนาที่อยากได้คำสั่งตั้งค่าโปรเจกต์ | [Getting started](./user-guide/getting-started.md) | [Builder](./user-guide/builder.md), [AI agent](./user-guide/ai-agent.md), [Downloads](./user-guide/downloads.md), [FAQ](./user-guide/troubleshooting.md) |
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
  - [language-theme.md](./user-guide/language-theme.md) ภาษาไทย/อังกฤษ, ธีมดำ/สว่าง, command palette, หน้าเอกสาร
  - [troubleshooting.md](./user-guide/troubleshooting.md) ปัญหาที่พบบ่อยและ FAQ
- **concepts/** แนวคิดเบื้องหลัง
  - [stack-template.md](./concepts/stack-template.md), [composition.md](./concepts/composition.md), [safety-model.md](./concepts/safety-model.md), [design-system.md](./concepts/design-system.md)
- **architecture/** สถาปัตยกรรม
  - [overview.md](./architecture/overview.md), [data-flow.md](./architecture/data-flow.md), [templates-and-composer.md](./architecture/templates-and-composer.md), [scripts-and-share.md](./architecture/scripts-and-share.md), [ai-planner.md](./architecture/ai-planner.md), [api-hardening.md](./architecture/api-hardening.md), [ui-framework.md](./architecture/ui-framework.md), [cloudflare-runtime.md](./architecture/cloudflare-runtime.md), [docs-site.md](./architecture/docs-site.md)
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

เมื่อเอกสารกับโค้ดขัดกัน เราถือว่า **โค้ดคือความจริง** แล้วรีบแก้เอกสารให้ตรง แหล่งความจริงหลักคือ รายการเทมเพลต [`src/data/templates/index.ts`](../src/data/templates/index.ts), ชนิดข้อมูล [`src/lib/types.ts`](../src/lib/types.ts), ตรรกะการประกอบคำสั่ง [`src/lib/composer.ts`](../src/lib/composer.ts), ตัวแปรสภาพแวดล้อม [`src/lib/server/env.ts`](../src/lib/server/env.ts), การตั้งค่า Worker [`wrangler.jsonc`](../wrangler.jsonc), ค่าดีไซน์ [`src/app/tokens.css`](../src/app/tokens.css) และประวัติการเปลี่ยนแปลง [`CHANGELOG.md`](../CHANGELOG.md) + `git log`

เอกสารสร้างจากโค้ดและ git history จริง (v0.1.0 → v0.5.1) ทุกข้อเท็จจริงด้านประวัติอ้างอิง commit hash และ tag ตรวจย้อนได้ และมี `npm run docs:check` คอยตรวจว่าเอกสารยังตรงกับโค้ด (ดู [docs-maintenance](./contributing/docs-maintenance.md))

## ช่วยเราทำให้เอกสารดีขึ้น

เราเพิ่งเริ่มต้น และเอกสารที่ดีเกิดจากคำถามของคนที่ลองใช้จริง ถ้าเจอจุดที่อ่านแล้วงง ขั้นตอนที่ไม่ตรงกับหน้าจอ หรืออยากให้มีเทมเพลตใหม่ บอกเราได้เสมอ ผู้ร่วมพัฒนาเริ่มได้จาก [add-template.md](./contributing/add-template.md) และ [docs-maintenance.md](./contributing/docs-maintenance.md) ขอบคุณที่มาเป็นส่วนหนึ่งของ DevStack
