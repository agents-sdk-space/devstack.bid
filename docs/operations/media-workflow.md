# เวิร์กโฟลว์ไฟล์และอีเมล · Media lifecycle workflow

DevStack มีคลาส Workflow ชื่อ `MediaLifecycleWorkflow` สำหรับงานที่ต้องทำซ้ำได้และหยุดกลางทางได้ สองงานนี้อยู่ในคลาสเดียวกัน เพราะทั้งคู่เป็นขั้นตอนยาวที่ห้ามทำซ้ำแบบมั่วเมื่อคำขอล้มกลางคัน

1. **ไฟล์ที่อัปโหลดเข้า R2** หลัง `POST /api/chat/attachments` เก็บวัตถุที่ `u/<userId>/pending/<id>` แล้ว ถ้า binding พร้อม Worker จะเริ่มอินสแตนซ์ให้เอง ผู้ใช้ไม่ต้องกดทำงานซ้ำ งานจะอ่านวัตถุ เป็นข้อความ ฝังด้วย Workers AI แล้ว upsert ลง Vectorize
2. **อีเมลตามวงจรชีวิตบัญชี** เมื่อสร้างบัญชีใหม่ (รหัสผ่าน, Google, GitHub หรือ Cursor) งานจะส่งจดหมายต้อนรับ รอช่วงที่กำหนด แล้วส่งจดหมายเตือนเฉพาะเมื่อผู้ใช้ยังไม่กลับมาเปิดแชต

เซิร์ฟเวอร์ไม่รันเนื้อไฟล์เป็นคำสั่ง ไบต์ถูกอ่านเป็นข้อความสำหรับ embedding เท่านั้น รูปภาพถูกเก็บใน R2 แต่ไม่ถูกฝัง เพราะดัชนีนี้รับข้อความ โมเดลคือ `@cf/baai/bge-m3` (1024 มิติ, cosine) ซึ่งใช้ได้ทั้งภาษาไทยและอังกฤษ

*EN: one Workflow class indexes an R2 upload into Vectorize, or sends a welcome email and a later inactivity note. Uploaded bytes are never executed.*

## สิ่งที่โค้ดทำวันนี้

| ไฟล์ | หน้าที่ |
|---|---|
| [`src/workflows/media-lifecycle.ts`](../../src/workflows/media-lifecycle.ts) | คลาสที่ Wrangler ลงทะเบียน ชื่อ `MediaLifecycleWorkflow` |
| [`src/lib/workflows/run.ts`](../../src/lib/workflows/run.ts) | ลำดับขั้น: อ่านวัตถุ, ฝัง, upsert, ส่งจดหมาย, รอ, ตรวจว่าผู้ใช้กลับมา |
| [`src/lib/workflows/trigger.ts`](../../src/lib/workflows/trigger.ts) | เริ่มอินสแตนซ์เมื่อ binding ครบ ถ้าไม่ครบจะไม่สร้างงาน |
| [`src/lib/workflows/schedule.ts`](../../src/lib/workflows/schedule.ts) | เรียกจากเส้นทางสมัครบัญชี |
| [`migrations/0008_media_workflow.sql`](../../migrations/0008_media_workflow.sql) | ตาราง `upload_objects` และ `lifecycle_mail` |

`scripts/patch-opennext-worker.mjs` ถูกเรียกท้าย `cf:build`, `preview` และ `deploy` เพื่อ export คลาสจาก `.open-next/worker.js` จนกว่าจะมี binding ใน `wrangler.jsonc` คลาสนี้ยังไม่ถูกสร้างเป็น resource บนบัญชี

รหัสอินสแตนซ์คงที่: `upload_<attachmentId>` และ `life_<userId>_welcome` การอัปโหลดซ้ำหรือการเข้าสู่ระบบซ้ำจึงไม่เปิดงานที่สอง จดหมายส่งถึงอีเมลในตาราง `users` เท่านั้น ไม่ใช้ที่อยู่ที่ไคลเอนต์ส่งมา ผู้ส่งต้องเป็นที่อยู่ `@devstack.bid`

## สิ่งที่ยังไม่ถูกสร้าง (ต้องให้เจ้าของบัญชีอนุมัติ)

การใส่ binding ต่อไปนี้ใน `wrangler.jsonc` วันนี้จะทำให้ deploy ล้ม หรือไปสร้างทรัพยากรที่คิดเงินได้ อย่าเพิ่มจนกว่าเจ้าของบัญชีจะทำขั้นด้านล่างเอง R2 บนบัญชีนี้ยังไม่เปิด (API error 10042 เมื่อ 11 ต.ค. 2026) Email Sending อยู่ในแผน Workers แบบเสียเงิน Vectorize และ Workflow ก็เป็นทรัพยากรใหม่

