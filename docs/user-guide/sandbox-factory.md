# Sandbox Factory (ใช้ key ของตัวเอง)

หน้า [`/factory`](https://devstack.bid/factory) ให้คุณสร้าง agent และ sandbox ของตัวเองบนบัญชี OpenAI ของคุณ แล้วคุยกับมันผ่านหน้าแชตเดียวกับ Dev Chat เราไม่คิดโควตาวันละกี่ครั้ง เพราะคุณจ่ายเอง เหลือเพียงเพดานกันสแปม

## key ของคุณ

- วาง OpenAI API key ในช่องด้านบน key ถูกส่งไปกับแต่ละคำขอใน header `x-openai-key` เท่านั้น เซิร์ฟเวอร์ของเรา **ไม่เก็บและไม่ log**
- ติ๊ก "จำไว้ในแท็บนี้" ถ้าอยากให้เบราว์เซอร์จำไว้ใน `sessionStorage` (หายเมื่อปิดแท็บ)
- key ต้องมีสิทธิ์ `api.agents.read`, `api.agents.write`, `api.responses.write`

## ตั้งค่า

1. **Template**: Orchestrator (ชุด subagent และเครื่องมือเหมือน Dev Chat) หรือ Blank (agent เปล่าพร้อม sandbox)
2. **Model**: `gpt-6.1-sol` (ค่าเริ่มต้น), `gpt-6-astra`, `gpt-6-luna`
3. **Environment**:
   - **OpenAI-hosted** (ค่าเริ่มต้น): OpenAI รัน sandbox ให้ ใช้ได้ทันที
   - **Self-hosted**: sandbox รันบนเครื่องของคุณ เราจะแสดง environment id, remote URL และคำสั่งพร้อมคัดลอก:

     ```bash
     CODEX_API_KEY='<your-environment-key>' codex exec-server --remote '<remote_url>' --environment-id '<id>'
     ```

     แทน `<your-environment-key>` ด้วย environment key ของคุณ (เราไม่ใส่ key ลงในคำสั่ง) หน้าเว็บจะแสดงสถานะ pending → connected (หรือ failed) และมีปุ่มเฝ้าดูอีกครั้ง

## เพดานกันสแปม

session ใหม่ 10 ต่อชั่วโมง, 60 turn ต่อชั่วโมง และ 10 คำขอต่อนาที ต่อ IP

## ข้อจำกัด

- ไฟล์ที่ agent สร้างใน Factory ยังดาวน์โหลดผ่านเราไม่ได้ (ดูได้ในบัญชี OpenAI ของคุณ)
- ข้อความแจ้งเตือนจาก OpenAI (key ผิด, สิทธิ์ไม่พอ, เครดิตหมด) แปลเป็นข้อความไทย/อังกฤษให้อ่านง่าย
