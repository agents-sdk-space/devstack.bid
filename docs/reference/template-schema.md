# Template data schema

ชนิดข้อมูลจริงอยู่ใน [`src/lib/types.ts`](../../src/lib/types.ts) หน้านี้อธิบายทุกฟิลด์ ค่าที่อนุญาต และ placeholder ทั้งหมด สำหรับผู้เขียนเทมเพลตและ AI agent ที่ต้องอ่าน/สร้างข้อมูลเทมเพลต

## `StackTemplate`

| ฟิลด์ | ชนิด | บังคับ | คำอธิบาย |
|---|---|---|---|
| `id` | string (kebab-case) | ✓ | id ถาวร ใช้ใน URL `/templates/<id>`, `#t=<id>`, AI enum ต้องเพิ่มใน `KNOWN_TEMPLATE_IDS` ด้วย |
| `name`, `summary` | `L10n` | ✓ | ชื่อและสรุปสองภาษา |
| `category` | `"dashboard" \| "game" \| "api" \| "ai" \| "data" \| "cli" \| "package" \| "collab" \| "internal-tool" \| "web-app"` | ✓ | หมวดสำหรับกรองใน catalog |
| `runtimes` | `("node" \| "python")[]` | ✓ | กำหนดขั้น runtime ที่ composer ใส่ให้ |
| `tags` | string[] | ✓ | แสดงบนการ์ด และใช้เดาโลโก้ (`tagTool`) |
| `supportedAddons`, `defaultAddons` | `AddonId[]` | ✓ | add-on ที่ใช้ได้ / เปิดไว้เริ่มต้น |
| `defaultName` | string | ✓ | ชื่อโปรเจกต์เริ่มต้น (ผ่าน `sanitizeProjectName`) |
| `keywords` | string[] | ✓ | คำค้นไทย+อังกฤษสำหรับ offline planner |
| `fileTree` | string[] | ✓ | tree โดยประมาณ (placeholder ได้) เยื้อง 2 ช่องต่อระดับ |
| `steps` | `StepDef[]` | ✓ | ลำดับขั้นตอนของเทมเพลต |
| `nextSteps` | `L10n[]` | ✓ | สิ่งที่ควรทำต่อ |
| `docs` | `{ label, url }[]` | ✓ | ลิงก์เอกสารทางการ |
| `docker` | `{ kind: "node" \| "static" \| "python", port, cmd: string[] }` | — | ใช้โดย add-on Docker |
| `ci` | string[] | — | คำสั่งที่ add-on CI รันหลังติดตั้ง dependency |

`AddonId` = `typescript | tailwind | eslint | testing | docker | ci` (`ADDON_IDS`)

## `StepDef`

| ฟิลด์ | ชนิด | คำอธิบาย |
|---|---|---|
| `id` | string | ถาวร; id เดียวกัน = ขั้นเดียวกัน (dedup) |
| `title`, `explanation`, `expected` | `L10n` | บังคับ |
| `commands` | string[] | POSIX, placeholder ได้ (อาจว่างถ้ามีแต่ `files`) |
| `windows` | string[] | override PowerShell |
| `files` | `{ path, content }[]` | ไฟล์ที่ขั้นนี้เขียน; path สัมพัทธ์; ห้ามมีบรรทัด `NVX_EOF` หรือ `'@` |
| `osNotes` | `L10n` | หมายเหตุตาม OS |
| `verify`, `verifyWindows` | string | คำสั่งพิสูจน์ (Windows แปลงอัตโนมัติถ้าไม่ระบุ) |
| `kind` | `setup` (ค่าเริ่มต้น) \| `longRunning` \| `publish` \| `manual` | ขั้นที่ไม่ใช่ setup ถูกคอมเมนต์ในสคริปต์ |
| `requires` | string | คำสั่งที่ต้องมี (เช่น `nvm`) ไม่งั้นข้าม |
| `when` | `Partial<Record<AddonId, boolean>>` | รวมขั้นนี้เมื่อ add-on ตรงเงื่อนไข |

