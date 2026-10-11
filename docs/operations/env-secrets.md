# ตัวแปรสภาพแวดล้อมและ secret · Environment & secrets

ตารางอ้างอิงเต็มอยู่ที่ [reference/config-env.md](../reference/config-env.md) หน้านี้เน้น "วิธีจัดการอย่างปลอดภัย" และเหตุผล

## หลักการ

1. **secret มีตัวเดียว: `OPENAI_API_KEY`** ที่เหลือเป็น config ธรรมดา (`vars`)
2. secret ถูกอ่านใน [`src/lib/server/env.ts`](../../src/lib/server/env.ts) ที่เดียว (ไฟล์มี `import "server-only"` กันการ import จาก client) ไม่ถูก log ไม่ถูกส่งกลับ client — `GET /api/plan` คืนแค่ boolean `serverKeyConfigured`
3. **ห้าม commit** `.env.local`, `.dev.vars` (อยู่ใน `.gitignore`) commit ได้เฉพาะไฟล์ตัวอย่าง `.env.example`, `.dev.vars.example` ที่ค่าว่าง
4. ค่าที่ไม่ถูกต้องไม่ทำให้ระบบล่ม: ใช้ค่าเริ่มต้นและ log เฉพาะชื่อตัวแปร

## ตั้งค่าแต่ละสภาพแวดล้อม

| สภาพแวดล้อม | ที่เก็บ | หมายเหตุ |
|---|---|---|
| `next dev` / `next start` | `.env.local` | Next โหลดอัตโนมัติ |
| `npm run preview` (wrangler) | `.dev.vars` | ไฟล์ควรมีสิทธิ์ 600 |
| Cloudflare production | Worker secret + `vars` ใน `wrangler.jsonc` | ตั้ง secret ผ่าน stdin |

### ตั้ง secret บน Cloudflare (ผ่าน stdin เท่านั้น)

```bash
printenv OPENAI_API_KEY | npx wrangler secret put OPENAI_API_KEY
```

เหตุผล: การพิมพ์ key เป็น argument จะติดใน shell history และ process list การส่งผ่าน stdin ไม่ทิ้งร่องรอย secret ผูกกับเวอร์ชันของ Worker การ rollback จะคืน binding ของเวอร์ชันนั้นด้วย

### Cloudflare API token

- ใช้ token แบบ account-scoped สิทธิ์ขั้นต่ำ: **Workers Scripts: Edit**, **Account Settings: Read** (ดู [DEPLOY.md](../DEPLOY.md) หัวข้อ 7); ถ้าใช้ `wrangler d1` ต้องเพิ่ม **D1: Edit** และสำหรับ R2 ต้องเพิ่ม **Workers R2 Storage: Edit** (ดู [d1-database.md](./d1-database.md))
- ส่งเป็นตัวแปร `CLOUDFLARE_API_TOKEN` เฉพาะคำสั่งที่ต้องใช้ ห้ามพิมพ์ค่าออกหน้าจอ ห้ามเขียนลงไฟล์ใน repo
- ถ้าตัวแปรมีข้อความอื่นปนมา (เช่นวางทั้งหน้าเว็บ) ให้ดึงเฉพาะ token ใน process โดยไม่ echo

## key ของผู้ใช้ (BYO key)

ผู้ใช้วาง key ของตัวเองใน UI ได้ key ไปใน header `x-openai-key` ของคำขอเดียว ต้องตรงรูปแบบ `^[\w-]{20,400}$` ใช้แทน key ของเซิร์ฟเวอร์ ไม่ติด AI limiter ไม่ถูกเก็บหรือ log และถูก redact ออกจาก error ทุกข้อความ

## การหมุน key (rotation)

1. สร้าง key ใหม่ใน OpenAI dashboard (สิทธิ์ที่ต้องใช้: Responses API, `api.responses.write`)
2. `printenv NEW_KEY | npx wrangler secret put OPENAI_API_KEY` (สร้างเวอร์ชันใหม่ของ Worker)
3. ตรวจ `curl -s https://<worker>/api/plan` → `serverKeyConfigured: true` และลอง POST หนึ่งครั้ง
4. revoke key เก่า

## เมื่อสงสัยว่า secret รั่ว

revoke ที่ต้นทางทันที (OpenAI / Cloudflare) แล้วตั้งค่าใหม่ ตรวจ git history ว่าไม่มีไฟล์ secret ถูก commit (`git log --all -- .dev.vars .env.local` ต้องว่าง)
