# เพิ่มคอมโพเนนต์ UI · Adding a component

คอมโพเนนต์ของระบบดีไซน์อยู่ใน `src/components/ui/` และ export ผ่าน [`src/components/ui/index.ts`](../../src/components/ui/index.ts) คู่มือฉบับเต็มเรื่องนี้ (TH + EN) อยู่ใน [UI-FRAMEWORK.md](../UI-FRAMEWORK.md) หัวข้อ "Adding a component" หน้านี้สรุปขั้นตอนพร้อมเหตุผล

## เมื่อไรควรสร้างคอมโพเนนต์ใหม่

- รูปแบบ UI ถูกใช้ซ้ำ **ตั้งแต่ 2 ที่ขึ้นไป** หรือมีพฤติกรรมด้าน accessibility ที่ไม่อยากเขียนซ้ำ (focus, ARIA, keyboard)
- ถ้าใช้ที่เดียว ให้เขียนใน feature component ด้วย utility ตาม token ก็พอ

## ขั้นตอน

1. **เริ่มจาก Radix ถ้าโต้ตอบได้** (dialog, popover, tabs, toggle) ได้คีย์บอร์ด focus trap และ ARIA ครบ dependency ที่มีอยู่: `@radix-ui/react-{dialog,tabs,tooltip,switch,checkbox,toast,slot}` ถ้าต้องเพิ่ม primitive ใหม่ ให้ระบุเหตุผลใน PR
2. **สไตล์ด้วย semantic utilities เท่านั้น** (`bg-surface`, `border-border`, `text-fg`, `text-muted`, `bg-primary text-primary-fg`, `text-link`, `rounded-xl`, `shadow-md`, `focus-ring`, `motion-base`) ห้ามสีดิบ ห้าม `dark:` — ถ้าขาด token ให้เพิ่มใน [`src/app/tokens.css`](../../src/app/tokens.css) ทั้ง `:root` และ `.dark`, map ใน `globals.css`, เพิ่มใน [`src/lib/design-tokens.ts`](../../src/lib/design-tokens.ts) และเพิ่มคู่ contrast ใน `tests/tokens.test.ts`
3. **ใช้ `cn()`** ([`cn.ts`](../../src/components/ui/cn.ts)) รวม className และรับ `className` จากภายนอก
4. **ไอคอน**: lucide-react สำหรับ UI (`h-4 w-4`, `aria-hidden`), `ToolIcon`/`ToolTile` สำหรับโลโก้เครื่องมือ ห้ามอีโมจิ (test จะล้ม)
5. **ข้อความ**: รับผ่าน props หรือใช้ `useLang()` + key ใน [`src/lib/i18n.ts`](../../src/lib/i18n.ts) ต้องมีทั้งไทยและอังกฤษ
6. **export** ใน `index.ts`
7. **แสดงใน `/design`**: เพิ่ม section ใน [`src/components/design-system.tsx`](../../src/components/design-system.tsx) (ต่อท้าย `SECTIONS` เพื่อไม่ให้ index เดิมเลื่อน) พร้อมคำอธิบายสองภาษาและ usage snippet
8. **test**: เพิ่มใน `tests/ui-components.test.tsx` อย่างน้อย: render, role/ชื่อที่เข้าถึงได้, พฤติกรรมคีย์บอร์ดหลัก
9. **เอกสาร**: อัปเดตตารางคอมโพเนนต์ใน `docs/UI-FRAMEWORK.md` และ CHANGELOG

## กฎ accessibility (สรุป)

- ปุ่มไอคอนอย่างเดียวต้องมี `aria-label`
- ใช้ element ที่ถูกความหมาย (`button` สำหรับ action, `a` สำหรับนำทาง) — ใช้ `asChild` เมื่อต้องการสไตล์ปุ่มบนลิงก์
- โฟกัสต้องมองเห็นได้ (`focus-ring`) และลำดับ Tab สมเหตุสมผล
- ข้อความต้องผ่าน AA (4.5:1) ทั้งสองธีม ส่วน non-text 3:1
- เคารพ `prefers-reduced-motion` (ใช้ token duration ซึ่งเป็น 0.01ms อัตโนมัติ)
- ภาษาไทย: อย่าใช้ `leading-none`/`leading-tight` กับเนื้อหาไทย

## ข้อห้ามเชิงผลิตภัณฑ์

การเพิ่มคอมโพเนนต์ **ไม่ใช่ใบอนุญาตให้เปลี่ยนโครงสร้างหน้า** การวางคอมโพเนนต์ใหม่ลงในหน้าที่มีอยู่ (เพิ่ม section) ต้องได้รับอนุญาตจากเจ้าของก่อน

## ตรวจสอบ

`npm run lint && npm run typecheck && npm test` จากนั้น `npm run preview` แล้วเปิด `/design` ทั้งสองธีมและสองภาษา ตรวจที่ความกว้าง 390px ว่าไม่มี horizontal scroll
