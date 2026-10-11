# ผูกโดเมน (แผน agents-sdk.space) · Binding a custom domain

> **สถานะ: ยังไม่ได้ทำ เป็นแผนเท่านั้น** ห้ามดำเนินการใด ๆ ในหน้านี้โดยไม่ได้รับอนุมัติชัดเจนจากเจ้าของ zone รายละเอียดต้นฉบับอยู่ใน [DEPLOY.md](../DEPLOY.md) หัวข้อ 6

## สถานการณ์ปัจจุบัน

- Worker ทดสอบเสิร์ฟที่ `nvx-stack-builder.agen-sdk-work.workers.dev` เท่านั้น (`workers_dev: true`, ไม่มี `routes`)
- zone `agents-sdk.space` (id `dfb531c381f8e6dd75082a6fe964f71b`) มี apex record `AAAA 100::` แบบ proxied ซึ่งเป็นรูปแบบที่ใช้กับ Worker routes และ Worker ที่มีอยู่ **`agents-sdk-space`** น่าจะเสิร์ฟ apex อยู่ — **ห้ามแตะ** zone นี้, DNS, routes หรือ Worker นั้น
- zone อยู่ในบัญชี `9d56815c97f330febf9d6a0bb7f234d1` ซึ่ง token ปัจจุบันเข้าไม่ถึง (token ปัจจุบันจำกัดที่บัญชี `f70d…e04e`)

## ทางเลือก

| ทางเลือก | ข้อดี | ความเสี่ยง |
|---|---|---|
| **subdomain** เช่น `stack.agents-sdk.space` (แนะนำสำหรับครั้งแรก) | ไม่ชนกับของเดิม ย้อนกลับง่าย | ต้อง deploy Worker ในบัญชีเดียวกับ zone |
| ยึด apex `agents-sdk.space` | URL สั้น | ต้องถอด route/custom domain ของ `agents-sdk-space` ก่อน กระทบระบบเดิม |

## ขั้นตอน (เมื่อได้รับอนุมัติ)

1. ตกลงทางเลือกกับเจ้าของ (subdomain หรือ apex) และบัญชีที่จะ deploy
2. ขอ token ที่รวมบัญชี `9d56…34d1` และสิทธิ์ **Zone: Read**, **Workers Routes: Edit**, **DNS: Edit** สำหรับ zone นั้น (เพิ่มจาก Workers Scripts: Edit, Account Settings: Read)
3. ถ้ายึด apex: ถอด route/custom domain ของ `agents-sdk-space` ก่อน (Dashboard → Workers → agents-sdk-space → Settings → Domains & Routes) ลบ record `AAAA 100::` เฉพาะเมื่อไม่มี route ใดใช้แล้ว เพราะ custom domain จะสร้าง DNS record เองและชนกับ record ชื่อเดียวกัน
4. เพิ่มใน `wrangler.jsonc`:
   ```jsonc
   "routes": [{ "pattern": "stack.agents-sdk.space", "custom_domain": true }]
   ```
   แล้ว `npm run deploy` (หรือเพิ่มผ่าน Dashboard → Worker → Domains & Routes → Add Custom Domain)
5. ตรวจ smoke test บนโดเมนใหม่ ([deploy-cloudflare.md](./deploy-cloudflare.md))
6. (ไม่บังคับ) ตั้ง `workers_dev: false` เมื่อโดเมนใช้งานได้แล้ว

## ข้อควรระวังเรื่อง HSTS

แอปส่ง `Strict-Transport-Security: max-age=31536000; includeSubDomains` ถ้าเสิร์ฟบน **apex** เบราว์เซอร์จะบังคับ HTTPS ให้ **ทุก subdomain** ของ `agents-sdk.space` เป็นเวลาหนึ่งปี ต้องแน่ใจว่าทุก subdomain รองรับ HTTPS ก่อน และ **อย่าเพิ่ม `preload`** จนกว่าจะมั่นใจ ถ้าใช้ subdomain ผลกระทบจำกัดอยู่ที่ subdomain นั้นและลูกของมัน

## Rollback ของโดเมน

ลบ `routes` ออกจาก `wrangler.jsonc` แล้ว deploy ใหม่ หรือลบ custom domain ใน Dashboard ถ้ายึด apex มาจาก `agents-sdk-space` ต้องคืน route ให้ Worker เดิมด้วย — วางแผนขั้นนี้ไว้ก่อนเริ่มเสมอ

## สิ่งที่ AI agent ต้องทำเมื่อถูกขอให้ผูกโดเมน

หยุดและขออนุมัติพร้อมแผนนี้ ระบุ zone, hostname, บัญชี, สิทธิ์ token ที่ต้องใช้ และผลกระทบต่อ Worker เดิม ห้ามดำเนินการเองแม้ token จะมีสิทธิ์
