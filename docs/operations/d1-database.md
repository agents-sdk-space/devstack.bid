# ฐานข้อมูล D1 และ R2 · D1 database & R2

หน้านี้เป็นคู่มือดูแลฐานข้อมูล D1 `nvx-db` ของ DevStack และบันทึกสถานะของ R2 schema อธิบายไว้ที่ [architecture/chat-data-model.md](../architecture/chat-data-model.md) และ [reference/d1-schema.md](../reference/d1-schema.md)

## ทรัพยากรที่มี

| ทรัพยากร | ค่า | สถานะ |
|---|---|---|
| D1 database | `nvx-db`, id `3ee9bbab-06b5-49da-b175-5f7162ad5086`, region WNAM | สร้าง 11 ต.ค. 2026; migration `0001` และ `0002` apply บน remote แล้ว |
| Binding ใน Worker | `DB` (ชนิด `D1Database` ใน `cloudflare-env.d.ts`) | อยู่ใน `wrangler.jsonc`; ยังไม่มีโค้ดใช้ |
| R2 bucket | `nvx-assets`, binding `ASSETS_BUCKET` | **ยังไม่ได้สร้าง**: บัญชียังไม่เปิด R2 |

บัญชี `2d92bd5b25768fa9093d6adc0a8887fc` ใช้ token `CLOUDFLARE_API_TOKEN_EXAMPLESSDK` (มีสิทธิ์ D1 Edit) ส่วน `CLOUDFLARE_API_TOKEN_DEVSTACK` ไม่มีสิทธิ์ D1 และ R2

## คำสั่ง

ทุกคำสั่งที่มี `--remote` เขียนลงฐานข้อมูลจริง จึงต้องได้รับอนุมัติก่อน ส่ง token ผ่าน env ของคำสั่งเท่านั้น ห้ามพิมพ์ออกมา

```bash
# ทดลองบนเครื่อง (สร้างฐานข้อมูลจำลองใน .wrangler/state)
npm run db:migrate:local

# ดูว่า migration ไหนยังไม่ได้ apply บน remote
CLOUDFLARE_API_TOKEN="$CLOUDFLARE_API_TOKEN_EXAMPLESSDK" CLOUDFLARE_ACCOUNT_ID=2d92bd5b25768fa9093d6adc0a8887fc npm run db:migrations:list

# apply บน remote (ต้องอนุมัติ)
CLOUDFLARE_API_TOKEN="$CLOUDFLARE_API_TOKEN_EXAMPLESSDK" CLOUDFLARE_ACCOUNT_ID=2d92bd5b25768fa9093d6adc0a8887fc npm run db:migrate:remote

# query แบบอ่านอย่างเดียว
npx wrangler d1 execute nvx-db --remote --command "select * from schema_meta"
```

## เพิ่ม migration ใหม่

1. สร้างไฟล์ใหม่ใน `migrations/` ตามลำดับเลข เช่น `0003_add_message_index.sql` (หรือใช้ `npx wrangler d1 migrations create nvx-db <name>`) ห้ามแก้ไฟล์ที่ apply แล้ว
2. อัปเดต `schema_version` ใน `schema_meta` ท้ายไฟล์
3. รัน `npm run db:migrate:local` แล้วทดสอบ constraint ที่เกี่ยวข้อง
4. อัปเดต [reference/d1-schema.md](../reference/d1-schema.md) และ [architecture/chat-data-model.md](../architecture/chat-data-model.md) แล้วรัน `npm run docs:check`
5. ขออนุมัติ แล้วรัน `npm run db:migrate:remote` **ก่อน** deploy โค้ดที่ใช้ schema ใหม่

`0006_github_auth.sql` เป็น migration ของการเข้าสู่ระบบ GitHub ยังไม่ถูก apply บน remote จากงานนี้ การเข้าสู่ระบบบน production ใช้ได้หลังได้รับอนุมัติให้ migrate

## สำรองและกู้คืน

D1 มี Time Travel กู้คืนย้อนหลังได้ภายใน 30 วัน (สำหรับแผน Free ได้ 7 วัน) การกู้คืนเขียนทับฐานข้อมูลทั้งก้อน จึงต้องได้รับอนุมัติ:

```bash
npx wrangler d1 time-travel info nvx-db --remote                 # ดู bookmark ปัจจุบัน
npx wrangler d1 time-travel restore nvx-db --timestamp <unix>    # กู้คืน (ต้องอนุมัติ)
npx wrangler d1 export nvx-db --remote --output backup.sql       # export เป็น SQL (อย่า commit ถ้ามีข้อมูลผู้ใช้)
```

การ rollback เวอร์ชัน Worker **ไม่** ย้อน schema ของ D1 ถ้า rollback ไปเวอร์ชันที่ไม่รู้จักตารางใหม่ก็ไม่เป็นไร เพราะ migration ของเราเพิ่มตารางอย่างเดียว

## การเปิด R2 (ต้องให้เจ้าของบัญชีทำ)

ผลตรวจเมื่อ 11 ต.ค. 2026: `GET /accounts/<id>/r2/buckets` ตอบ error `10042` "Please enable R2 through the Cloudflare Dashboard"

1. เจ้าของบัญชีเปิด R2 ใน Cloudflare dashboard (R2 Object Storage) ขั้นนี้ต้องยอมรับเงื่อนไขและการคิดเงิน มี free tier แต่ส่วนเกินจะถูกเรียกเก็บ
2. ให้ token ที่ใช้มีสิทธิ์ **Account › Workers R2 Storage: Edit** (token EXAMPLESSDK ตอนนี้สร้าง D1 ได้ แต่ยังไม่ได้ทดสอบสิทธิ์ R2)
3. สร้าง bucket: `npx wrangler r2 bucket create nvx-assets`
4. เพิ่ม binding ใน `wrangler.jsonc`: `"r2_buckets": [{ "binding": "ASSETS_BUCKET", "bucket_name": "nvx-assets" }]` แล้วรัน `npm run cf:typegen` และเพิ่ม `ASSETS_BUCKET` ในตาราง binding ของ [config-env.md](../reference/config-env.md)
5. bucket ต้อง private (ไม่เปิด public URL หรือ r2.dev) ไฟล์เสิร์ฟผ่าน Worker ที่ตรวจสิทธิ์แล้วเท่านั้น

## ดูเพิ่ม

[env-secrets.md](./env-secrets.md), [deploy-cloudflare.md](./deploy-cloudflare.md), [rollback.md](./rollback.md)
