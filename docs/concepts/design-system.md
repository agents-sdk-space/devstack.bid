# ระบบดีไซน์ · Design system (NVX UI)

NVX UI คือระบบดีไซน์ของแอป ประกอบด้วย **design tokens** (ตัวแปร CSS → ธีม Tailwind v4), **ไลบรารีคอมโพเนนต์** ใน `src/components/ui` และ **style guide แบบมีชีวิต** ที่ `/design` หน้านี้อธิบายแนวคิด ส่วนรายละเอียดเชิงเทคนิคทั้งหมดอยู่ใน [UI-FRAMEWORK.md](../UI-FRAMEWORK.md) และ [architecture/ui-framework.md](../architecture/ui-framework.md)

## แนวคิดหลัก

1. **Semantic tokens เท่านั้น** คอมโพเนนต์ใช้ utility ตามความหมาย เช่น `bg-surface`, `text-muted`, `bg-primary`, `text-link` ไม่ใช้สีดิบ (`bg-zinc-900`) เหตุผล: เปลี่ยนธีมทั้งแอปได้จากไฟล์เดียว ([`src/app/tokens.css`](../../src/app/tokens.css)) และไม่ต้องใช้ `dark:` ในคอมโพเนนต์เลย
2. **Accessibility เป็นค่าเริ่มต้น** คอมโพเนนต์ที่โต้ตอบได้สร้างบน Radix UI (คีย์บอร์ด, focus trap, ARIA ครบ), ทุกคู่สีข้อความผ่าน WCAG AA ทั้งสองธีมและมี test บังคับ (`tests/tokens.test.ts`), เคารพ `prefers-reduced-motion`
3. **ปรับสไตล์ได้โดยไม่แตะโครงสร้าง** ธีมเปลี่ยนมาแล้วสามครั้ง (v0.2 → v0.4 → v0.5) โดยโครงสร้างหน้าและคอมโพเนนต์คงเดิม เพราะดีไซน์ถูกแยกเป็น token

## วิวัฒนาการ (สรุป)

| เวอร์ชัน | ลุค | commit หลัก |
|---|---|---|
| v0.1.0 | Tailwind พื้นฐาน, utility class ส่วนกลาง (`.card`, `.btn-*`), ฟอนต์ Noto Sans Thai | `a452dc5` |
| v0.2.0 | NVX UI: tokens + คอมโพเนนต์ + `/design`, Geist + IBM Plex Sans Thai, light/dark ตาม OS | `3e5a8c2`, `4ac2756`, `1b0f105` |
| v0.4 | Terminal theme: ดำเป็นค่าเริ่มต้น, เขียวฟอสฟอร์, IBM Plex Mono ทั่ว UI, สัญลักษณ์ DOS | `2210920`, `1219529` |
| v0.5 | อ้างอิง developer.apple.com: ดำล้วน, Inter, ปุ่มแคปซูล, ฟ้า `#0071e3` + link `#2997ff`, โลโก้เครื่องมือจริง, ไม่มีอีโมจิ | `b6e61a5`, `382750c`, `3dad906` |

รายละเอียดเหตุผลแต่ละครั้งดู [SUBSYSTEM-HISTORY.md](../history/SUBSYSTEM-HISTORY.md)

## หลักการของ v0.5 ที่ควรรักษา

