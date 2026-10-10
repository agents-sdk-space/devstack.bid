# โมเดลความปลอดภัย · Safety model

NVX Stack Builder จัดการกับ "คำสั่ง shell" ซึ่งเป็นข้อมูลอันตรายโดยธรรมชาติ หน้านี้อธิบายหลักการ ชั้นป้องกัน และขอบเขตของสิ่งที่ระบบป้องกันได้และไม่ได้

## หลักการข้อที่ 1: ไม่รันคำสั่งเด็ดขาด (text-only)

เซิร์ฟเวอร์ **ไม่มีโค้ดเส้นทางใด** ที่ execute คำสั่ง ไม่มี `child_process`, ไม่มี sandbox รันโค้ด คำสั่งทั้งหมดเป็นสตริงที่แสดงผลและส่งออกเป็นไฟล์ให้ผู้ใช้ตรวจและรันเอง นี่คือกฎที่ระบุใน [CONTRIBUTING.md](../../CONTRIBUTING.md) และต้องคงไว้ตลอด เพราะถ้าเซิร์ฟเวอร์รันคำสั่งได้ ทุกช่องโหว่ใน sanitizer จะกลายเป็น remote code execution ทันที

## หลักการข้อที่ 2: ข้อมูลภายนอกไม่น่าเชื่อถือทั้งหมด

แหล่งที่ไม่น่าเชื่อถือมีสามแหล่ง: **ผลลัพธ์จาก AI**, **ลิงก์แชร์**, และ **ขั้นตอนที่ผู้ใช้พิมพ์เอง** ทั้งหมดผ่าน [`src/lib/sanitize.ts`](../../src/lib/sanitize.ts) ก่อนแสดงผล

### ชั้นของ sanitizer

| ฟังก์ชัน | ทำอะไร |
|---|---|
| `cleanText` | ตัด ANSI escape และ control characters, trim, จำกัดความยาว (ข้อความ 1,200 ตัวอักษร) |
| `cleanCommand` | บังคับบรรทัดเดียว, จำกัด 400 ตัวอักษร, **ทิ้ง** คำสั่งที่อยู่ในรายการ BLOCKED |
| `cleanPath` | ต้องเป็น path สัมพัทธ์ ไม่มี `..` ไม่ขึ้นต้นด้วย `/` หรือ `C:` และอักขระอยู่ในชุดที่อนุญาต |
| `cleanFile` | ไฟล์ ≤ 12,000 ตัวอักษร, ปฏิเสธเนื้อหาที่มีบรรทัด `NVX_EOF` หรือ `'@` (กันการหลุดจาก heredoc/here-string) |
| `sanitizeStep` | รวมทุกอย่าง: ≤ 12 คำสั่ง, ≤ 8 ไฟล์, ต้องมีชื่อ และต้องมีคำสั่งหรือไฟล์อย่างน้อยหนึ่ง |

**BLOCKED (ทิ้งทั้งคำสั่ง):** `rm -rf /`, `~`, `$HOME`, `*`; `sudo rm`; `mkfs`; `dd if=`; fork bomb; `shutdown/reboot/halt/poweroff`; `chmod 777 /`; เขียนทับ `/dev/sd*`; `format C:`; `Remove-Item -Recurse` ที่ราก; `del /s` ที่ไดรฟ์

**RISKY (เก็บไว้แต่เปลี่ยนเป็น manual):** `curl|wget|iwr ... | sh/bash/python/node/iex`, `sudo`, `eval`, `npm/pnpm/yarn publish`, `twine upload`, `git push --force` ขั้นชนิด manual จะถูกคอมเมนต์ใน `setup.sh`/`setup.ps1` และ AI plan จะแสดง safety note

## หลักการข้อที่ 3: มนุษย์ตัดสินใจขั้นที่ย้อนกลับไม่ได้

ขั้นชนิด `longRunning`, `publish`, `manual` **ไม่ถูกรันอัตโนมัติ** ในสคริปต์ที่ดาวน์โหลด การ publish ไปยัง npm/PyPI ต้องให้คนตรวจแล้วรันเองเสมอ

## ชั้นป้องกันฝั่ง API (ตั้งแต่ v0.3.0)

- จำกัด body 16 KB (413), รับเฉพาะ JSON (415), timeout ต่อคำขอ
- rate limit สองชั้น (ทุก POST 20/นาที/IP และการใช้ key ของเซิร์ฟเวอร์ 5/นาที/IP; IPv6 นับต่อ /64)
- prompt ถูก clean และจำกัด 2,000 ตัวอักษร; system instructions สั่งให้ถือข้อความผู้ใช้เป็นคำอธิบายผลิตภัณฑ์เท่านั้น (กัน prompt injection)
- Structured Outputs แบบ strict + zod (`sanitizeAiPlan`) — template ต้องอยู่ใน catalog, add-on ต้องรองรับ
- ไม่ log prompt, key หรือ header; error ผ่าน `redactSecrets` (`sk-***`, `Bearer ***`, `cfat_***`)
- security headers: CSP, HSTS, `X-Frame-Options: DENY`, COOP/CORP ฯลฯ (ดู [api-hardening.md](../architecture/api-hardening.md))

## ขอบเขตที่ป้องกันไม่ได้

regex blocklist ไม่มีทางครบทุกกรณี คำสั่งที่ "ดูปกติ" แต่เป็นอันตราย (เช่น ติดตั้งแพ็กเกจที่ถูก typosquat) ยังผ่านได้ ดังนั้น **การอ่านสคริปต์ก่อนรันคือการป้องกันชั้นสุดท้ายที่สำคัญที่สุด** UI และ README ที่สร้างให้ย้ำข้อนี้ทุกที่ ถ้าพบวิธีหลบ sanitizer ให้รายงานผ่าน security advisory แบบส่วนตัว ไม่เปิด issue สาธารณะ

## ดูเพิ่ม

[architecture/ai-planner.md](../architecture/ai-planner.md), [user-guide/sharing.md](../user-guide/sharing.md), test: `tests/scripts-share-ai.test.ts` (describe "sanitizer")
