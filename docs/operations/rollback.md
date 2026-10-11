# Rollback

การ rollback คือการสั่งให้ Cloudflare กลับไปเสิร์ฟ **เวอร์ชันก่อนหน้าของ Worker** ทันที โดยไม่ต้อง build ใหม่ ใช้เมื่อ deploy แล้วพบปัญหาร้ายแรง (หน้าพัง, API error, ความปลอดภัย) คำสั่งต้นฉบับอยู่ใน [DEPLOY.md](../DEPLOY.md) หัวข้อ 5

## หลักการ

- Worker ทุกการ deploy (และทุกการตั้ง secret) สร้าง **version** ใหม่ที่มี id
- **secret และ vars ผูกกับเวอร์ชัน** rollback จึงคืนทั้งโค้ดและ binding ของเวอร์ชันนั้น ถ้าเพิ่งหมุน key แล้ว rollback ไปเวอร์ชันก่อนหมุน Worker จะใช้ key เก่า (ซึ่งอาจถูก revoke แล้ว) — ให้ตั้ง secret ใหม่หลัง rollback ถ้าจำเป็น
- rollback เป็นการกระทำกับ production ต้องได้รับอนุมัติจากมนุษย์ (ยกเว้นมีนโยบายฉุกเฉินที่เจ้าของกำหนดไว้ล่วงหน้า)

## เป้าหมาย rollback ที่บันทึกไว้

**TEST deploy v0.5.0 (ปัจจุบัน):** https://nvx-stack-builder.space6.workers.dev, บัญชี `2d92bd5b25768fa9093d6adc0a8887fc`

| เวอร์ชัน | id | หมายเหตุ |
|---|---|---|
| ปัจจุบัน | `d369f2b6-863a-4e44-8f9e-b5551e18361a` | โค้ด v0.5.0 + secret `OPENAI_API_KEY` |
| ก่อนหน้า | `107ab78e-2cdd-4159-95e7-e8fcb89130aa` | โค้ดเดียวกัน ก่อนตั้ง secret (AI agent จะใช้ offline planner) |

บัญชีนี้ไม่มีเวอร์ชันเก่ากว่านี้ ถ้าต้องกลับไปใช้ดีไซน์ v0.3.0 ให้ใช้ deploy เดิมที่ยังเปิดอยู่ (ด้านล่าง) หรือ build tag `v0.3.0` แล้ว deploy ใหม่ (ต้องได้รับอนุมัติ)

**TEST deploy v0.3.0 (เดิม ไม่ถูกแก้ไข):** https://nvx-stack-builder.agen-sdk-work.workers.dev, บัญชี `f70d35188a3c56b9781538c73a86e04e`

| เวอร์ชัน | id | หมายเหตุ |
|---|---|---|
| ปัจจุบัน | `0fb9ecd4-d788-468c-8843-559545c357e3` | รวม IPv6 /64 rate-limit key |
| ก่อนหน้า | `9b9b678a-f0b4-4727-96d7-e5f81fc00391` | ก่อนแก้ IPv6 |

เมื่อ deploy เวอร์ชันใหม่ ให้บันทึก id ใหม่ไว้ใน DEPLOY.md, CHANGELOG และหน้านี้

## ขั้นตอน

```bash
export CLOUDFLARE_ACCOUNT_ID=2d92bd5b25768fa9093d6adc0a8887fc   # v0.5.0; ใช้ f70d35188a3c56b9781538c73a86e04e สำหรับ deploy v0.3.0 เดิม
# 1) ดูรายการเวอร์ชัน
npx wrangler deployments list --name nvx-stack-builder
# 2) rollback ไปเวอร์ชันที่ต้องการ พร้อมเหตุผล
npx wrangler rollback <version-id> --name nvx-stack-builder -m "reason: <อธิบาย>"
# 3) smoke test ตาม deploy-cloudflare.md
```

ทางเลือกสุดท้าย (หยุดเสิร์ฟ Worker ทดสอบทั้งหมด): `npx wrangler delete --name nvx-stack-builder` — ลบเฉพาะ Worker นี้ ห้ามใช้กับ Worker อื่น และต้องได้รับอนุมัติชัดเจน เพราะย้อนกลับไม่ได้ (ต้อง deploy ใหม่)

## Rollback ฝั่งโค้ด (git)

- rollback บน Cloudflare ไม่เปลี่ยน git ให้เปิด branch แก้ไข หรือ `git revert <commit>` บน branch แล้ว deploy ใหม่ตามขั้นตอนปกติ
- ห้าม `git reset --hard` หรือ force-push บน branch ที่แชร์ โดยไม่ได้รับอนุมัติ
- tag ที่ deploy แล้ว (`v0.5.0`, `v0.3.0`) ใช้ build ซ้ำได้ เช่น `git checkout v0.3.0 && npm ci && npm run deploy`

## Checklist หลัง rollback

- [ ] หน้า `/`, `/templates`, `/builder`, `/design` ได้ 200 และ `/templates/x` ได้ 404
- [ ] `GET /api/plan` → `serverKeyConfigured` ตามที่คาด
- [ ] headers ความปลอดภัยครบ
- [ ] บันทึกเหตุการณ์ (เวลา UTC+7, เวอร์ชันจาก → ไป, สาเหตุ) ใน CHANGELOG หรือ incident note
- [ ] เปิด issue/branch แก้ต้นเหตุก่อน deploy ใหม่
