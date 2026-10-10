# ตัวสร้างสแต็ก 4 ขั้น · The builder

ตัวสร้าง (`/builder`) คือหัวใจของแอป มันรับ "การตั้งค่า" (`BuilderConfig`) กับ "การแก้ไขของผู้ใช้" (`BuilderEdits`) แล้วคำนวณลำดับคำสั่งสุดท้ายแบบเรียลไทม์ หน้านี้อธิบายทั้งวิธีใช้และเหตุผลของแต่ละขั้น ตัวสร้างถูกออกแบบใหม่เป็น wizard 4 ขั้นใน v0.2.0 (commit `853feac`) เพื่อลดภาระการคิดเมื่อเทียบกับหน้าเดียวยาว ๆ ใน v0.1.0

## ภาพรวมขั้นตอน (Stepper)

| ขั้น | ชื่อ | ทำอะไร | ทำไมต้องแยกขั้น |
|---|---|---|---|
| 1 | **Start** | ถาม AI หรือเลือกเทมเพลต | ตัดสินใจเรื่องใหญ่ที่สุด (ประเภทแอป) ก่อน |
| 2 | **Configure** | ชื่อโปรเจกต์, เวอร์ชัน Node/Python, npm/pnpm/yarn, pip/uv, add-on | ตัวเลือกพวกนี้เปลี่ยนคำสั่งทุกขั้น จึงต้องตั้งก่อนจัดลำดับ |
| 3 | **Review & reorder** | อ่าน ลาก ลบ กู้คืน เพิ่มขั้นตอนเอง | ปรับแต่งบนลำดับที่ถูกต้องอยู่แล้ว แทนการเริ่มจากศูนย์ |
| 4 | **Export** | คัดลอก แชร์ ดาวน์โหลด | ส่งมอบผลลัพธ์ในรูปแบบที่เหมาะกับแต่ละ OS |

แถบสรุป **Current stack** ด้านบนแสดงเทมเพลต ชื่อโปรเจกต์ runtime ตัวจัดการแพ็กเกจ add-on และจำนวนขั้นตลอดเวลา พร้อมปุ่ม Copy ปุ่ม Back/Next ด้านล่างเลื่อนขั้น และโฟกัสคีย์บอร์ดจะย้ายไปที่หัวข้อขั้นใหม่เพื่อการเข้าถึง (accessibility)

## ขั้น 1: Start

- แท็บ **Ask the AI agent** อธิบายแอปแล้วกด *Plan my stack* หรือ *Use offline planner* (ดู [ai-agent.md](./ai-agent.md)) เมื่อได้แผนแล้วกด **Load into builder** เทมเพลต add-on และขั้นตอนพิเศษจาก agent จะถูกโหลดเข้า
- แท็บ **Pick a template** เลือกการ์ดเทมเพลตจากรายการ เหมือนหน้า catalog

## ขั้น 2: Configure

- **Project name** ถูกทำให้ปลอดภัยด้วย `sanitizeProjectName` (ตัวพิมพ์เล็ก a-z 0-9 . _ - ยาวไม่เกิน 50) เพราะชื่อนี้กลายเป็นชื่อโฟลเดอร์และชื่อแพ็กเกจ npm/PyPI
- **Node.js version (nvm)**: LTS, 24, 22, 20 และ **JS package manager**: npm / pnpm / yarn เลือก pnpm หรือ yarn จะเพิ่มขั้นเปิดใช้ตัวจัดการนั้นอัตโนมัติ
- **Python version**: 3.13, 3.12, 3.11 และ **Python package manager**: pip / uv เลือก uv จะเพิ่มขั้นติดตั้ง uv และติดตั้ง Python ผ่าน uv
- **Add-ons**: TypeScript, Tailwind CSS, Linting (ESLint / Ruff), Testing (Vitest / pytest), Docker, GitHub Actions CI add-on ที่เทมเพลตไม่รองรับจะถูกปิดและมีข้อความ "not available for this template"

ทุกตัวเลือกถูกแปลงเป็น placeholder เช่น `{{install}}`, `{{add}}`, `{{nextFlags}}` ใน composer จึงไม่ต้องเขียนเทมเพลตซ้ำสำหรับแต่ละตัวจัดการแพ็กเกจ (ดู [composition.md](../concepts/composition.md))

## ขั้น 3: Review & reorder

- **ลากที่จับ** เพื่อสลับลำดับ หรือใช้คีย์บอร์ด: โฟกัสที่จับ กด Space เพื่อยก กด ↑/↓ เพื่อย้าย กด Space อีกครั้งเพื่อวาง มีปุ่มเลื่อนขึ้น/ลงสำรองด้วย (การย้ายด้วยคีย์บอร์ดถูกแก้ให้ขยับทีละหนึ่งช่องเสมอใน commit `ae35a20`)
- **ลบ** ขั้นตอนแล้วกู้คืนได้จากส่วน "Removed steps" มี toast ยืนยันทุกครั้ง
- **Add a custom step** ใส่ชื่อและคำสั่ง (บรรทัดละคำสั่ง) คำสั่งผ่าน `sanitizeStep` เสมอ คำสั่งอันตราย เช่น `rm -rf /` ถูกบล็อก ส่วนคำสั่งเสี่ยง เช่น `curl ... | sh` หรือ `sudo` ถูกทำเครื่องหมายเป็น manual
- **Reset edits** ย้อนกลับเป็นลำดับเริ่มต้นของเทมเพลต

ขั้นตอนที่ผู้ใช้หรือ AI เพิ่มจะถูกแทรก **ก่อน** ขั้นแรกที่เป็น long-running/publish/manual เพื่อให้ dev server อยู่ท้ายสุดเสมอ (ตรรกะใน `applyEdits`)

## ขั้น 4: Export

- สลับ **Shell**: POSIX (bash/zsh) หรือ Windows PowerShell แล้วดูคำสั่งทั้งหมดในหน้าต่างโค้ด
- **Copy all commands**, **Copy share link**, ดาวน์โหลด `setup.sh`, `setup.ps1`, `README.md`, **Starter .zip** (ดู [downloads.md](./downloads.md))

## การจำสถานะ

ทุกการเปลี่ยนแปลงถูกเข้ารหัสลง URL hash (`/builder#s=...`) และ `localStorage` คีย์ `nvx-builder-state` ทันที รีเฟรชหน้าแล้วได้สแต็กเดิม และ URL ในแถบที่อยู่คือ share link เสมอ

## อ้างอิง

[`src/components/builder.tsx`](../../src/components/builder.tsx), [`src/components/sortable-steps.tsx`](../../src/components/sortable-steps.tsx), [`src/lib/composer.ts`](../../src/lib/composer.ts), [`src/lib/placeholders.ts`](../../src/lib/placeholders.ts)
