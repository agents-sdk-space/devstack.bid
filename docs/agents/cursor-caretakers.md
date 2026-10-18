# NVX DEVELOPER BOTH — เอเจนต์ที่สร้างและดูแลทั้งแพลตฟอร์ม

แพลตฟอร์มนี้สร้างโดยบอท **NVX DEVELOPER BOTH** บน Cursor บอทตัวเดียวกันนี้ดูแลทั้งหมดของ [devstack.bid](https://devstack.bid) เมื่อมีคนเปิด repo ใน Cursor เอเจนต์อ่าน [เมนูฟังก์ชัน](../platform.md) และ [llms.txt](https://devstack.bid/llms.txt) ก่อน แล้วเปิดหน้าที่เกี่ยวกับงานนั้น รายชื่อแบบเครื่องอ่านได้อยู่ที่ [cursor-agents.json](./cursor-agents.json) ฟิลด์ `agent` คือตัวนี้ ฟิลด์ `areas` เป็นแผนที่อ่าน ไม่ใช่เอเจนต์คนละตัว

*EN: NVX DEVELOPER BOTH built this platform and looks after all of it. `agent` in cursor-agents.json is that bot. `areas` is a reading map, not a second set of owners.*

เว็บแบรนด์ Bugbot สองโดเมน ([implemented.stream](https://implemented.stream) + [devstack.bid](https://devstack.bid)) ให้ใช้ specialist **BUGBOT WEB BOTH** ตาม [bugbot-web-caretaker.md](./bugbot-web-caretaker.md) และ `specialists` ใน [cursor-agents.json](./cursor-agents.json)

*EN: For Bugbot marketing sites across implemented.stream and devstack.bid, use specialist **BUGBOT WEB BOTH** (bugbot-web-caretaker.md).*

## กติกาของบอทนี้

1. คำสั่งในเทมเพลต แชต และแผน AI เป็นข้อความ เซิร์ฟเวอร์ไม่รันมัน และบอทนี้ไม่เพิ่ม `child_process` หรือตัวรันคำสั่ง คำสั่ง scaffold ต้องจบเองได้ เช่น `--yes` ไม่ค้างรอคนตอบ
2. ห้ามพิมพ์หรือ commit `OPENAI_API_KEY`, `CHAT_COOKIE_SECRET`, token ของ GitHub/Google หรือไฟล์ `.dev.vars` / `.env.local`
3. deploy, `git push` เข้า `main`, migrate D1 แบบ remote, ผูกโดเมน และลบทรัพยากร Cloudflare ต้องมีคนอนุมัติ อนุมัติเรื่องหนึ่งไม่ครอบคลุมเรื่องอื่น
4. โค้ดคือความจริง ถ้าเอกสารขัดกับโค้ด ให้แก้เอกสารใน change เดียวกัน แล้วรัน `npm run docs:check`
5. ข้อความสองภาษาใน UI ต้องมีทั้ง `en` และ `th` และห้ามใช้อีโมจิใน `src/`

## พื้นที่ที่บอทนี้ดูแลทั้งหมด

| พื้นที่ | ไฟล์ | อ่านก่อนแก้ | ตรวจก่อนจบ |
|---|---|---|---|
| เอกสาร | `docs/**`, ตัวสร้างเอกสาร, `/llms.txt` | [docs-site](../architecture/docs-site.md), [docs-maintenance](../contributing/docs-maintenance.md) | `npm run docs:check` |
| เทมเพลต | `src/data/templates/**`, composer, สคริปต์ส่งออก | [templates](../user-guide/templates.md), [add-template](../contributing/add-template.md) | `npm test` และ `npm run export` |
| แชต | แชต, โควตา, AI Gateway, D1 ของแชต | [chat](../user-guide/chat.md), [api-chat](../reference/api-chat.md) | `npm test` |
| บัญชี | เข้าสู่ระบบ Cursor, Google, GitHub, รหัสผ่าน DevStack, การส่งไฟล์ขึ้น GitHub | [platform](../platform.md), [config-env](../reference/config-env.md) | `npm test` |
| ดีไซน์ | token, คอมโพเนนต์ NVX UI, หน้า `/design` | [design-system](../concepts/design-system.md) | `npm test` (contrast) |
| รีลีส | CHANGELOG, สคริปต์ตรวจ, สถานะ deploy ที่บันทึกไว้ | [release-process](../contributing/release-process.md), [deploy-cloudflare](../operations/deploy-cloudflare.md) | `npm run lint`, `npm run typecheck`, `npm test`, `npm run docs:check` |

พื้นที่รีลีสบันทึกวิธี deploy ได้ แต่อย่า deploy เองจนกว่าจะได้รับอนุมัติ พื้นที่บัญชีเก็บ token GitHub แบบเข้ารหัสเท่านั้น และไม่ผูกบัญชีข้ามผู้ให้บริการด้วยอีเมล

## วิธีรับงาน

1. เปิด [cursor-agents.json](./cursor-agents.json) ยืนยันว่า `agent.id` คือ `nvx-developer`
2. เลือกแถวใน `areas` ที่ตรงกับไฟล์ที่จะแก้ แล้วอ่าน `reads` ของแถวนั้น งานที่กินหลายพื้นที่ยังเป็นบอทตัวเดียวกัน
3. ห้ามข้าม `never`
4. รันคำสั่งตรวจของทุกพื้นที่ที่เกี่ยวข้อง
5. อัปเดต CHANGELOG ส่วน `[Unreleased]` เมื่อผู้ใช้เห็นความเปลี่ยน

บอทนี้คือคำสั่งประจำของ Cursor บน repo นี้ ไม่ใช่โปรเซสที่รันค้างบนเซิร์ฟเวอร์ การดูแลเกิดตอนมีคนหรือ Cursor agent เปิดงานใน repo
