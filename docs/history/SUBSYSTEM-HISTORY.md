# ประวัติการเปลี่ยนแปลงราย Subsystem · Subsystem history

> สร้างจาก `git log --all`, `git tag -n1`, `git show --stat` และ [CHANGELOG.md](../../CHANGELOG.md) ของ repo นี้ ณ วันที่ 11 ต.ค. 2026 (UTC+7) ทุกรายการอ้าง commit hash แบบย่อ ตรวจด้วย `git show <hash>` ได้ เหตุผลของการเปลี่ยนมาจากข้อความ commit, CHANGELOG และคอมเมนต์ในโค้ด เอกสารนี้ไม่เดาข้อมูลที่ไม่มีหลักฐาน

## ไทม์ไลน์รุ่น (releases)

| รุ่น | tag / branch | merge / commit สุดท้าย | วันที่ (UTC+7) | สาระสำคัญ |
|---|---|---|---|---|
| v0.1.0 | tag `v0.1.0` | `dfc868c` (ฟีเจอร์หลักใน `a452dc5`) | 10 ต.ค. 2026 20:11–21:18 | catalog 10 เทมเพลต, builder, AI agent + offline fallback |
| v0.2.0 | tag `v0.2.0`, branch `feat/ui-framework` | `1c5aca8` (merge), release `9116943` | 10 ต.ค. 2026 21:29–21:31 | NVX UI design system, `/design`, builder wizard 4 ขั้น, command palette |
| v0.3.0 | tag `v0.3.0` (= `main`), branch `feat/cloudflare-production` | `510048b` (merge), release `576f6f7` | 10 ต.ค. 22:26 – 11 ต.ค. 00:35 | Cloudflare Workers + production hardening, TEST deploy |
| v0.4 (ไม่มี tag) | branch `feat/terminal-theme` | `2210920` … `abec887` | 11 ต.ค. 2026 00:54 | ธีมเทอร์มินัลดำเป็นค่าเริ่มต้น (ยังไม่ merge/deploy) |
| v0.5 (ไม่มี tag) | branch `feat/terminal-theme` | `3dad906` … `9790c94` | 11 ต.ค. 2026 06:03 | ธีมอ้างอิง Apple Developer, โลโก้เครื่องมือจริง (ยังไม่ merge/deploy) |

หมายเหตุ: `package.json` ยังเป็น `0.3.0` บน branch นี้ เพราะ v0.4/v0.5 ยังไม่ release

---

## 1. Templates data (`src/data/*`)

| commit | รุ่น | การเปลี่ยนแปลง | เหตุผล |
|---|---|---|---|
| `a452dc5` | v0.1.0 | สร้าง 10 เทมเพลต + `common-steps.ts`, `runtime-steps.ts`, `addon-steps.ts`, registry `index.ts` | ทำให้สูตรตั้งค่าโปรเจกต์เป็นข้อมูลที่ตรวจทานและทดสอบได้ ทุกขั้นมีคำอธิบายสองภาษา คำสั่ง POSIX + PowerShell, OS notes, expected, verify |
| `b88a5c5` | v0.3.0 | เพิ่ม `src/data/template-ids.ts` | `next.config.ts` ต้องรู้ id เพื่อทำ real 404 โดยไม่ bundle ข้อมูลเทมเพลตทั้งหมด; test ใน `20a2ac2` บังคับให้ตรงกับ registry |

ตั้งแต่ v0.3.0 ถึง v0.5 ไม่มี commit แก้เนื้อหาเทมเพลต

## 2. Composer + placeholders (`src/lib/composer.ts`, `placeholders.ts`, `types.ts`)

| commit | รุ่น | การเปลี่ยนแปลง | เหตุผล |
|---|---|---|---|
| `a452dc5` | v0.1.0 | `composeSteps`, `dedupeSteps`, `applyEdits`, `normalizeConfig`, `adaptForPowerShell`, placeholder ทั้งหมด | เขียนเทมเพลตครั้งเดียวให้รองรับ npm/pnpm/yarn, pip/uv, TS/JS และ add-on; add-on แทรกก่อน dev server; dedup ด้วย id + signature |

