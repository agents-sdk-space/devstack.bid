# กระบวนการออกรุ่น · Release process

กระบวนการนี้สรุปจากการออกรุ่นจริง v0.1.0–v0.3.0 (ดู [SUBSYSTEM-HISTORY.md](../history/SUBSYSTEM-HISTORY.md)) และใช้ Semantic Versioning + [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)

## รูปแบบ branch และ commit

- งานแต่ละชุดทำบน feature branch: `feat/ui-framework` (v0.2.0), `feat/cloudflare-production` (v0.3.0), `feat/terminal-theme` (v0.4–v0.5)
- commit แบบ Conventional Commits: `feat:`, `fix:`, `style:`, `docs:`, `test:`, `build:`, `chore(deps):`, `chore(release):`/`release:`, `refactor:`
- แยก commit ตามเหตุผล (เช่น deps → tokens → components → tests → docs) เพื่อให้ review และ revert ได้ทีละส่วน
- merge เข้า `main` แบบ merge commit (`--no-ff`) เช่น `1c5aca8`, `510048b` แล้วติด tag ที่ merge commit

## ขั้นตอนออกรุ่น

1. **ตรวจครบ**: `npm run lint && npm run typecheck && npm test && npm run docs:check && npm run cf:build`
2. **ทดสอบในเบราว์เซอร์** บน `npm run preview` และเก็บภาพหน้าจอใน `screenshots/v<x.y>/`
3. **CHANGELOG**: ย้ายรายการจาก `[Unreleased]` ไปหัวข้อ `[x.y.z] - YYYY-MM-DD` แยก Added / Changed / Fixed / Removed และอัปเดตลิงก์เปรียบเทียบท้ายไฟล์
4. **version**: แก้ `"version"` ใน `package.json` (และ lockfile ด้วย `npm install --package-lock-only`)
5. **เอกสาร**: อัปเดต README (ภาพหน้าจอ), DEPLOY.md (สถานะ), [SUBSYSTEM-HISTORY.md](../history/SUBSYSTEM-HISTORY.md) (แถวใหม่ต่อ subsystem), `platform-manifest.json` ถ้า subsystem/คำสั่ง/env เปลี่ยน
6. commit `chore(release): x.y.z`
7. **ขออนุมัติ** merge เข้า `main` จากเจ้าของ แล้ว `git merge --no-ff` + `git tag -a vX.Y.Z -m "<สรุป>"`
8. **deploy (ถ้าได้รับอนุมัติแยก)** ตาม [deploy-cloudflare.md](../operations/deploy-cloudflare.md) บันทึก version id
9. **push (ถ้าได้รับอนุมัติแยก)** `git push origin main --tags`

## สิ่งที่ต้องได้รับอนุมัติจากมนุษย์เสมอ

merge เข้า `main`, deploy, push, การผูกโดเมน, การลบ resource ใด ๆ, การเปลี่ยน layout/โครงสร้างหน้า การอนุมัติหนึ่งเรื่องไม่ครอบคลุมเรื่องอื่น (เช่น อนุมัติ deploy ไม่ได้แปลว่าอนุมัติ push)

## สถานะปัจจุบัน

- `main` = `v0.5.0` (tag `v0.5.0` บน release commit หลัง merge `61445c5` ของ `feat/terminal-theme`) และ deploy เป็น TEST ที่ `https://nvx-stack-builder.space6.workers.dev` แล้ว
- v0.4 ไม่ถูกออกเป็นรุ่นแยก เพราะ v0.5 แทนที่ดีไซน์ v0.4 ทั้งหมด
- deploy v0.3.0 เดิม (`agen-sdk-work.workers.dev`) ยังเปิดอยู่และไม่ถูกแก้ไข

## Hotfix

แตก branch จาก tag ล่าสุดที่ deploy (`git switch -c fix/<เรื่อง> v0.5.0`), แก้ + test, ออก `v0.5.1` ตามขั้นตอนเดียวกัน แล้ว merge กลับเข้า feature branch ที่ค้างอยู่ ถ้าเร่งด่วนมากให้ [rollback](../operations/rollback.md) ก่อนแล้วค่อยแก้
