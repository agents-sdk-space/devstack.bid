# การดูแลเอกสารให้ทันสมัย · Keeping docs current

เป้าหมาย: ให้คนและ AI agent **เชื่อเอกสารได้** และหาเอกสาร/ตัวอย่างโค้ดได้ง่ายเมื่อ repo เปลี่ยน วิธีคือ (1) กติกาว่าการเปลี่ยนแบบไหนต้องแก้เอกสารหน้าไหน (2) การตรวจอัตโนมัติ `npm run docs:check` ที่ล้มใน CI

## `npm run docs:check` ตรวจอะไร

สคริปต์ [`scripts/docs-check.mjs`](../../scripts/docs-check.mjs) (Node ล้วน ไม่มี dependency) ตรวจ:

1. **ความยาวขั้นต่ำ** ทุกไฟล์ `docs/**/*.md` ต้องมีเนื้อหาอย่างน้อย **500 ตัวอักษร** นับหลังตัด code block, URL ของลิงก์, สัญลักษณ์ Markdown และช่องว่างซ้ำ (กันหน้าที่มีแต่โค้ดหรือหัวข้อ)
2. **ลิงก์สัมพัทธ์** ทุก `[text](path)` ที่ไม่ใช่ `http(s):`, `mailto:` หรือ `#anchor` ต้องชี้ไฟล์/โฟลเดอร์ที่มีอยู่จริง (ตัด `#anchor` ออกก่อน) ใน `docs/`, `README.md`, `AGENTS.md`
3. **path ใน backtick** เช่น `` `src/lib/composer.ts` `` ที่ขึ้นต้นด้วย `src/`, `scripts/`, `tests/`, `docs/`, `public/` ต้องมีอยู่จริง (ข้าม path ที่มี `<`, `*`, `{`, `[` หรือ `...` เพราะเป็นรูปแบบ ไม่ใช่ไฟล์จริง)
4. **template id** ทุกตัวใน [`src/data/template-ids.ts`](../../src/data/template-ids.ts) ต้องปรากฏใน `docs/reference/template-schema.md` และ `docs/user-guide/templates.md`
5. **env var** ทุกตัวใน schema ของ [`src/lib/server/env.ts`](../../src/lib/server/env.ts), `vars` ใน `wrangler.jsonc`, `.env.example`, `.dev.vars.example` ชื่อ rate-limit binding และ binding ของ D1/R2 (`d1_databases`, `r2_buckets`) ต้องปรากฏใน `docs/reference/config-env.md`
6. **npm scripts** ทุกตัวใน `package.json` ต้องปรากฏใน `docs/reference/npm-scripts.md`
7. **platform-manifest.json** parse ได้, `templateIds` ตรงกับโค้ด และทุก path ใน `keyFiles` ของแต่ละ subsystem มีอยู่จริง

ผลลัพธ์: พิมพ์ทุกปัญหาแล้ว exit code 1 ถ้ามีปัญหา, 0 ถ้าผ่าน ใช้ `npm run docs:check -- --report` เพื่อพิมพ์จำนวนตัวอักษรของทุกหน้า

## เอกสารในแอป (`/docs`) อัปเดตเอง

ไฟล์ทุกไฟล์ใน `docs/` ถูกคอมไพล์เป็นหน้า `/docs/<slug>` ทุกครั้งที่ build (`scripts/build-docs.mjs`, ดู [docs-site.md](../architecture/docs-site.md)) จึงไม่มีอะไรต้อง sync ด้วยมือ สิ่งที่ต้องทำเพิ่มมีแค่:

- **เพิ่มหน้าใหม่** ใส่ชื่อไฟล์ใน `SECTIONS` ของ `scripts/build-docs.mjs` เพื่อกำหนดลำดับใน drawer (ถ้าไม่ใส่ หน้าจะไปอยู่ท้ายหมวดของโฟลเดอร์นั้นตามตัวอักษร) และเพิ่มลิงก์ใน `docs/README.md`
- **แก้ diagram Mermaid** รัน `PLAYWRIGHT_DIR=/tmp/pw npm run docs:diagrams` แล้ว commit ไฟล์ SVG ใหม่ใน `public/docs-assets/diagrams/`
- หัวข้อ `#` แรกของไฟล์คือชื่อหน้า ส่วนชื่อสั้นใน drawer คือข้อความก่อน " · " หรือ " — " และย่อหน้าแรกคือคำอธิบาย (meta description และ llms.txt)
- ลิงก์ระหว่างไฟล์ให้ใช้ path สัมพัทธ์ไปไฟล์ `.md` ตามปกติ ระบบแปลงเป็น URL ของ `/docs` ให้เอง