ไม่มีการเปลี่ยนหลัง v0.1.0 — เป็น subsystem ที่เสถียรที่สุด และเป็นสัญญา (contract) ที่ลิงก์แชร์พึ่งพา

## 3. Script generators & downloads (`src/lib/scripts.ts`, `download.ts`, `scripts/export-template.ts`)

| commit | รุ่น | การเปลี่ยนแปลง | เหตุผล |
|---|---|---|---|
| `a452dc5` | v0.1.0 | `toBash`, `toPowerShell`, `toReadme`, starter zip (JSZip), CLI `npm run export` | ส่งมอบผลลัพธ์ที่รันได้ทั้งสอง OS; ขั้น longRunning/publish/manual ถูกคอมเมนต์เพื่อความปลอดภัย |
| `853feac` | v0.2.0 | toast ยืนยันหลังดาวน์โหลด/คัดลอก/แชร์ | feedback ที่ชัดเจน (UX overhaul) |
| `382750c` | v0.5 | ไอคอน lucide (Download, FileArchive, Link2, Copy) บนปุ่ม | เลิกใช้อีโมจิตามดีไซน์ v0.5 |

## 4. Share encoding (`src/lib/share.ts`)

| commit | รุ่น | การเปลี่ยนแปลง | เหตุผล |
|---|---|---|---|
| `a452dc5` | v0.1.0 | รูปแบบ `v: 1` base64url ใน URL hash, zod + sanitize ตอนถอด | แชร์ได้โดยไม่มีฐานข้อมูล และข้อมูลไม่ถูกส่งไปเซิร์ฟเวอร์ |
| `853feac` | v0.2.0 | ลิงก์แชร์เปิดที่ขั้น Review, `#t=` เปิดที่ Configure (CHANGELOG 0.2.0) | พาผู้รับไปยังจุดที่ใช้งานได้ทันที |

## 5. Sanitizer (`src/lib/sanitize.ts`)

| commit | รุ่น | การเปลี่ยนแปลง | เหตุผล |
|---|---|---|---|
| `a452dc5` | v0.1.0 | BLOCKED/RISKY regex, `cleanCommand`, `cleanPath`, `cleanFile`, `sanitizeStep` | ผลลัพธ์ AI, ลิงก์แชร์ และขั้นที่ผู้ใช้พิมพ์เป็นข้อมูลไม่น่าเชื่อถือ |

ไม่มีการเปลี่ยนหลัง v0.1.0

## 6. AI route + planner + validation (`src/app/api/plan/route.ts`, `src/lib/ai/*`)

| commit | รุ่น | การเปลี่ยนแปลง | เหตุผล |
|---|---|---|---|
| `a452dc5` | v0.1.0 | Responses API + Structured Outputs (`OPENAI_MODEL`, ค่าเริ่มต้น `gpt-6.1-sol`), user key ต่อคำขอ, zod + sanitize, in-memory rate limit, rule-based fallback | AI เลือกเทมเพลตและเติมส่วนต่าง; ใช้งานได้แม้ไม่มี key |
| `853feac` | v0.2.0 | skeleton ระหว่างโหลด, idle/error empty state พร้อม "Try again" / "Use offline planner" | UX ของ agent panel |
| `97f14d9` | v0.3.0 | env validation, distributed rate limit (Workers binding), body 16 KB (413), JSON only (415), timeout (504 → fallback), log JSON พร้อม `cf-ray` + redaction, cost guard `OPENAI_MAX_OUTPUT_TOKENS`, abort เมื่อ client ตัด | เตรียม production: ปกป้องบิลและข้อมูลผู้ใช้ |
| `712eb8e` | v0.3.0 | rate-limit IPv6 ต่อ /64 | ทดสอบ live พบว่าผู้ใช้ IPv6 (เช่นผ่าน WARP) ได้ที่อยู่ใหม่ทุก connection จึงหลบ limit ได้ |
| `382750c` | v0.5 | ไทล์ `ai` + ไอคอน lucide ใน agent panel | ดีไซน์ v0.5 |

## 7. Rate limiting, env, HTTP limits, security headers

