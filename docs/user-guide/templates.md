# การใช้ Stack Template · Using templates

Stack Template คือ "สูตร" ตั้งค่าโปรเจกต์ที่เราคัดสรรและทดสอบมาแล้ว เราเขียนแต่ละเทมเพลตเป็นไฟล์ข้อมูล TypeScript ใน [`src/data/templates/`](../../src/data/templates/index.ts) แทนการซ่อนไว้ในคอมโพเนนต์ ทุกคนในชุมชนจึงเปิดอ่าน ตรวจทาน ทดสอบ และเสนอเทมเพลตใหม่ได้ง่าย หน้านี้จะพาไปรู้จักทั้ง 10 แบบที่เรามีตอนนี้ และวิธีเลือกให้เหมาะกับงานของคุณ แนวคิดเต็มอยู่ที่ [concepts/stack-template.md](../concepts/stack-template.md)

## เทมเพลตทั้ง 10 แบบ (ณ v0.5)

| id | ชื่อ | runtime | add-on ที่รองรับ | ค่าเริ่มต้น |
|---|---|---|---|---|
| `nextjs-dashboard` | Next.js Analytics Dashboard | Node | typescript, tailwind, eslint, testing, docker, ci | typescript, tailwind, eslint |
| `vite-react-game` | Vite + React Canvas Game | Node | typescript, tailwind, eslint, testing, docker, ci | typescript |
| `express-api` | Express REST API | Node | testing, docker, ci | — |
| `fastapi-ai` | FastAPI + Python AI App | Python | eslint (Ruff), testing, docker, ci | — |
| `streamlit-dashboard` | Streamlit Data Dashboard | Python | eslint (Ruff), testing, docker, ci | — |
| `node-cli-npx` | Node CLI Tool (run via npx) | Node | testing, ci | — |
| `pypi-package` | Python Package for PyPI | Python | eslint (Ruff), testing, ci | testing |
| `collab-workspace` | Realtime Collaborative Workspace | Node | typescript, tailwind, eslint, testing, docker, ci | typescript, tailwind, eslint |
| `react-admin-tool` | Internal Tool (React Admin) | Node | typescript, eslint, testing, docker, ci | typescript |
| `nextjs-ai-chat` | Next.js AI Chat App | Node | typescript, tailwind, eslint, testing, docker, ci | typescript, tailwind, eslint |

เราไม่อยากให้ตารางนี้ล้าสมัย จึงให้ `npm run docs:check` ตรวจกับโค้ดอัตโนมัติ (ทุก template id ต้องปรากฏในเอกสาร) ถ้ามีคนเพิ่มเทมเพลตใหม่แล้วลืมอัปเดตเอกสาร CI จะล้มทันที

## หน้า catalog (`/templates`)

- **ช่องค้นหา** ค้นจากชื่อ คำอธิบาย และแท็ก เช่น `python`, `game`, `react`
- **ชิปหมวดหมู่** (เช่น Dashboard, Game, API, AI app, Data, CLI, Package, Collaborative, Internal tool ตาม `CATEGORY_LABELS` ใน [`src/lib/i18n.ts`](../../src/lib/i18n.ts)) ใช้กรองผล ถ้าไม่พบอะไรจะมีปุ่ม "Clear filters"
- การ์ดแต่ละใบแสดงไทล์โลโก้เครื่องมือหลัก (เช่น Next.js, FastAPI) หมวด runtime แท็ก และปุ่ม **View steps** / **Open in builder**

## หน้ารายละเอียดเทมเพลต (`/templates/<id>`)

หน้านี้แสดงทุกขั้นตอนตามลำดับที่ composer สร้างจากค่าเริ่มต้น (ค่าเริ่มต้น: npm, Node LTS, Python 3.12 และ add-on เริ่มต้นของเทมเพลต) แต่ละขั้นมี:

- **ชื่อและคำอธิบาย** เราตั้งใจเขียนว่าทำไมต้องทำขั้นนี้ ไม่ใช่แค่ทำอะไร
- **คำสั่ง** สลับดูแบบ macOS/Linux หรือ Windows PowerShell ได้ (ปุ่มด้านบนรายการ)
- **OS notes** ข้อควรระวังเฉพาะระบบ เช่น nvm-windows
- **Expected result** และ **Verify** คำสั่งพิสูจน์ว่าขั้นนั้นสำเร็จ
- ป้าย **run manually / dev server** สำหรับขั้นที่ไม่ควรรันอัตโนมัติ

แถบด้านข้างมี file tree โดยประมาณ ขั้นตอนถัดไป (next steps) และลิงก์เอกสารทางการ id ที่ไม่มีอยู่จะได้ HTTP 404 จริง (ตั้งแต่ v0.3.0, commit `[commit redacted]`)

## เราแนะนำให้เลือกแบบนี้

- ต้องการ UI + API ใน repo เดียว → `nextjs-dashboard` หรือ `nextjs-ai-chat`
- API ล้วน → `express-api` (Node) หรือ `fastapi-ai` (Python)
- งานข้อมูลเร็ว ๆ → `streamlit-dashboard`
- เผยแพร่แพ็กเกจ → `node-cli-npx` (npm) หรือ `pypi-package` (PyPI) ขั้น publish จะถูกคอมเมนต์ไว้เสมอ
- ปุ่ม **Open in builder** เปิด `/builder#t=<id>` ที่ขั้น Configure เพื่อปรับต่อ

## อ้างอิง

[`src/components/catalog.tsx`](../../src/components/catalog.tsx), [`src/components/template-detail.tsx`](../../src/components/template-detail.tsx), [`src/app/templates/[id]/page.tsx`](../../src/app/templates/[id]/page.tsx), schema: [reference/template-schema.md](../reference/template-schema.md)