- **พื้นดำเป็นค่าเริ่มต้น** สำหรับทุกคน ธีมสว่างเลือกได้จากปุ่มสลับ
- **สีฟ้าสองบทบาท**: `primary` (#0071e3) สำหรับปุ่มทึบที่มีตัวอักษรขาว และ `link` สำหรับข้อความสีฟ้า เพราะ #0071e3 บนพื้นดำไม่ผ่าน AA สำหรับข้อความ ห้ามใช้ `text-primary` กับข้อความ
- **ฟอนต์**: Inter สำหรับ UI, IBM Plex Sans Thai สำหรับไทย, IBM Plex Mono เฉพาะโค้ด/คำสั่ง/ป้ายเล็ก
- **รูปทรง**: มุมโค้ง 6/10/12/18/22px, ปุ่มและชิปเป็นแคปซูล (`rounded-full`)
- **ไอคอน**: โลโก้เครื่องมือจริงจาก simple-icons (`ToolTile`, `ToolIcon`) + ไอคอน UI จาก lucide-react ห้ามใช้อีโมจิ (มี test บังคับใน `tests/tool-icons.test.tsx`) โลโก้เป็นเครื่องหมายการค้าของเจ้าของ ใช้เพื่อระบุเครื่องมือเท่านั้น (ดู [NOTICE](../../NOTICE))
- **มาสคอตสีชมพู**: โลโก้ (ก้อนสีชมพูมีตาสองข้าง) เป็นตัวละครที่ขยับได้ ใน header ลอยและกะพริบตาอย่างสุภาพ ใน hero ตามองตามเมาส์และเด้งเมื่อคลิก เหตุผลคือให้แบรนด์มีบุคลิกโดยไม่แตะระบบสีหลัก สีชมพู `#fb0fab` (วัดจากโลโก้) ใช้เป็นสีตกแต่งเท่านั้น ส่วนปุ่ม ลิงก์ และโฟกัสยังเป็นสีฟ้า เพื่อไม่ให้ผู้ใช้สับสนว่าอะไรกดได้ ดูตัวอย่างที่ `/design#mascot`
- **กลิ่นอายเทอร์มินัล** เหลือเฉพาะหน้าต่างโค้ด: จุดสามสีแบบ macOS, prompt `$` สีเขียว และเคอร์เซอร์กะพริบใน hero

## ซิกเนเจอร์ DevStack (terminal signature)

ซิกเนเจอร์คือหน้าต่างเทอร์มินัลสีดำขอบขาวหนา มีไทล์เครื่องมือ 4 ช่อง (JavaScript, curl, npm, PyPI) และ prompt ที่พิมพ์คำสั่งวนไปเรื่อย ๆ เราวางไว้ใน **ส่วนท้ายของทุกหน้า** และในหน้าแรกของ `/docs` โดยไม่เปลี่ยน layout ของหน้าอื่น คอมโพเนนต์อยู่ที่ [`src/components/brand/terminal-signature.tsx`](../../src/components/brand/terminal-signature.tsx) สไตล์อยู่ใน `globals.css` (คลาส `.sig*`) และดูตัวอย่างได้ที่ `/design#signature`

- สร้างด้วย HTML + SVG แบบ inline (โลโก้ JS, npm, Python จาก simple-icons ส่วน curl เป็นข้อความ `curl://`) ขนาดทั้งหมดเป็นหน่วย container query (`cqw`) จึงคมชัดทุกขนาด
- **แสง**: ขอบสว่างตามตำแหน่งเมาส์ (CSS vars `--sig-x`, `--sig-y`, `--sig-o` กับ radial gradient ที่ mask ให้เหลือเฉพาะขอบ), ตัวอักษรเรืองแสงเมื่อชี้, เคอร์เซอร์เต้นเบา ๆ ตอนว่าง บนจอสัมผัส แตะแล้วขอบจะสว่างตรงจุดที่แตะแล้วจางลง
- **prefers-reduced-motion**: ไม่พิมพ์ ไม่ตามเมาส์ ไม่เต้น แสดงคำสั่ง curl นิ่ง ๆ
- **คำสั่งที่แสดงต้องเป็นคำสั่งจริงที่ใช้ได้วันนี้เท่านั้น**: `npm create vite@latest my-app`, `curl -fsSL https://devstack.bid/llms.txt`, `npx create-next-app@latest my-app`, `pip install fastapi`

### เปิดใช้คำสั่ง nvxdev เมื่อจดแพ็กเกจแล้ว

คำสั่ง `npx nvxdev init` และ `pip install nvxdev` อยู่ใน `SIGNATURE_COMMAND_CONFIG` ใต้คอมเมนต์ `// MARK: nvxdev` พร้อม `published: false` จึงไม่แสดงบนหน้าเว็บ เพราะแพ็กเกจยังไม่มีบน npm และ PyPI เมื่อจดแพ็กเกจและทดสอบว่าคำสั่งใช้ได้จริงแล้ว:

1. เปลี่ยนเป็น `published: true` (ถ้าอยากให้พิมพ์ก่อน ให้ย้ายขึ้นไปไว้ต้นรายการ)
2. แก้ test ใน `tests/signature.test.tsx` ที่ตรวจว่า nvxdev ยังซ่อนอยู่ ให้ตรงกับรายการใหม่
3. อัปเดตรายการคำสั่งในหัวข้อนี้ แล้วรัน `npm test` และ `npm run docs:check`

## ข้อตกลงกับเจ้าของผลิตภัณฑ์

การเปลี่ยน **โครงสร้างหรือ layout** ของหน้า (เพิ่ม/ลบ section, ย้ายลำดับ) ต้องได้รับอนุญาตก่อนเสมอ การปรับสไตล์ทำผ่าน token และ class ได้ แต่ต้องรักษา contrast AA และผ่าน test

## ดูเพิ่ม

`/design` (เปิดในแอป), [add-component.md](../contributing/add-component.md), [`src/lib/design-tokens.ts`](../../src/lib/design-tokens.ts)
