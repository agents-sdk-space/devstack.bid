# npm scripts & commands

ทุก script ใน [`package.json`](../../package.json) (ตรวจครบโดย `npm run docs:check`) ใช้ Node 22+ (`export PATH=/tmp/node22/bin:$PATH` บนเครื่อง box ของโปรเจกต์นี้)

| คำสั่ง | ทำอะไร | ใช้เมื่อ |
|---|---|---|
| `npm run dev` | `next dev` ที่ :3000 พร้อม Cloudflare bindings ใน dev | พัฒนาประจำวัน |
| `predev`, `prebuild`, `pretest`, `pretypecheck` | `node scripts/build-docs.mjs` อัตโนมัติก่อน `dev` / `build` / `test` / `typecheck` (`prebuild` รัน `node scripts/build-studio.mjs` ต่อด้วย) | สร้าง docs bundle และ Studio ใหม่ ไม่ต้องรันเอง |
| `npm run build` | `next build` (target Node) | ตรวจ build หรือ deploy แบบ Node server |
| `npm run start` | `next start` | รันผล build แบบ Node |
| `npm run lint` | `eslint` | ก่อน commit |
| `npm test` (`test`) | `vitest run` | ก่อน commit; CI |
| `npm run test:watch` | `vitest` แบบ watch | ระหว่างเขียน test |
| `npm run typecheck` | `tsc --noEmit` | ก่อน commit; CI |
| `npm run export -- <id> [opts]` | `tsx scripts/export-template.ts` เขียน setup.sh/ps1/README ของเทมเพลตลงดิสก์ | ทดสอบเทมเพลต end-to-end |
| `npm run cf:build` | `opennextjs-cloudflare build` → `.open-next/` | ตรวจว่า build เป็น Worker ได้ |
| `npm run preview` | build + `opennextjs-cloudflare preview` ใน workerd ที่ :8787 | ตรวจพฤติกรรม/ภาพแบบ production |
| `npm run deploy` | build + `opennextjs-cloudflare deploy` | **ต้องได้รับอนุมัติก่อน** ดู [deploy-cloudflare.md](../operations/deploy-cloudflare.md) |
| `npm run cf:typegen` | `wrangler types ...` → `cloudflare-env.d.ts` | หลังแก้ binding ใน wrangler.jsonc |
| `npm run db:migrate:local` | `wrangler d1 migrations apply nvx-db --local` | ทดสอบ migration ในฐานข้อมูลจำลองบนเครื่อง |
| `npm run db:migrate:remote` | `wrangler d1 migrations apply nvx-db --remote` | **ต้องได้รับอนุมัติก่อน** apply บน D1 จริง ดู [d1-database.md](../operations/d1-database.md) |
| `npm run db:migrations:list` | `wrangler d1 migrations list nvx-db --remote` | ดู migration ที่ยังไม่ได้ apply (อ่านอย่างเดียว ต้องมี token) |
| `npm run docs:check` | `node scripts/docs-check.mjs` ตรวจเอกสาร (ความยาว ลิงก์ id env scripts manifest) | ก่อน commit; CI (`-- --report` พิมพ์จำนวนตัวอักษรต่อหน้า) |
| `npm run docs:bundle` | `node scripts/build-docs.mjs` คอมไพล์ `docs/**/*.md` → `src/generated/docs-bundle.json`, `docs-nav.json`, `public/docs-search-index.json` | ดูผลเร็ว ๆ หลังแก้เอกสาร (`-- --check` ล้มถ้า Mermaid ยังไม่มี SVG) |
| `npm run docs:diagrams` | `node scripts/render-diagrams.mjs` เรนเดอร์บล็อก Mermaid เป็น `public/docs-assets/diagrams/<hash>.svg` | หลังแก้ diagram (ต้องมี Playwright: `PLAYWRIGHT_DIR=/tmp/pw npm run docs:diagrams`) |
| `npm run docs:pdf` | `node scripts/docs-pdf.mjs` สร้าง `docs/dist/NVX-User-Guide.pdf` จาก `docs/user-guide/` | หลังแก้คู่มือผู้ใช้ (ต้องมี Chromium ของ Playwright และฟอนต์ไทย) |
| `postinstall` | `node scripts/patch-opennext.mjs` (อัตโนมัติหลัง `npm install`) | patch adapter สำหรับ Next 16.4 |
| `npm run studio:build` | `node scripts/build-studio.mjs --force` build แอป Vite ใน `studio/` → `public/studio/` (ติดตั้ง `studio/node_modules` ให้ถ้ายังไม่มี) | build Studio ใหม่ทันที (`prebuild` ทำให้อัตโนมัติและข้ามถ้าไฟล์ไม่เปลี่ยน) |
| `npm run studio:dev` | `vite` ของ Studio ที่ :43123 (proxy `/api` และ `/brand` ไปที่ `next dev` :3000) | แก้ UI ของ Studio แบบ hot reload (รัน `npm run dev` คู่กัน) |
| `npm run studio:check` | ตรวจ brand copy + ESLint + `tsc -b` + Vitest ของ Studio | ก่อน commit ที่แตะ `studio/` |
| `npm run studio:brand` | `node scripts/sync-studio-brand.mjs` คัดลอก tokens, mascot, terminal signature ไป `studio/src/brand/` | หลังแก้ `tokens.css`, `globals.css` (ส่วน mascot/signature) หรือ `src/components/brand/*` |
| `npm run studio:e2e` | Playwright ของ Studio (flow "build a todo app") กับ `wrangler dev`/preview ที่รันอยู่ | ตรวจ Studio แบบ end-to-end (`STUDIO_BASE_URL`, ค่าเริ่มต้น `http://127.0.0.1:8787`) |
| `npm run licenses` | `node scripts/third-party-licenses.mjs` อ่าน lockfile ของเว็บและ Studio แล้วเขียน `THIRD_PARTY_LICENSES.md` | หลังเพิ่ม/อัปเดต dependency |
| `npm run licenses:check` | `node scripts/third-party-licenses.mjs --check` | ตรวจว่าไม่มี license นอกนโยบาย (permissive เท่านั้น) และไฟล์เป็นปัจจุบัน (`npm test` ตรวจให้ด้วย) |