| commit | รุ่น | การเปลี่ยนแปลง | เหตุผล |
|---|---|---|---|
| `a452dc5` | v0.1.0 | `src/lib/rate-limit.ts` (sliding window ในหน่วยความจำ) | ปกป้อง key ของเซิร์ฟเวอร์ขั้นพื้นฐาน |
| `97f14d9` | v0.3.0 | `src/lib/server/{env,http,rate-limit}.ts` | ตัวนับใช้ร่วมกันข้าม isolate บน Workers; config ผิดไม่ทำให้ล่ม |
| `b88a5c5` | v0.3.0 | `security-headers.ts`, `public/_headers`, headers + real 404 rewrite ใน `next.config.ts`, `poweredByHeader: false` | CSP/HSTS/framing protection; soft 404 (status 200) จาก streaming ถูกแก้เป็น 404 จริง |
| `20a2ac2` | v0.3.0 | `tests/production.test.ts` (14 tests) | ล็อกพฤติกรรม hardening |
| `712eb8e` | v0.3.0 | `ipv6Prefix64` + test | ดูข้อ 6 |

## 8. UI framework (tokens, components, brand icons, /design)

| commit | รุ่น | การเปลี่ยนแปลง | เหตุผล |
|---|---|---|---|
| `a452dc5` | v0.1.0 | Tailwind v4 + global utility classes, Geist + Noto Sans Thai, light/dark ตาม OS | MVP |
| `f673199` | v0.2.0 | dependency: Radix primitives, cmdk, dnd-kit, Testing Library, jsdom | ฐานของคอมโพเนนต์ที่เข้าถึงได้ |
| `3e5a8c2` | v0.2.0 | design tokens `--nvx-*` light/dark → Tailwind theme, reduced motion, token manifest | เปลี่ยนธีมจากที่เดียว |
| `4ac2756` | v0.2.0 | ไลบรารีคอมโพเนนต์ NVX UI (Button … Kbd) | UI สม่ำเสมอและ accessible |
| `7506507` | v0.2.0 | app shell, mobile sheet nav, command palette Ctrl/⌘+K, IBM Plex Sans Thai + Geist | การนำทางและภาษาไทยที่อ่านง่าย |
| `96b2d51` | v0.2.0 | ย้ายหน้า home/catalog/template ไปใช้ NVX UI, breadcrumb, empty/404 state | ลำดับชั้นข้อมูลชัดขึ้น |
| `853feac` | v0.2.0 | builder wizard 4 ขั้น, dnd-kit พร้อมคีย์บอร์ดและประกาศสองภาษา, toasts | ลดภาระการคิด |
| `1b0f105` | v0.2.0 | style guide `/design` สองภาษา | เอกสารดีไซน์ที่รันจริง |
| `cd427e6` | v0.2.0 | component tests + WCAG contrast test | ป้องกัน regression ด้าน a11y |
| `fc7a922`, `5ceefe6`, `fa6ea59` | v0.2.0 | `docs/UI-FRAMEWORK.md`, README, screenshots v0.2 | เอกสาร |
| `2210920` | v0.4 | **ธีมเทอร์มินัลดำเป็นค่าเริ่มต้น** (ไม่สน OS), tokens เขียวฟอสฟอร์ `#33ff66`, IBM Plex Mono/Sans/Thai, รายละเอียด CSS แบบ DOS, contrast test เพิ่มเป็น 26 คู่ | เจ้าของต้องการลุคเครื่องมือนักพัฒนาสีดำ ("ถ้าเป็นสีขาวดูเหมือนเทมเพลตเว็บทั่วไป") |
| `1219529` | v0.4 | restyle 17 คอมโพเนนต์ (ไม่เปลี่ยน layout) | ข้อตกลง: ห้ามเปลี่ยนโครงสร้างหน้า |
| `ae35a20` | v0.4 | แก้การย้ายด้วยคีย์บอร์ดให้ขยับทีละช่องเมื่อการ์ดสูงไม่เท่ากัน (scrollIntoView ก่อนยก, `closestCorners`, keyboard scroll แบบ instant) | บั๊กที่พบตอนทดสอบ E2E |
| `f49c6a1`, `abec887` | v0.4 | `/design`, UI-FRAMEWORK.md, CHANGELOG, screenshots v0.4 | เอกสาร |
| `3dad906` | v0.5 | `ToolIcon`/`ToolTile` + `scripts/gen-brand-icons.mjs` (31 โลโก้จาก simple-icons, CC0), lucide-react, `NOTICE`, `tests/tool-icons.test.tsx` (รวม test ห้ามอีโมจิ) | ฟีดแบ็ก: ใช้เครื่องมือที่คนรู้จักเห็นแล้วจำได้ |
| `b6e61a5` | v0.5 | tokens อ้างอิง developer.apple.com: ดำ `#000`, primary `#0071e3` + token `link` `#2997ff`/`#0066cc`, Inter + Plex Mono/Thai, radius 6–22px, tool-tile/glow/nav-glass, contrast 32 คู่ | ฟีดแบ็กให้ใช้ developer.apple.com เป็นต้นแบบ; แยก link เพราะ #0071e3 ไม่ผ่าน AA เป็นข้อความบนดำ |
| `382750c` | v0.5 | ปุ่มแคปซูล, การ์ดละเอียดขึ้น, แทนอีโมจิทั้งหมดด้วยไทล์โลโก้ + lucide, ลดลูกเล่น DOS (คง prompt/cursor ในหน้าต่างโค้ด), section ไอคอนใน `/design` | ลุคมืออาชีพแบบ Apple โดยคงความเป็นเครื่องมือนักพัฒนา |
| `9790c94` | v0.5 | UI-FRAMEWORK.md v0.5, CHANGELOG, หมายเหตุเครื่องหมายการค้า, screenshots v0.5 | เอกสาร |

