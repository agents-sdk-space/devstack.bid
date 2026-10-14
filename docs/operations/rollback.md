# Rollback

การ rollback คือการสั่งให้ Cloudflare กลับไปเสิร์ฟ **เวอร์ชันก่อนหน้าของ Worker** ทันที โดยไม่ต้อง build ใหม่ ใช้เมื่อ deploy แล้วพบปัญหาร้ายแรง (หน้าพัง, API error, ความปลอดภัย) คำสั่งต้นฉบับอยู่ใน [DEPLOY.md](../DEPLOY.md) หัวข้อ 5

## หลักการ

- Worker ทุกการ deploy (และทุกการตั้ง secret) สร้าง **version** ใหม่ที่มี id
- **secret และ vars ผูกกับเวอร์ชัน** rollback จึงคืนทั้งโค้ดและ binding ของเวอร์ชันนั้น ถ้าเพิ่งหมุน key แล้ว rollback ไปเวอร์ชันก่อนหมุน Worker จะใช้ key เก่า (ซึ่งอาจถูก revoke แล้ว) — ให้ตั้ง secret ใหม่หลัง rollback ถ้าจำเป็น
- rollback เป็นการกระทำกับ production ต้องได้รับอนุมัติจากมนุษย์ (ยกเว้นมีนโยบายฉุกเฉินที่เจ้าของกำหนดไว้ล่วงหน้า)

## เป้าหมาย rollback ที่บันทึกไว้

**Production (ปัจจุบัน):** https://devstack.bid (+ `www.devstack.bid`), workers.dev สำรอง workers.dev URL redacted บัญชี `[account ID redacted]`

| เวอร์ชัน | id | หมายเหตุ |
|---|---|---|
| ปัจจุบัน | `[deployment ID redacted]` | 2026-10-14: โค้ดชุดเข้าสู่ระบบเดิม พร้อม secret GitHub, Google และ AI Gateway |
| ก่อนหน้า (rollback แรก) | `[deployment ID redacted]` | โค้ดเดียวกันก่อนตั้ง secret ชุดนี้ การย้อนมาที่นี่จะเอา secret OAuth ออก |
| ก่อนหน้า | `[deployment ID redacted]` | v0.7.0 ก่อนชุดเข้าสู่ระบบ |
| ก่อนหน้า | `[deployment ID redacted]` | v0.6.0 + D1 binding `DB` |
| ก่อนหน้า | `[deployment ID redacted]` | v0.6.0 (tag `v0.6.0`): docs ในแอป `/docs`, raw `.md`, `/llms.txt`, signature |
| ก่อนหน้า | `[deployment ID redacted]` | v0.5.1: metadata ชี้ devstack.bid, HSTS ไม่มี includeSubDomains, redirect www → apex |
| ก่อนหน้านั้น | `[deployment ID redacted]` | v0.5.0 + secret (ถ้าย้อนมา: HSTS กลับเป็น includeSubDomains และ OG ชี้ previous subdomain redacted ซึ่งใช้ไม่ได้แล้ว) |
| เก่ากว่า | `[deployment ID redacted]` | v0.5.0 ก่อนตั้ง secret (AI agent จะใช้ offline planner) |

rollback เวอร์ชันไม่ถอด custom domain โดเมนยังชี้ Worker เดิม (ดู [custom-domain.md](./custom-domain.md))

บัญชีนี้ไม่มีเวอร์ชันเก่ากว่านี้ ถ้าต้องกลับไปใช้ดีไซน์ v0.3.0 ให้ใช้ deploy เดิมที่ยังเปิดอยู่ (ด้านล่าง) หรือ build tag `v0.3.0` แล้ว deploy ใหม่ (ต้องได้รับอนุมัติ)

**TEST deploy v0.3.0 (เดิม ไม่ถูกแก้ไข):** workers.dev URL redacted บัญชี `[account ID redacted]`

| เวอร์ชัน | id | หมายเหตุ |
|---|---|---|
| ปัจจุบัน | `[deployment ID redacted]` | รวม IPv6 /64 rate-limit key |
| ก่อนหน้า | `[deployment ID redacted]` | ก่อนแก้ IPv6 |

เมื่อ deploy เวอร์ชันใหม่ ให้บันทึก id ใหม่ไว้ใน DEPLOY.md, CHANGELOG และหน้านี้

## ขั้นตอน

```bash
export CLOUDFLARE_ACCOUNT_ID=YOUR_ACCOUNT_ID   # v0.5.0; ใช้ [account ID redacted] สำหรับ deploy v0.3.0 เดิม
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