1. เปิด R2 ใน dashboard แล้วยอมรับเงื่อนไขการคิดเงิน สร้าง bucket ส่วนตัว `nvx-assets` (`npx wrangler r2 bucket create nvx-assets`) ห้ามเปิด public URL
2. สร้างดัชนี Vectorize ให้ตรงกับโมเดล: `npx wrangler vectorize create nvx-uploads --dimensions=1024 --metric=cosine`
3. นำโดเมน `devstack.bid` เข้า Email Sending และใส่เรคคอร์ด SPF/DKIM ที่ Cloudflare ให้มา ผู้ส่งที่ใช้ในโค้ดคือ `noreply@devstack.bid`
4. Apply migration บน D1 จริงด้วย `npm run db:migrate:remote` หลังได้รับอนุมัติ ทดสอบบนเครื่องด้วย `npm run db:migrate:local` ได้เลย
5. เติม config นี้ใน `wrangler.jsonc` แล้วรัน `npm run cf:typegen` และ deploy เฉพาะเมื่อได้รับอนุมัติแยกจากการอนุมัติข้อ 1–4

```jsonc
"workflows": [
  { "name": "nvx-media-lifecycle", "binding": "MEDIA_WORKFLOW", "class_name": "MediaLifecycleWorkflow" }
],
"r2_buckets": [
  { "binding": "ASSETS_BUCKET", "bucket_name": "nvx-assets" }
],
"vectorize": [
  { "binding": "VECTORIZE", "index_name": "nvx-uploads" }
],
"send_email": [
  { "name": "EMAIL", "allowed_sender_addresses": ["noreply@devstack.bid"] }
],
"vars": {
  "EMAIL_FROM": "DevStack <noreply@devstack.bid>",
  "LIFECYCLE_FOLLOWUP": "7 days"
}
```

`EMAIL_FROM` ที่ไม่ใช่โดเมน `devstack.bid` ถูกเมิน และระยะรอที่ไม่เข้าแพตเทิร์น `1-99` ตามด้วย `seconds|minutes|hours|days|weeks` จะกลับไปเป็น `7 days` ตัวแปรสองตัวนี้ยังไม่ถูกใส่ใน config จริง

ก่อนเปิด binding ของอีเมล อย่ารันด้วย `remote: true` ในการพัฒนา เพราะค่านั้นส่งจดหมายจริง ระหว่างที่ binding ยังไม่มี เส้นทางอัปโหลดยังตอบ `503 uploads_disabled` และเส้นทางสมัครบัญชียังทำงานตามเดิมโดยไม่ส่งจดหมาย

## พฤติกรรมของงาน

งานอัปโหลดบันทึกแถว `upload_objects` สถานะ `stored` แล้วอ่านวัตถุ ไฟล์ข้อความ, Markdown, CSV และ JSON ถูกตัดเป็นชิ้นละ 1,200 ตัวอักษร ไม่เกิน 32 ชิ้น PDF ที่ดึงข้อความตัวอักษรออกมาได้จะถูกฝัง PDF ที่เป็นภาพอย่างเดียวและไฟล์รูปถูกข้ามด้วยสถานะ `skipped` เวกเตอร์ใช้ id `<attachmentId>:<chunk>` และ metadata `userId`, `attachmentId`, `chunk`, `mime` ยังไม่มี API ค้นกลับ เพื่อไม่ให้เปิดทางอ่านเอกสารของคนอื่นก่อนมีตัวกรองตาม `userId`

งานอีเมลเขียนแถว `pending` ใน `lifecycle_mail` ก่อนส่ง และเปลี่ยนเป็น `sent` หลังได้ `messageId` อินสแตนซ์ที่สองจึงไม่ส่งซ้ำ ถ้าขั้นส่งเองถูกเล่นซ้ำหลังเซิร์ฟเวอร์รับจดหมายแล้วแต่ยังไม่ทันบันทึกผล จดหมายฉบับนั้นอาจออกซ้ำหนึ่งครั้ง จากนั้น `step.sleep` ตาม `LIFECYCLE_FOLLOWUP` ถ้า `conversations.updated_at` ใหม่กว่าเวลาเริ่มงาน จะไม่ส่งจดหมายเตือน เนื้อจดหมายเป็นภาษาไทยและอังกฤษในฉบับเดียวกัน และเป็นจดหมายธุรกรรม ไม่ใช่จดหมายการตลาด

ดู schema ที่ [d1-schema.md](../reference/d1-schema.md) และสถานะ R2 ที่ [d1-database.md](./d1-database.md)