## Checklist สำหรับทุก PR (คัดลอกไปใส่คำอธิบาย PR)

```markdown
### Docs checklist
- [ ] `npm run docs:check` ผ่าน
- [ ] เพิ่ม/ลบ/เปลี่ยนชื่อ template → templates.md, template-schema.md, platform-manifest.json
- [ ] เพิ่ม/เปลี่ยน env var หรือ binding → config-env.md, env-secrets.md, .env.example / .dev.vars.example, DEPLOY.md
- [ ] เปลี่ยน /api/plan (request, response, status code, limit) → api-plan.md, ai-planner.md, api-hardening.md
- [ ] เพิ่ม npm script → npm-scripts.md
- [ ] เพิ่มหน้าเอกสาร → `SECTIONS` ใน scripts/build-docs.mjs + docs/README.md; แก้ Mermaid → `npm run docs:diagrams`
- [ ] เพิ่ม/ย้ายไฟล์สำคัญ → file-map.md, platform-manifest.json
- [ ] เปลี่ยน token/คอมโพเนนต์/ดีไซน์ → UI-FRAMEWORK.md, /design, design-system.md
- [ ] เปลี่ยนพฤติกรรมที่ผู้ใช้เห็น → user-guide/ ที่เกี่ยวข้อง
- [ ] เปลี่ยน deploy/runtime → cloudflare-runtime.md, deploy-cloudflare.md, DEPLOY.md
- [ ] CHANGELOG `[Unreleased]` และ (ตอน release) SUBSYSTEM-HISTORY.md
```

## ตารางจับคู่: เปลี่ยนโค้ดตรงไหน → แก้เอกสารหน้าไหน

| โค้ด | เอกสาร |
|---|---|
| `src/data/templates/*`, `template-ids.ts` | user-guide/templates.md, reference/template-schema.md, agents/platform-manifest.json |
| `src/lib/composer.ts`, `placeholders.ts`, `types.ts` | concepts/composition.md, architecture/templates-and-composer.md, reference/template-schema.md |
| `src/lib/sanitize.ts` | concepts/safety-model.md |
| `src/lib/scripts.ts`, `download.ts`, `share.ts` | user-guide/downloads.md, user-guide/sharing.md, architecture/scripts-and-share.md |
| `src/app/api/plan/route.ts`, `src/lib/ai/*` | reference/api-plan.md, architecture/ai-planner.md, user-guide/ai-agent.md |
| `src/lib/server/*`, `security-headers.ts`, `next.config.ts` | architecture/api-hardening.md, operations/rate-limits-cost.md, reference/config-env.md |
| `wrangler.jsonc`, `open-next.config.ts` | architecture/cloudflare-runtime.md, operations/*, DEPLOY.md |
| `src/app/tokens.css`, `globals.css`, `src/components/ui/*` | UI-FRAMEWORK.md, concepts/design-system.md, architecture/ui-framework.md |
| `package.json` scripts | reference/npm-scripts.md |

## หลักการเขียน

- เขียนทั้ง **ขั้นตอน และเหตุผล** ผู้อ่านต้องตัดสินใจเองได้เมื่อสถานการณ์ต่างจากตัวอย่าง
- อ้าง **ไฟล์ต้นทางด้วยลิงก์สัมพัทธ์** เสมอ (docs:check จะจับเมื่อไฟล์ย้าย)
- ประวัติต้องอ้าง commit hash ห้ามเดา
- ภาษาไทยเป็นหลัก คงศัพท์เทคนิคภาษาอังกฤษ
- เวลาให้ระบุโซน (UTC+7)

## CI

workflow [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) รัน lint, typecheck, test และ docs:check ทุก push/PR (ยังไม่มีการ push repo นี้ขึ้น GitHub ในขณะนี้ ไฟล์จึงพร้อมใช้เมื่อ push)
