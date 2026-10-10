# เพิ่ม Stack Template · Adding a template

หน้านี้เป็นคู่มือทีละขั้นพร้อมตัวอย่างเต็ม และอธิบายว่าทำไมต้องแตะแต่ละไฟล์ checklist ต้นฉบับยังอยู่ใน [CONTRIBUTING.md](../../CONTRIBUTING.md) แนวคิดอ่านที่ [stack-template.md](../concepts/stack-template.md)

## ไฟล์ที่ต้องแตะ

| ไฟล์ | ทำอะไร | ทำไม |
|---|---|---|
| `src/data/templates/<id>.ts` | สร้างเทมเพลต (default export `StackTemplate`) | ตัวข้อมูล |
| [`src/data/templates/index.ts`](../../src/data/templates/index.ts) | import และเพิ่มใน `TEMPLATES` | registry ที่ทุกส่วนใช้ (catalog, builder, AI enum, fallback) |
| [`src/data/template-ids.ts`](../../src/data/template-ids.ts) | เพิ่ม id ใน `KNOWN_TEMPLATE_IDS` | ไม่งั้นหน้า `/templates/<id>` จะได้ 404 จาก rewrite; test บังคับให้ตรงกัน |
| [`src/components/brand/tool-icon.tsx`](../../src/components/brand/tool-icon.tsx) | (ไม่บังคับ) เพิ่มใน `TEMPLATE_TOOLS` | เลือกโลโก้หลักบนการ์ด ถ้าไม่ใส่จะเดาจาก tags/runtime |
| `src/lib/types.ts` + `CATEGORY_LABELS` ใน `src/lib/i18n.ts` | เฉพาะเมื่อมีหมวดใหม่ | ชนิด `Category` และป้ายสองภาษา |
| `docs/user-guide/templates.md`, `docs/reference/template-schema.md`, `docs/agents/platform-manifest.json` | เพิ่มแถว/รายการ | `npm run docs:check` ล้มถ้า id ไม่อยู่ในเอกสาร |
| `CHANGELOG.md` | บันทึกใต้ `[Unreleased]` | ประวัติ |

## ตัวอย่างเต็ม (ตัวอย่างประกอบ ไม่ได้อยู่ใน repo)

สมมติเพิ่มเทมเพลต API ด้วย Hono บน Node:

```ts
// src/data/templates/hono-api.ts
import type { StackTemplate } from "@/lib/types";
import { mkdirAndCd, npmInit } from "../common-steps";

const server = `import { serve } from "@hono/node-server";
import { Hono } from "hono";

const app = new Hono();
app.get("/health", (c) => c.json({ ok: true, service: "{{name}}" }));

