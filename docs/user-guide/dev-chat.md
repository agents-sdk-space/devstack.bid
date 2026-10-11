# Dev Chat

หน้า [`/chat/dev`](https://devstack.bid/chat/dev) สำหรับนักพัฒนา เราให้คุณคุยกับ **Image and Research Orchestrator** agent ที่สร้างด้วย OpenAI Agents API มันทำงานร่วมกับ subagent ผู้เชี่ยวชาญ ค้นคว้าเอกสาร Agents SDK และเอกสาร DevStack, เขียนและรันโค้ดใน sandbox Linux จริง, วางแผนเว็บไซต์ AI agent และสร้างภาพ

## แผง Sandbox

ด้านขวา (มือถือคือแท็บ "Sandbox") แสดงสิ่งที่ agent กำลังทำแบบสด: สถานะ sandbox, คำสั่งที่รัน, subagent ที่ถูกเรียก, การค้นเอกสาร, ไฟล์ที่สร้าง และ token ที่ใช้ เรารัน sandbox บน OpenAI-hosted environment (`openai_hosted`, ขนาด small) แต่ละแชตใช้ session เดิมต่อเนื่อง

## โควตา

- **5 turn ต่อวัน** ต่อเบราว์เซอร์ และ **30 turn ต่อวันรวมทั้งเว็บ** รีเซ็ตเที่ยงคืนเวลาไทย
- ภาพจาก agent: 2 ภาพต่อคนต่อวัน (20 รวมทั้งเว็บ)
- งบรวมต่อวัน $1 (ประมาณจาก usage) ถ้าเกิน agent จะพักจนถึงวันถัดไป

เราตั้งเพดานต่ำเพราะ turn ของ agent ใช้ token มาก (turn ง่ายๆ ราว 50–70k input token ส่วนใหญ่เป็น cache) ถ้าครบโควตา ใช้ OpenAI key ของตัวเองใน [Sandbox Factory](./sandbox-factory.md) หรือกลับไปคุยใน [User Chat](./chat.md)

## เขียนคำสั่งให้ได้ผล

- บอกให้ชัดว่าต้องการให้ "รันใน sandbox" และอยากเห็นผลแบบไหน
- ถามเรื่อง Agents SDK หรือ DevStack ได้ agent จะค้นเอกสารและใส่ลิงก์อ้างอิง
- ขอภาพได้ แต่ภาพนับโควตาแยก

## สิ่งที่ควรรู้

- คำตอบเป็น Markdown แบบปลอดภัย (ลิงก์ http(s) เท่านั้น รูปภาพเฉพาะจากเซิร์ฟเวอร์เรา)
- ไฟล์ใน sandbox ดาวน์โหลดได้จากแผง Sandbox เมื่อ agent สร้างไฟล์
- ประวัติ Dev Chat แยกจาก User Chat (คอลัมน์ `channel = 'dev'`)
