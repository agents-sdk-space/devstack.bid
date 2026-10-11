# Subsystem: Templates data + Composer

## หน้าที่

แปลง "สิ่งที่ผู้ใช้เลือก" (`BuilderConfig`) เป็น "ลำดับขั้นตอนที่แทนค่าแล้ว" (`ResolvedStep[]`) นี่คือแกนกลางที่ทุกส่วนใช้ร่วม: หน้า template detail, builder, offline planner, การตรวจผล AI และ CLI export

## โครงสร้างไฟล์

| ไฟล์ | บทบาท |
|---|---|
| [`src/lib/types.ts`](../../src/lib/types.ts) | ชนิดข้อมูลทั้งหมด: `StackTemplate`, `StepDef`, `ResolvedStep`, `BuilderConfig`, `BuilderEdits`, `ADDON_IDS` |
| [`src/data/templates/index.ts`](../../src/data/templates/index.ts) | registry: `TEMPLATES`, `TEMPLATE_IDS`, `getTemplate()` |
| `src/data/templates/<id>.ts` | ข้อมูลเทมเพลตแต่ละตัว (10 ไฟล์) |
| [`src/data/template-ids.ts`](../../src/data/template-ids.ts) | รายการ id แบบเบา ใช้ใน `next.config.ts` (404 rewrite) โดยไม่ต้อง bundle ข้อมูลเทมเพลต; test ตรวจว่าตรงกับ registry |
| [`src/data/common-steps.ts`](../../src/data/common-steps.ts) | ขั้นที่ใช้ร่วม: `mkdirAndCd`, `cdProject`, `npmInit`, `createNextApp`, `createViteApp`, `pmInstall`, `pyVenv`, `pyFreeze` |
| [`src/data/runtime-steps.ts`](../../src/data/runtime-steps.ts) | `nvmStep`, `pnpmStep`, `yarnStep`, `pythonCheckStep`, `uvInstallStep`, `uvPythonStep` |
| [`src/data/addon-steps.ts`](../../src/data/addon-steps.ts) | `ADDON_LABELS` และ `addonSteps(template, config)`: Tailwind (Vite), Ruff, Vitest, pytest, Docker (Dockerfile ตาม `template.docker.kind`), CI (GitHub Actions ตาม `template.ci`) |
| [`src/lib/placeholders.ts`](../../src/lib/placeholders.ts) | `sanitizeProjectName`, `addonOn`, `buildContext`, `resolveText` |
| [`src/lib/composer.ts`](../../src/lib/composer.ts) | `DEFAULT_CONFIG`, `configForTemplate`, `normalizeConfig`, `adaptForPowerShell`, `dedupeSteps`, `composeSteps`, `applyEdits`, `moveStep`, `flattenCommands` |

## ขั้นตอนการทำงาน

ดูคำอธิบายเชิงแนวคิดใน [composition.md](../concepts/composition.md) สรุปสั้น: `normalizeConfig` → `buildContext` → runtime steps → template steps (กรอง `when`) → add-on steps แทรกก่อนขั้น non-setup แรก → `resolveStep` (แทนค่า + สร้างคำสั่ง Windows) → `dedupeSteps`

## การแปลงคำสั่งเป็น PowerShell

ถ้าขั้นไม่มี `windows` override, `adaptForPowerShell` แปลงแบบ best-effort สามกฎ: `curl ` → `curl.exe ` (เลี่ยง alias ของ Invoke-WebRequest), `python3 ` ต้นบรรทัด → `py -<version> `, ` && ` → `; ` คำสั่งที่ซับซ้อนกว่านี้ (activate venv, `cp`, `chmod`, ตัวแปร env) ต้องเขียน `windows` เอง ข้อนี้อยู่ใน checklist ของ [add-template.md](../contributing/add-template.md)

## add-on ทำงานอย่างไร

- add-on มีผลเฉพาะเมื่อ **ถูกเลือก และ** อยู่ใน `template.supportedAddons` (`addonOn`)
- TypeScript/Tailwind/ESLint ส่วนใหญ่มีผลผ่าน placeholder (`{{nextFlags}}`, `{{viteTemplate}}`, `{{viteLint}}`, `{{ext}}`, `⟨ ⟩`) ไม่ใช่ขั้นแยก
- Testing, Docker, CI, Ruff, Tailwind-on-Vite เพิ่มขั้นของตัวเองจาก `addonSteps`
- `eslint` บนเทมเพลต Python หมายถึง Ruff; `testing` หมายถึง pytest

## Invariants ที่ test บังคับ

(ชื่อ test จริงใน `tests/composer.test.ts`)

- เทมเพลต Node เริ่มด้วย nvm และไม่มี placeholder ค้าง (`{{...}}`) — *starts Node templates with nvm and resolves every placeholder*
- flags ของ create-next-app และตัวคั่น `--` ของ npm ถูกต้องตามตัวจัดการแพ็กเกจ
- syntax เฉพาะ TypeScript (`⟨ ⟩`) ถูกตัดเมื่อเป็น JavaScript; Python ใช้ pip หรือ uv ถูกต้อง
- ขั้น add-on ถูกแทรกก่อนขั้น long-running และ add-on ที่ไม่รองรับถูกละเลย
- ทุกเทมเพลตได้ลำดับที่ไม่มีขั้นซ้ำ; `applyEdits` คงขั้นใหม่ไว้ในตำแหน่งธรรมชาติ
- `KNOWN_TEMPLATE_IDS` ตรงกับ `TEMPLATE_IDS` (`tests/production.test.ts`)
- `npm run docs:check` ตรวจว่าทุก template id ถูกระบุในเอกสาร

## จุดขยาย

- เพิ่มเทมเพลต: ไฟล์ใหม่ + ลงทะเบียน + เพิ่ม id ใน `template-ids.ts` + เอกสาร ([add-template.md](../contributing/add-template.md))
- เพิ่ม add-on ใหม่: แก้ `ADDON_IDS` (types), `ADDON_LABELS` + `addonSteps`, JSON Schema ของ AI ใช้ `ADDON_IDS` อัตโนมัติ, `ADDON_HINTS` ใน fallback, UI builder, `addonTool()` ใน `tool-icon.tsx` และ test
- เพิ่มตัวจัดการแพ็กเกจ: แก้ชนิด `JsPm`/`PyPm`, ตาราง `PM` ใน placeholders, `normalizeConfig`, schema ของ AI

## ประวัติ

สร้างใน `a452dc5` (v0.1.0) และคงที่จนถึง v0.5 ยกเว้นการเพิ่ม `template-ids.ts` ใน `b88a5c5` (v0.3.0) ดู [SUBSYSTEM-HISTORY.md](../history/SUBSYSTEM-HISTORY.md)