## 9. Cloudflare / OpenNext runtime

| commit | รุ่น | การเปลี่ยนแปลง | เหตุผล |
|---|---|---|---|
| `f9ef054` | v0.3.0 | `wrangler.jsonc`, `open-next.config.ts`, `cloudflare-env.d.ts`, `.dev.vars.example`, `scripts/patch-opennext.mjs`, scripts `cf:build`/`preview`/`deploy`/`cf:typegen` | target production บน Workers, workers.dev เท่านั้น ไม่แตะ zone/route ใด |
| `fad66d0` | v0.3.0 | `docs/DEPLOY.md` (TH+EN), screenshots preview | คู่มือ deploy/rollback/custom domain |
| `576f6f7` | v0.3.0 | สถานะ TEST deploy, live URL, version ids ใน DEPLOY.md | บันทึกเป้าหมาย rollback (`0fb9ecd4-…` ปัจจุบัน, `9b9b678a-…` ก่อนหน้า) |

## 10. Documentation & tooling

| commit | รุ่น | การเปลี่ยนแปลง |
|---|---|---|
| `a452dc5` | v0.1.0 | README (TH+EN), CONTRIBUTING, CODE_OF_CONDUCT, LICENSE (MIT), `.env.example`, `AGENTS.md` (บล็อกกฎของ Next.js) |
| `dfc868c` | v0.1.0 | CHANGELOG 0.1.0 |
| (commit นี้) | v0.5 docs | โครงสร้าง `docs/` ทั้งหมด, `AGENTS.md` ฉบับเต็ม, agent playbook, `platform-manifest.json`, `npm run docs:check` + test + CI workflow |

## บทเรียนจากประวัติ

1. **แกนกลางเสถียร ผิวนอกเปลี่ยนบ่อย** composer/sanitizer/share ไม่เปลี่ยนเลยตั้งแต่ v0.1.0 ขณะที่ UI เปลี่ยนสามครั้ง การแยก token ออกจากคอมโพเนนต์จึงคุ้มค่า
2. **ทุก hardening มี test คู่กัน** (`20a2ac2`, `712eb8e`) — ทำตามแบบนี้ต่อ
3. **ทดสอบ live เจอสิ่งที่ unit test ไม่เจอ** (IPv6 rotation, soft 404 จาก streaming, patch ของ adapter)