## ตัวเลือกของ `npm run export`

`--name my-app` ชื่อโปรเจกต์ · `--pm npm|pnpm|yarn` · `--py pip|uv` · `--addons typescript,tailwind` (ว่าง = ไม่มี add-on) · `--out ./out` (ค่าเริ่มต้น `out/<id>`) · `--lang en|th`

```bash
npm run export -- fastapi-ai --py uv --addons testing,docker --out /tmp/fastapi --lang th
```

## สคริปต์อื่นในโฟลเดอร์ `scripts/`

| ไฟล์ | วิธีรัน | หน้าที่ |
|---|---|---|
| [`scripts/gen-brand-icons.mjs`](../../scripts/gen-brand-icons.mjs) | `node scripts/gen-brand-icons.mjs` | สร้าง `src/components/brand/brand-icons.data.ts` จาก simple-icons (รันหลังเพิ่ม id โลโก้) |
| [`scripts/patch-opennext.mjs`](../../scripts/patch-opennext.mjs) | อัตโนมัติ (postinstall) | patch `preview-props.json` |
| [`scripts/docs-check.mjs`](../../scripts/docs-check.mjs) | `npm run docs:check` | docs freshness |
| [`scripts/docs-pdf.mjs`](../../scripts/docs-pdf.mjs) | `npm run docs:pdf` | PDF คู่มือผู้ใช้ |
| [`scripts/build-docs.mjs`](../../scripts/build-docs.mjs) | `npm run docs:bundle` (และ pre-hooks) | docs bundle สำหรับ `/docs` ([docs-site.md](../architecture/docs-site.md)) |
| [`scripts/render-diagrams.mjs`](../../scripts/render-diagrams.mjs) | `npm run docs:diagrams` | SVG ของ Mermaid |
| [`scripts/build-studio.mjs`](../../scripts/build-studio.mjs) | `npm run studio:build` (และ `prebuild`) | build Studio → `public/studio/` ตรวจว่าไม่มีไฟล์เกิน 25 MiB |
| [`scripts/sync-studio-brand.mjs`](../../scripts/sync-studio-brand.mjs) | `npm run studio:brand` (`--check` ใน test) | คัดลอก design system ไปให้ Studio |
| [`scripts/third-party-licenses.mjs`](../../scripts/third-party-licenses.mjs) | `npm run licenses` (`--check`, และใน `tests/licenses.test.ts`) | audit license ของ dependency production และสร้าง `THIRD_PARTY_LICENSES.md` |

## คำสั่ง wrangler ที่ใช้บ่อย (ต้องมี token และอนุมัติสำหรับคำสั่งที่เขียน)

`npx wrangler deployments list --name nvx-stack-builder` (อ่าน), `npx wrangler secret put OPENAI_API_KEY` (เขียน, ผ่าน stdin), `npx wrangler rollback <id> --name nvx-stack-builder -m "..."` (เขียน), `npx wrangler tail nvx-stack-builder` (อ่าน)
