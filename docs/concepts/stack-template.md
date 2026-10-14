# แนวคิด Stack Template · The Stack Template concept

## นิยาม

**Stack Template** คือข้อมูล (data) ที่อธิบายวิธีตั้งค่าโปรเจกต์ประเภทหนึ่งตั้งแต่โฟลเดอร์ว่างจนถึงรันได้ ประกอบด้วยรายการ **ขั้นตอน (StepDef)** ที่เรียงลำดับแล้ว พร้อมข้อมูลประกอบ (metadata) เช่น runtime, add-on ที่รองรับ, keyword สำหรับค้นหา, file tree และลิงก์เอกสารทางการ ชนิดข้อมูลกำหนดใน [`src/lib/types.ts`](../../src/lib/types.ts) (`StackTemplate`, `StepDef`)

## ทำไมเป็น "ข้อมูล" ไม่ใช่ "โค้ด"

ตั้งแต่ v0.1.0 (commit `[commit redacted]`) เทมเพลตทุกตัวเป็นไฟล์ `.ts` ที่ default-export อ็อบเจกต์ธรรมดา เหตุผล:

1. **ตรวจทานง่าย** reviewer อ่านคำสั่งได้ตรง ๆ ไม่ต้องไล่ตรรกะ
2. **ทดสอบได้** unit test ประกอบคำสั่งของทุกเทมเพลตในทุกตัวเลือกได้ (`tests/composer.test.ts`)
3. **ใช้ซ้ำได้หลายที่** ข้อมูลเดียวกันใช้ทั้งหน้า catalog, ตัวสร้าง, AI prompt (catalog ถูกฝังใน system instructions), offline planner, CLI export และ JSON Schema ของ Structured Outputs (`templateId` enum)
4. **type-safe** TypeScript บังคับให้มีทั้ง `en` และ `th` ในทุกข้อความ (`L10n`)

## องค์ประกอบของขั้นตอน (StepDef)

| ฟิลด์ | ความหมาย | เหตุผล |
|---|---|---|
| `id` | id คงที่ | ใช้ตัดซ้ำ (dedup), อ้างอิงในลิงก์แชร์ และการจัดลำดับ |
| `title`, `explanation` | ชื่อ + เหตุผลของขั้น (TH/EN) | ผู้ใช้ควรเข้าใจว่า *ทำไม* ไม่ใช่แค่ *ทำอะไร* |
| `commands` | คำสั่ง POSIX (มี placeholder) | แหล่งเดียวสำหรับทุกตัวจัดการแพ็กเกจ |
| `windows` | override สำหรับ PowerShell | บางคำสั่งแปลงอัตโนมัติไม่ได้ (activate venv, ตัวแปร env) |
| `files` | ไฟล์เริ่มต้นที่ขั้นนี้เขียน | ได้โค้ดที่รันได้ทันที ไม่ใช่แค่โครงเปล่า |
| `osNotes` | หมายเหตุตาม OS | เช่น nvm-windows, WSL |
| `expected`, `verify` | ผลที่คาดหวัง + คำสั่งพิสูจน์ | ตรวจสอบได้ทีละขั้น |
| `kind` | setup / longRunning / publish / manual | ควบคุมว่าสคริปต์รันอัตโนมัติหรือคอมเมนต์ไว้ |
| `requires` | คำสั่งที่ต้องมี เช่น `nvm` | สคริปต์ข้ามพร้อมคำเตือนแทนการล้ม |
| `when` | เงื่อนไข add-on เช่น `{ testing: true }` | เทมเพลตเดียวรองรับหลายรูปแบบ |

## Placeholder: เขียนครั้งเดียว ใช้ได้ทุกตัวเลือก

คำสั่งในเทมเพลตเขียนด้วย placeholder เช่น `{{add}} express cors`, `{{run}} dev`, `{{createNext}} {{name}} {{nextFlags}}` composer แทนค่าตามตัวเลือกของผู้ใช้ (`npm install` / `pnpm add` / `yarn add`) ข้อความในไฟล์เริ่มต้นที่เป็น TypeScript-only ห่อด้วย `⟨ ⟩` และจะถูกตัดออกเมื่อปิด TypeScript รายการ placeholder ทั้งหมดอยู่หัวไฟล์ [`src/lib/placeholders.ts`](../../src/lib/placeholders.ts) และใน [template-schema.md](../reference/template-schema.md)

## ขั้นตอนร่วม (shared steps)

ขั้นที่ใช้หลายเทมเพลตอยู่ใน [`src/data/common-steps.ts`](../../src/data/common-steps.ts) (เช่น `mkdirAndCd`, `npmInit`, `createNextApp`, `pyVenv`), ขั้นตั้งค่า runtime อยู่ใน [`src/data/runtime-steps.ts`](../../src/data/runtime-steps.ts) (nvm, pnpm, yarn, python check, uv) และขั้นของ add-on อยู่ใน [`src/data/addon-steps.ts`](../../src/data/addon-steps.ts) การใช้ id เดียวกันทำให้ dedup ทำงานถูกต้องเมื่อขั้นเดียวกันมาจากหลายแหล่ง

## คำแนะนำในการออกแบบเทมเพลต

- คำสั่งต้อง **ถูกต้อง ทันสมัย และ non-interactive** (ใช้ `--yes`, `-y`) อ้างอิงเอกสารทางการและใส่ลิงก์ใน `docs`
- ใส่ `verify` ทุกขั้นที่ทำได้ ใช้คำสั่งอ่านอย่างเดียว เช่น `node -v`, `{{list}} express`
- dev server เป็น `longRunning` เสมอ, การเผยแพร่เป็น `publish`, ตัวติดตั้งหรือการเปลี่ยนแปลงระดับเครื่องเป็น `manual`
- ใส่ `keywords` ทั้งไทยและอังกฤษ เพื่อให้ offline planner เลือกถูก

## ดูเพิ่ม

[composition.md](./composition.md) (การประกอบและเรียงลำดับ), [add-template.md](../contributing/add-template.md) (ตัวอย่างเต็ม), [template-schema.md](../reference/template-schema.md)
