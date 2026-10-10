# AI agent planner

AI agent ช่วยแปลง "คำอธิบายแอปเป็นภาษาคน" ให้เป็นแผนสแต็ก (`AgentPlan`) ที่โหลดเข้าตัวสร้างได้ทันที หน้านี้อธิบายสามโหมดการทำงาน เหตุผลของการออกแบบ และสิ่งที่ควรรู้เรื่องความเป็นส่วนตัวและค่าใช้จ่าย

## หลักการออกแบบ

AI **ไม่ได้เขียนคำสั่งตั้งค่าหลักเอง** มันเลือกเทมเพลตที่ใกล้ที่สุดจาก catalog (ส่ง `templateId` เป็น enum), เลือก add-on, ตัวจัดการแพ็กเกจ แล้ว *อาจ* เพิ่ม `extraSteps` (0–6 ขั้น) สำหรับงานนอกเทมเพลต เช่น ติดตั้ง database client คำสั่งหลักยังมาจาก composer ซึ่งผ่านการทดสอบแล้ว เหตุผล: ลด hallucination และทำให้ผลลัพธ์ทำซ้ำได้ ส่วนที่มาจาก AI ทั้งหมดผ่าน zod validation และ sanitizer ก่อนถึงหน้าจอ ขั้นตอนที่ซ้ำกับคำสั่งของเทมเพลตจะถูกตัดออก

## สามโหมด

1. **ใช้ key ของเซิร์ฟเวอร์ (Server AI)** ถ้าผู้ดูแลตั้ง `OPENAI_API_KEY` ไว้ ป้ายบนแผงจะแสดง "Server AI: key configured · <model>" (ข้อมูลจาก `GET /api/plan`) คำขอเรียก OpenAI Responses API แบบ Structured Outputs ด้วยโมเดลจาก `OPENAI_MODEL` (ค่าเริ่มต้น `gpt-6.1-sol`) โหมดนี้มี rate limit เข้มกว่า: 5 ครั้งต่อนาทีต่อ IP เพื่อปกป้องบิลของผู้ดูแล
2. **ใช้ key ของตัวเอง (own key)** ติ๊ก "Use my own OpenAI API key" แล้ววาง key key จะถูกส่งไปใน header `x-openai-key` ของคำขอนั้นเท่านั้น เซิร์ฟเวอร์ไม่เก็บ ไม่ log และ redact ออกจากข้อความ error โหมดนี้ไม่ติด AI limiter (ติดเฉพาะ limiter ทั่วไป 20 ครั้งต่อนาที) เพราะใช้เงินของผู้ใช้เอง
3. **Offline planner (rule-based fallback)** กด "Use offline planner" หรือจะถูกใช้อัตโนมัติเมื่อไม่มี key, OpenAI error, timeout หรือผลลัพธ์ไม่ผ่าน validation ตัววางแผนนี้ให้คะแนนเทมเพลตจาก `keywords` (ไทย+อังกฤษ) และคำใบ้ runtime เช่น "python", "fastapi" จับ add-on จากคำ เช่น "docker", "ทดสอบ", "github actions" และดึงชื่อโปรเจกต์จากวลี "called ..." หรือ "ชื่อ ..." ผลลัพธ์ระบุ `source: "fallback"` และ `fallbackReason`

## วิธีเขียน prompt ให้ได้ผลดี

- บอก **ประเภทแอป** + **runtime ที่ต้องการ** + **add-on** เช่น "FastAPI service ที่เรียก OpenAI พร้อม pytest และ Docker ใช้ uv"
- ระบุชื่อโปรเจกต์ด้วยวลี `named my-app` หรือ `ชื่อ my-app`
- ไม่ต้องสั่งให้ AI ทำสิ่งนอกขอบเขต คำสั่งในข้อความผู้ใช้ที่ขัดกับกฎระบบจะถูกเพิกเฉย (prompt injection guard ใน system instructions)
- prompt ยาวได้ไม่เกิน 2,000 ตัวอักษรหลัง sanitize และต้องยาวอย่างน้อย 3 ตัวอักษร

## อ่านผลลัพธ์

แผงผลลัพธ์แสดง: ป้าย *AI plan* หรือ *Rule-based plan (offline)*, เหตุผล fallback, เทมเพลตที่เลือก, คำสั่งตามลำดับ, ขั้นตอนพิเศษจาก agent, ไฟล์เริ่มต้นสำคัญ และ **Safety notes** เช่น "Removed 1 unsafe or invalid command(s)" หรือขั้นที่ต้องตรวจเอง กด **Load into builder** เพื่อโหลดเข้าตัวสร้าง (ไฟล์เริ่มต้นจาก AI จะกลายเป็นขั้น `custom-ai-files`)

## ข้อผิดพลาดที่พบบ่อย

- **429 Too many requests** รอประมาณ 60 วินาที (header `Retry-After: 60`) หรือใช้ offline planner
- แผงขึ้น error state: กด *Try again* หรือ *Use offline planner*
- ได้ fallback ทั้งที่มี key: ดู `fallbackReason` เช่น `OpenAI 401` (key ผิด) หรือ `AI request timed out`

## อ้างอิง

[`src/components/agent-panel.tsx`](../../src/components/agent-panel.tsx), [`src/app/api/plan/route.ts`](../../src/app/api/plan/route.ts), [`src/lib/ai/openai.ts`](../../src/lib/ai/openai.ts), [`src/lib/ai/fallback.ts`](../../src/lib/ai/fallback.ts), [`src/lib/ai/plan.ts`](../../src/lib/ai/plan.ts), API: [reference/api-plan.md](../reference/api-plan.md), สถาปัตยกรรม: [architecture/ai-planner.md](../architecture/ai-planner.md)
