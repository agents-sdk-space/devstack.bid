# เมนูฟังก์ชัน · Platform functions

หน้านี้คือสารบัญฟังก์ชันของ DevStack (NVX Stack Builder) ที่ [devstack.bid](https://devstack.bid) แพลตฟอร์มทั้งชุดสร้างและดูแลโดยบอท [NVX DEVELOPER BOTH](./agents/cursor-caretakers.md) บน Cursor เปิดไฟล์ดิบที่ [devstack.bid/docs/platform.md](https://devstack.bid/docs/platform.md) สารบัญสำหรับเอเจนต์อยู่ที่ [llms.txt](https://devstack.bid/llms.txt)

*EN: This is the function index. NVX DEVELOPER BOTH built the platform and looks after all of it. Raw Markdown is `/docs/platform.md`. Agents start at `/llms.txt`.*

## เอกสารที่เอเจนต์ควรเปิดก่อน

- [ดัชนี Markdown ทุกหน้า](https://devstack.bid/llms.txt) ใช้ค้นว่ามีหน้าไหนก่อนเปิดทีละหน้า
- [รวมทุกหน้า](https://devstack.bid/llms-full.txt) เมื่อต้องการบริบททั้งก้อน
- [คู่มือเอเจนต์](./agents/AGENT-PLAYBOOK.md), [NVX DEVELOPER BOTH](./agents/cursor-caretakers.md), [BUGBOT WEB BOTH](./agents/bugbot-web-caretaker.md) (เว็บ Bugbot บน [implemented.stream](https://implemented.stream) + devstack.bid)
- ไฟล์เครื่องอ่าน [cursor-agents.json](./agents/cursor-agents.json): `agent` = NVX DEVELOPER BOTH, `specialists` = BUGBOT WEB BOTH; `areas` เป็นแผนที่อ่าน

## สร้างสแต็ก

#### Stack Templates

เลือกเทมเพลตที่เรียงคำสั่งแล้วจาก [แคตตาล็อก](https://devstack.bid/templates) รายละเอียดอยู่ใน [templates](./user-guide/templates.md)

#### Builder

จัดลำดับ ใส่ add-on แล้วส่งออก `setup.sh` / `setup.ps1` / zip ที่ [ตัวสร้าง](https://devstack.bid/builder) อ่าน [builder](./user-guide/builder.md)

#### AI planner

อธิบายแอปเป็นไทยหรืออังกฤษ แล้วได้แผนที่โหลดเข้าตัวสร้าง ที่ [ตัวสร้าง](https://devstack.bid/builder) คู่มืออยู่ที่ [AI agent](./user-guide/ai-agent.md) เซิร์ฟเวอร์ไม่รันคำสั่งเหล่านั้น

## แชตและโรงงาน

#### User Chat

แชตฟรีที่ [แชต](https://devstack.bid/chat) เลือกโมเดลรวมถึง Vercel AI Gateway ได้ อ่าน [chat](./user-guide/chat.md)

#### Dev Chat และ Factory

Orchestrator อยู่ที่ [Dev Chat](https://devstack.bid/chat/dev) และ Sandbox Factory อยู่ที่ [Factory](https://devstack.bid/factory) คำสั่งของเอเจนต์รันบนเครื่องผู้ใช้หรือ sandbox ที่ผู้ใช้ถือ key เอง ไม่รันบนเซิร์ฟเวอร์นี้

## บัญชีและการส่งโค้ด

#### เข้าสู่ระบบ

หัวเว็บมีปุ่มเข้าสู่ระบบไปที่ [หน้าเข้าสู่ระบบ](https://devstack.bid/login) สี่วิธี: Cursor, Google, GitHub และบัญชี DevStack (อีเมลกับรหัสผ่าน) ประวัติแชตอยู่กับบัญชีนั้น

#### ส่งไฟล์ขึ้น GitHub

จากคำตอบในแชตที่ลงชื่อด้วย GitHub ส่งได้หนึ่งไฟล์ผ่าน GitHub API เซิร์ฟเวอร์ไม่รันไฟล์นั้น

## สิ่งที่เอเจนต์ห้ามทำเอง

deploy, migrate D1 บน remote, ผูกโดเมน, แก้ DNS, ลบทรัพยากร Cloudflare, commit secret, หรือรันคำสั่งของผู้ใช้บนเซิร์ฟเวอร์ ต้องมีคนอนุมัติก่อน รายละเอียดอยู่ใน [playbook](./agents/AGENT-PLAYBOOK.md) และ [cursor caretakers](./agents/cursor-caretakers.md)