serve({ fetch: app.fetch, port: Number(process.env.PORT) || 3000 }, (info) =>
  console.log("API ready on http://localhost:" + info.port)
);
`;

const template: StackTemplate = {
  id: "hono-api",
  name: { en: "Hono API on Node", th: "API ด้วย Hono บน Node" },
  summary: {
    en: "A tiny Hono web API running on Node with a health check.",
    th: "Web API ขนาดเล็กด้วย Hono รันบน Node พร้อม health check",
  },
  category: "api",
  runtimes: ["node"],
  tags: ["Node.js", "Hono", "API"],
  supportedAddons: ["testing", "docker", "ci"],
  defaultAddons: [],
  defaultName: "nvx-hono-api",
  keywords: ["hono", "api", "edge", "เอพีไอ", "หลังบ้าน"],
  fileTree: ["{{name}}/", "  src/index.js", "  package.json"],
  steps: [
    mkdirAndCd,
    npmInit,
    {
      id: "hono-deps",
      title: { en: "Install Hono", th: "ติดตั้ง Hono" },
      explanation: {
        en: "hono is the router; @hono/node-server adapts it to Node's HTTP server.",
        th: "hono คือ router ส่วน @hono/node-server ทำให้รันบน HTTP server ของ Node ได้",
      },
      commands: ["{{add}} hono @hono/node-server"],
      expected: { en: "hono is in dependencies.", th: "hono อยู่ใน dependencies" },
      verify: "{{list}} hono",
    },
    {
      id: "hono-scripts",
      title: { en: "Enable ES modules and scripts", th: "เปิด ES modules และเพิ่ม scripts" },
      explanation: {
        en: "Use import syntax and add a dev script that restarts on save.",
        th: "ใช้ import และเพิ่ม script dev ที่รีสตาร์ทเมื่อบันทึกไฟล์",
      },
      commands: ["npm pkg set type=module 'scripts.dev=node --watch src/index.js'"],
      expected: { en: "package.json has type=module.", th: "package.json มี type=module" },
      verify: "npm pkg get type",
    },
    {
      id: "hono-server",
      title: { en: "Write the server", th: "เขียนเซิร์ฟเวอร์" },
      explanation: { en: "One route: GET /health.", th: "มีเส้นทางเดียว: GET /health" },
      commands: [],
      files: [{ path: "src/index.js", content: server }],
      expected: { en: "src/index.js exists.", th: "มีไฟล์ src/index.js" },
      verify: "node --check src/index.js",
    },
    {
      id: "dev-server",
      title: { en: "Run the API", th: "รัน API" },
      explanation: { en: "Starts on port 3000.", th: "เปิดที่พอร์ต 3000" },
      commands: ["{{run}} dev"],
      kind: "longRunning",
      expected: { en: "Console prints: API ready", th: "คอนโซลแสดง: API ready" },
      verify: "curl http://localhost:3000/health",
    },
  ],
  nextSteps: [{ en: "Add zod validation.", th: "เพิ่มการตรวจข้อมูลด้วย zod" }],
  docs: [{ label: "Hono", url: "https://hono.dev" }],
  docker: { kind: "node", port: 3000, cmd: ["node", "src/index.js"] },
  ci: ["node --check src/index.js"],
};

export default template;
```

### อธิบายการตัดสินใจในตัวอย่าง

- ใช้ `mkdirAndCd`, `npmInit` จาก common steps (id `mkdir-cd`, `pm-init`) เพื่อให้ dedup และลำดับสอดคล้องกับเทมเพลตอื่น
- ใช้ `{{add}}`, `{{list}}`, `{{run}}` แทน `npm install` ตรง ๆ → pnpm/yarn ใช้ได้ทันที
- `npm pkg set` ใช้ได้กับทุกตัวจัดการแพ็กเกจ เพราะแก้ไฟล์ package.json อย่างเดียว (เทมเพลต `express-api` ใช้วิธีเดียวกัน)
- ขั้น dev server ใช้ id `dev-server` และ `kind: "longRunning"` → add-on (testing/docker/ci) จะถูกแทรกก่อนขั้นนี้ และสคริปต์จะคอมเมนต์ไว้
- `docker` และ `ci` ทำให้ add-on Docker/CI สร้าง Dockerfile และ workflow ที่ถูกต้อง

## ตรวจสอบ

```bash
npm run export -- hono-api --out /tmp/nvx-try --addons testing,docker
bash -n /tmp/nvx-try/setup.sh                 # syntax check
cd /tmp/nvx-try && bash setup.sh              # end-to-end ในโฟลเดอร์สะอาด
npm run export -- hono-api --pm pnpm --out /tmp/nvx-pnpm
npm test && npm run typecheck && npm run docs:check
```

ถ้ามีเครื่อง Windows ให้ลอง `setup.ps1` ด้วย คำสั่งที่มี `'...'` แบบ POSIX หรือ `cp`/`chmod`/การ activate venv ต้องมี `windows` override

## Checklist ต่อขั้นตอน

- [ ] `title`, `explanation`, `expected` (และ `osNotes` ถ้ามี) ครบทั้ง `en` และ `th`
- [ ] คำสั่ง non-interactive ถูกต้องตามเอกสารทางการล่าสุด
- [ ] `verify` เป็นคำสั่งอ่านอย่างเดียว
- [ ] `kind` ถูกต้อง (dev server → longRunning; publish → publish; installer/global → manual)
- [ ] ใช้ placeholder แทนชื่อตัวจัดการแพ็กเกจ; syntax เฉพาะ TS ห่อด้วย `⟨ ⟩`
- [ ] `keywords` มีทั้งไทยและอังกฤษ
- [ ] เอกสารและ manifest อัปเดตแล้ว (`npm run docs:check` ผ่าน)