## Placeholders (จาก [`src/lib/placeholders.ts`](../../src/lib/placeholders.ts))

| placeholder | npm | pnpm | yarn |
|---|---|---|---|
| `{{install}}` | `npm install` | `pnpm install` | `yarn install` |
| `{{add}}` | `npm install` | `pnpm add` | `yarn add` |
| `{{addDev}}` | `npm install -D` | `pnpm add -D` | `yarn add -D` |
| `{{run}}` | `npm run` | `pnpm` | `yarn` |
| `{{list}}` | `npm ls` | `pnpm list` | `yarn why` |
| `{{init}}` | `npm init -y` | `pnpm init` | `yarn init -y` |
| `{{dlx}}` | `npx` | `pnpm dlx` | `npx` |
| `{{createNext}}` | `npx create-next-app@latest` | `pnpm create next-app@latest` | `yarn create next-app` |
| `{{createVite}}` | `npm create vite@latest` | `pnpm create vite@latest` | `yarn create vite` |
| `{{sep}}` | ` --` | (ว่าง) | (ว่าง) |
| `{{ciInstall}}` | `npm ci` | `pnpm install --frozen-lockfile` | `yarn install --frozen-lockfile` |

อื่น ๆ: `{{name}}` (ชื่อโปรเจกต์), `{{pkg}}` (ชื่อ import ของ Python: `-`/`.` → `_`), `{{pm}}`, `{{nvm}}` (`--lts` หรือเลขเวอร์ชัน), `{{nvmWin}}` (`lts` หรือเลข), `{{py}}` (เช่น `3.12`), `{{nextFlags}}`, `{{viteTemplate}}` (`react-ts`/`react`), `{{viteLint}}` (` --eslint` หรือว่าง), `{{ext}}` (`ts`/`js`), `{{jsx}}` (`tsx`/`jsx`), `{{nextPage}}` (`tsx`/`js`), `{{venv}}`/`{{venvWin}}`, `{{activate}}`/`{{activateWin}}`, `{{pip}}` (`python -m pip install` / `uv pip install`), `{{freeze}}` placeholder ที่ไม่รู้จักจะคงไว้ตามเดิม (test จับได้) ข้อความใน `⟨ ⟩` ถูกเก็บเฉพาะเมื่อเปิด TypeScript

## เทมเพลตที่มีอยู่ (ตรวจกับโค้ดโดย docs:check)

| id | category | runtimes | ขั้นในเทมเพลต | ขั้นหลังประกอบ (ค่าเริ่มต้น) | ขั้นที่ไม่ใช่ setup |
|---|---|---|---|---|---|
| `nextjs-dashboard` | dashboard | node | 6 | 7 | dev-server (longRunning) |
| `vite-react-game` | game | node | 6 | 7 | dev-server |
| `express-api` | api | node | 6 | 7 | dev-server |
| `fastapi-ai` | ai | python | 6 | 7 | dev-server |
| `streamlit-dashboard` | data | python | 6 | 7 | dev-server |
| `node-cli-npx` | cli | node | 7 | 8 | cli-link (manual), npm-publish (publish) |
| `pypi-package` | package | python | 8 | 10 | pypi-testpypi, pypi-upload (publish) |
| `collab-workspace` | collab | node | 7 | 8 | ws-server, dev-server (longRunning) |
| `react-admin-tool` | internal-tool | node | 7 | 8 | dev-server |
| `nextjs-ai-chat` | ai | node | 6 | 7 | dev-server |
| `static-website` | website | node | 5 | 6 | — |

ตัวเลข "หลังประกอบ" มาจาก `composeSteps(configForTemplate(id))` (npm, Node LTS, Python 3.12/pip, add-on เริ่มต้น) ณ v0.5 และเปลี่ยนตามตัวเลือก
