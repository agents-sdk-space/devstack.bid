# การประกอบคำสั่ง ลำดับ และการตัดซ้ำ · Command composition, ordering & dedup

หน้านี้อธิบายตรรกะใน [`src/lib/composer.ts`](../../src/lib/composer.ts) ซึ่งเปลี่ยน `BuilderConfig` เป็นรายการ `ResolvedStep` ที่พร้อมแสดงและส่งออก ตรรกะนี้ไม่ได้เปลี่ยนเลยตั้งแต่ v0.1.0 (commit `[commit redacted]`) และมี unit test ครอบคลุมใน `tests/composer.test.ts`

## ขั้นตอนของ composeSteps()

1. **normalizeConfig** ทำ config ที่อาจไม่น่าเชื่อถือ (จากลิงก์แชร์หรือ AI) ให้ถูกต้อง: template ที่ไม่รู้จักกลับเป็น `nextjs-dashboard`, เวอร์ชัน/ตัวจัดการที่ไม่รู้จักกลับเป็นค่าเริ่มต้น (`lts`, `3.12`, `npm`, `pip`), add-on กรองเหลือเฉพาะใน `ADDON_IDS`, ชื่อโปรเจกต์ผ่าน `sanitizeProjectName`
2. **buildContext** สร้างตาราง placeholder จาก config + template เช่น `install`, `add`, `run`, `nextFlags` (`--ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --yes`), `venv`, `pip`
3. **ขั้น runtime** ถ้าเทมเพลตใช้ Node: `nvmStep` (+ `pnpmStep` หรือ `yarnStep`) ถ้าใช้ Python: `uvInstallStep` + `uvPythonStep` (เมื่อเลือก uv) หรือ `pythonCheckStep`
4. **ขั้นของเทมเพลต** กรองด้วย `when` (`matchesWhen`: add-on ต้องทั้งถูกเลือกและเทมเพลตรองรับ)
5. **ขั้นของ add-on** (`addonSteps`) ถูก **แทรกก่อนขั้นแรกที่เป็น longRunning / publish / manual** ของเทมเพลต
6. **resolveStep** แทนค่า placeholder ทุกฟิลด์ สร้างคำสั่ง Windows (ใช้ `windows` override หรือ `adaptForPowerShell`) และกำหนด `source` (runtime / template / addon)
7. **dedupeSteps** ตัดซ้ำ

### ทำไมแทรก add-on ก่อน dev server

ลำดับที่ถูกคือ ติดตั้งทุกอย่าง → ตั้งค่า lint/test/Docker/CI → เริ่ม dev server ถ้าแทรก add-on ท้ายสุด ขั้นติดตั้ง Vitest จะอยู่หลัง `npm run dev` ซึ่งในสคริปต์ถูกคอมเมนต์ไว้ ผู้ใช้ที่รันตามลำดับในเอกสารจะติดอยู่ที่ dev server ก่อนติดตั้งเครื่องมือครบ

## กฎการตัดซ้ำ (dedup)

`dedupeSteps` เก็บขั้นแรกที่พบ และตัดขั้นหลังที่:

- มี **id ซ้ำ** หรือ
- มี **signature ซ้ำ** คือ JSON ของ `[commands, paths ของ files]` เหมือนกัน (ขั้นที่ไม่มีทั้งคำสั่งและไฟล์ใช้ id เป็น signature)

เหตุผล: ขั้นเดียวกันอาจมาจากหลายแหล่ง เช่น เทมเพลตและ add-on ต่างก็ต้อง `cd` เข้าโปรเจกต์ หรือ AI เสนอขั้นที่ทำสิ่งเดียวกับเทมเพลตภายใต้ id อื่น การเทียบ signature จับกรณีหลังได้ นอกจากนี้ `sanitizeAiPlan` ยังตัดคำสั่งของ AI ที่ตรงกับคำสั่งเทมเพลตออกก่อนด้วย

## การแก้ไขของผู้ใช้ (applyEdits)

`BuilderEdits` มีสามส่วน: `order` (ลำดับ id ที่ผู้ใช้จัด), `removed` (id ที่ลบ) และ `custom` (ขั้นที่เพิ่มเอง / จาก AI)

1. แทรก `custom` **ก่อนขั้นแรกที่ไม่ใช่ setup** แล้ว dedup อีกรอบ ได้ลำดับ "ธรรมชาติ"
2. เริ่มจาก `order` ที่ผู้ใช้จัด (ตัด id ที่ไม่มีอยู่แล้ว ที่ถูกลบ และที่ซ้ำ)
3. ขั้นที่ยังไม่อยู่ใน `order` (เช่น เพิ่งเปิด add-on ใหม่) ถูกแทรก **ต่อจากขั้นก่อนหน้าตามธรรมชาติที่อยู่ในผลลัพธ์แล้ว** ไม่ใช่ท้ายสุด

ผลคือผู้ใช้จัดลำดับเองแล้วยังเปลี่ยน add-on ต่อได้โดยลำดับไม่พัง และลิงก์แชร์เก่าที่อ้าง id ซึ่งไม่มีแล้วก็ยังใช้ได้

## ฟังก์ชันอื่นที่เกี่ยวข้อง

- `moveStep(ids, id, ±1)` สลับตำแหน่งสำหรับปุ่มขึ้น/ลง
- `flattenCommands(steps, os)` คำสั่งทั้งหมดแบบเรียบ สำหรับ "Copy all"
- `configForTemplate(id, base)` config ของเทมเพลตพร้อม add-on เริ่มต้นและชื่อเริ่มต้น

## ข้อควรระวังเมื่อแก้ composer

- ห้ามเปลี่ยนความหมายของ id เดิมโดยไม่จำเป็น เพราะลิงก์แชร์อ้าง id
- ทุกการเปลี่ยนต้องมี test ใน `tests/composer.test.ts` และรัน `npm run export -- <id>` เพื่อดูสคริปต์จริง

## ดูเพิ่ม

[architecture/templates-and-composer.md](../architecture/templates-and-composer.md), [stack-template.md](./stack-template.md)
