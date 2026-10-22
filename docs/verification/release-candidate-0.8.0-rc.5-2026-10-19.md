# บันทึกตรวจสอบรุ่นเตรียมเผยแพร่ · Release verification record

- **วันที่ปรับปรุง / Updated:** 2026-10-19
- **รุ่น / Version:** `0.8.0-rc.5`
- **Source commit:** `8ab5a454207541d68c6205cb31a957a67740e861` (`fix(builder): copy complete scripts and add platform links`)
- **สถานะ / Status:** source changes verified; production deployment not completed.

## รายการเปลี่ยนแปลง · Changes

- ปุ่มคัดลอกและพรีวิวแสดงสคริปต์ setup เต็มรูปแบบ รวมไฟล์เริ่มต้นของเทมเพลต และไม่รันขั้น dev server, manual หรือ publish โดยอัตโนมัติ
- AI planner ใช้ custom steps ชุดเดียวกับ Builder ทำให้ `starterFiles` ที่สร้างโดย AI อยู่ในสคริปต์พรีวิวด้วย
- เพิ่มลิงก์ภายนอกใน AI planner ไปยัง Expo, Android Studio, Replit และ GitHub Codespaces ลิงก์เหล่านี้เป็นแหล่งข้อมูล/แพลตฟอร์มภายนอก ไม่ใช่เทมเพลตที่ Builder สร้างให้โดยตรง

## ผลตรวจ · Verification

| Check | Result |
| --- | --- |
| `npm test` | ผ่าน 426 tests ใน 40 test files |
| `npm run lint` | ผ่าน; มีคำเตือนเดิมว่าไม่ได้ระบุ React version ใน ESLint plugin settings |
| `npm run typecheck` | ผ่าน |
| `npm run docs:check` | ผ่าน 67 pages |
| `npm run cf:build` | ผ่านจาก isolated checkout ที่มี dependencies ติดตั้งครบ |
| Windows PowerShell execution | ไม่ได้รันจริง เพราะ environment นี้ไม่มี Windows หรือ `pwsh`; มี unit tests ตรวจเนื้อหา PowerShell output |

## สถานะ production · Production status

เจ้าของอนุมัติให้ deploy เมื่อการตรวจผ่านครบแล้ว การตรวจโค้ดผ่านตามรายการข้างต้น แต่การ deploy ยังทำไม่ได้ใน run นี้: ไม่มี `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` ใน environment, Wrangler ไม่ได้เข้าสู่ระบบ และ Cloudflare integration ที่เชื่อมอยู่ใน run นี้มีเฉพาะเครื่องมืออ่านข้อมูล ไม่มีเครื่องมือ deploy

จึง **ไม่มีการเปลี่ยน Worker production, domain, DNS หรือ Cloudflare resource ใด ๆ** และไม่มี Cloudflare version ID ใหม่ ค่า production ล่าสุดที่บันทึกไว้ใน [DEPLOY.md](../DEPLOY.md) คือ `c1c1495f-a371-4ac9-9073-97f9055bf23e` จาก 2026-10-15; ไม่ได้ตรวจยืนยันสถานะ live จาก Cloudflare ในการอัปเดตครั้งนี้

## เครดิต · Credit

การเตรียมโค้ดและการตรวจสอบครั้งนี้ทำผ่าน **Browser Use Cloud** ([cloud.browser-use.com](https://cloud.browser-use.com)). เครดิตนี้หมายถึง workflow ที่ใช้ช่วยพัฒนาและตรวจโค้ดเท่านั้น ไม่ได้หมายความว่า production ถูก deploy จาก Browser Use Cloud; deployment target ของแอปคือ Cloudflare Workers และยังไม่ได้ดำเนินการใน run นี้
