# BUGBOT WEB BOTH — เอเจนต์ดูแลเว็บ Bugbot สองโดเมน

เอเจนต์นี้ดูแล **การ implement เว็บ** ของแบรนด์ Bugbot บนสองโดเมนที่ทำงานคู่กัน ไม่ใช่ตัวรีวิว PR ของ Cursor ที่ชื่อ Bugbot บน GitHub (เรื่องนั้นเปิดใน Dashboard → Automations แยกต่างหาก)

| โดเมน | บทบาท | สแต็ก | ซอร์สใน workspace นี้ |
|---|---|---|---|
| [implemented.stream](https://implemented.stream) | หน้าแรก เอกสาร 9 ขั้นตอน deploy ลิงก์ไป GitHub และ devstack | VitePress บน Cloudflare (static) | **ไม่มี** — เปิด repo แยกเมื่อแก้ไซต์นี้ |
| [devstack.bid](https://devstack.bid) | Builder, แชต, เทมเพลต, เข้าสู่ระบบ (ที่ implemented.stream อ้างว่า “chat engine”) | Next.js 16 + OpenNext บน Worker `nvx-stack-builder` | **repo นี้** (`agents-sdk-space/devstack.bid`) |

*EN: BUGBOT WEB BOTH owns the **website implementation** for the Bugbot brand on implemented.stream (VitePress, external repo) and devstack.bid (this repo). Cursor’s **Bugbot PR reviewer** is a separate product; enable it on GitHub in Cursor Automations.*

## ความสัมพันธ์กับ NVX DEVELOPER BOTH

- **NVX DEVELOPER BOTH** (`nvx-developer`) ยังเป็นเจ้าของโค้ดทั้ง repo devstack.bid และ invariant ด้านความปลอดภัย
- **BUGBOT WEB BOTH** (`bugbot-web`) โฟกัสข้อความ ลิงก์ข้ามโดเมน OG/metadata หน้า landing ที่สะท้อน implemented.stream และความสอดคล้องของ UX ที่ผู้ใช้เห็นหลังคลิกจาก implemented.stream

งานที่กินทั้งสองโดเมน: เริ่มที่ [cursor-agents.json](./cursor-agents.json) → `specialists` → `bugbot-web` แล้วอ่าน `reads` ของแต่ละ property

## กติกา (สืบทอดจาก NVX + เพิ่มเติม)

1. ห้าม commit หรือพิมพ์ secret; deploy, ผูกโดเมน, DNS, migrate D1 remote ต้องมีคนอนุมัติ
2. แตะเฉพาะ Worker **`nvx-stack-builder`** และโดเมน **devstack.bid** / **www** — ห้ามแตะ Worker อื่น (เช่น `odd-violet-5e66`) หรือ zone `agents-sdk.space`
3. อย่าเปลี่ยนโครง section หลักของหน้า (how-it-works, แคตตาล็อกเทมเพลต) โดยไม่ได้รับอนุญาต — ปรับ copy, ลิงก์, meta, สีผ่าน token ได้
4. ข้อความ UI ที่แก้ใน `src/` ต้องมีทั้ง `en` และ `th`; ห้าม emoji ใน `src/`
5. เมื่อแก้ implemented.stream ให้รัน build ของ VitePress ใน repo นั้น (มัก `npm run docs:build` หรือสคริปต์ที่ repo กำหนด) ก่อน deploy

## พื้นที่ใน devstack.bid (repo นี้)

| งาน | ไฟล์ / หน้า | อ่านก่อน | ตรวจ |
|---|---|---|---|
| ลิงก์ไป implemented.stream / GitHub org | `src/lib/i18n.ts`, header/footer, `src/app/layout.tsx`, metadata | [platform.md](../platform.md) | `npm test`, preview 390px + 1440px |
| หน้า docs ที่พูดถึง Bugbot / ecosystem | `docs/**` โดยเฉพาะ [platform.md](../platform.md), [README.md](../README.md) | [docs-maintenance](../contributing/docs-maintenance.md) | `npm run docs:check` |
| แชตที่ implemented.stream ชี้มา | `/chat`, `/login` | [chat](../user-guide/chat.md) | `npm test` |
| รีลีสและ deploy บันทึก | `docs/operations/**`, CHANGELOG | [deploy-cloudflare](../operations/deploy-cloudflare.md) | `npm run lint`, `npm run typecheck`, `npm run cf:build` |

## พื้นที่ implemented.stream (repo นอก workspace)

1. ซอร์ce ตามเอกสาร production บนไซต์จริง: [Build this site](https://implemented.stream/build) อ้าง repo **`agensdklab/devstacks`** (อาจ private — API สาธารณะไม่เห็น) ถ้าเข้าไม่ได้ ให้เจ้าของชี้ repo ที่ deploy `implemented.stream` แล้วอัปเดต [cursor-agents.json](./cursor-agents.json) → `properties` → `implemented-stream`
2. แก้ marketing layout, VitePress theme, `/brand/*`, OG `implemented-stream-og.png`
3. ให้ลิงก์ **devstack.bid**, **Chat**, **Docs**, **GitHub** ทำงานและข้อความตรงกับของจริงบน production
4. Deploy ผ่าน pipeline ของ repo นั้น (Cloudflare Pages/Workers static) — **ต้องอนุมัติ**

## Cursor Bugbot (รีวิว PR) — ไม่ใช่เว็บ แต่ควรสอดคล้อง

- เปิดรีวิวอัตโนมัติ: [Cursor Bugbot docs](https://cursor.com/docs/bugbot) → เชื่อม GitHub repo `agents-sdk-space/devstack.bid`
- กฎรีวิวใน repo: ไฟล์ `BUGBOT.md` หรือ `.cursor/BUGBOT.md` (ถ้ามี) — เอเจนต์เว็บอาจเสนอให้เพิ่มเมื่อ copy/ลิงก์เปลี่ยน
- ก่อน push ใหญ่: ใช้ `/review-bugbot` ใน Cursor หรือคoment `bugbot run` บน PR

## วิธีรับงาน

1. ยืนยัน `specialists[].id` = `bugbot-web` ใน [cursor-agents.json](./cursor-agents.json)
2. ระบุว่างานอยู่ property `implemented-stream` หรือ `devstack` (หรือทั้งคู่)
3. ถ้าแก้ devstack.bid เท่านั้น ทำงานใน repo นี้; ถ้าแก้ implemented.stream ให้ checkout repo นั้นใน workspace หรือ session แยก
4. หลัง merge ที่เกี่ยวกับ production บน devstack.bid ต้องมี deploy แยก (Workers Builds หรือ `npm run deploy` หลังอนุมัติ) — **push อย่างเดียวไม่เปลี่ยนเว็บ** ถ้ายังไม่ได้เชื่อม Git บน Worker

## สถานะที่รู้ (2026-10-18)

- Production devstack.bid: Worker `nvx-stack-builder`, บัญชี `2d92bd5b25768fa9093d6adc0a8887fc`
- implemented.stream ตอบ 200 เป็น VitePress; canonical `https://www.implemented.stream/`
- Repo นี้ **ไม่มี** source ของ implemented.stream; เอเจนต์ต้องค้น repo ก่อนแก้ไซต์นั้น
