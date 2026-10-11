# แก้ปัญหาและคำถามที่พบบ่อย · Troubleshooting & FAQ

เรารวบรวมปัญหาที่ผู้ใช้และผู้ดูแลเจอบ่อยไว้ที่นี่ พร้อมสาเหตุและวิธีแก้ หลายข้อมาจากคำถามที่คนในชุมชนถามเราจริง ๆ ถ้ายังไม่พบคำตอบ ดูหน้า [operations](../operations/local-dev.md) สำหรับฝั่งเซิร์ฟเวอร์ หรือบอกเรา แล้วเราจะเพิ่มคำตอบไว้ในหน้านี้ให้คนถัดไป

## ฝั่งผู้ใช้

**`nvm: command not found` หรือขั้นติดตั้ง Node ถูกข้าม**
nvm เป็น shell function ต้องติดตั้งก่อน (ดู OS notes ในขั้นแรก) แล้วเปิดเทอร์มินัลใหม่ สคริปต์จะพยายาม source `$NVM_DIR/nvm.sh` ให้อัตโนมัติ ถ้าไม่พบจะพิมพ์ `[warn] nvm not found — skipping` แทนการล้มทั้งสคริปต์ บน Windows ใช้ nvm-windows (คำสั่ง `nvm install lts`)

**สคริปต์หยุดกลางทาง**
`setup.sh` ใช้ `set -eo pipefail` และ `setup.ps1` ใช้ `Assert-Ok` จึงหยุดที่คำสั่งแรกที่ล้มเหลว ดูหัวข้อ `==> n/total` ล่าสุดเพื่อรู้ว่าขั้นไหน แก้สาเหตุ (เช่น เน็ตหลุด, เวอร์ชัน Node ไม่ตรง) แล้วรันคำสั่งที่เหลือด้วยมือ หรือลบโฟลเดอร์โปรเจกต์แล้วรันใหม่

**`[warn] verification failed`**
คำสั่ง verify ไม่ผ่าน แต่สคริปต์ยังทำต่อ ให้อ่าน "Expected result" ของขั้นนั้นแล้วตรวจด้วยมือ บางครั้งเป็นเพราะ PATH ยังไม่อัปเดตจนกว่าจะเปิดเทอร์มินัลใหม่

**PowerShell ไม่ยอมรันสคริปต์**
ใช้ `powershell -ExecutionPolicy Bypass -File .\setup.ps1` ซึ่งข้าม policy เฉพาะครั้งนี้

**ทำไม `npm run dev` ไม่ถูกรัน**
ขั้น dev server เป็นชนิด `longRunning` ถูกคอมเมนต์ไว้โดยตั้งใจ เพราะจะค้างสคริปต์ ให้รันเองในเทอร์มินัลแยก เช่นเดียวกับขั้น publish

**คำสั่งที่ฉันเพิ่มเองหายไป / มีข้อความ "That command was blocked"**
sanitizer บล็อกคำสั่งทำลายระบบ (เช่น `rm -rf /`, `mkfs`, `dd if=`, fork bomb, `shutdown`) และคำสั่งยาวเกิน 400 ตัวอักษร ส่วนคำสั่งเสี่ยง (`curl | sh`, `sudo`, `eval`, `npm publish`, `git push --force`) ยังอยู่แต่ถูกทำเป็น manual ดู [safety-model.md](../concepts/safety-model.md)

**AI ตอบ "Too many requests"**
เกิน rate limit (20 POST/นาที/IP ทุกโหมด และ 5 ครั้ง/นาที/IP เมื่อใช้ key ของเซิร์ฟเวอร์) รอ 60 วินาที หรือใช้ offline planner หรือใช้ key ของตัวเอง

**ได้แผน "Rule-based (offline)" ทั้งที่อยากได้ AI**
ดู "Fallback reason" ในแผง: `no OpenAI API key configured` (เซิร์ฟเวอร์ไม่มี key), `OpenAI 401` (key ผิด), `AI request timed out`, `invalid AI output`

**ลิงก์แชร์เปิดแล้วได้ค่าเริ่มต้น**
token เสีย (ถูกตัดตอนคัดลอก) หรือเกิน 60,000 ตัวอักษร ให้คัดลอกใหม่ทั้งบรรทัด

## FAQ

- **แอปรันคำสั่งบนเซิร์ฟเวอร์ไหม?** ไม่ ไม่มีโค้ดเส้นทางใดของเราที่ execute คำสั่ง ทุกอย่างเป็นข้อความ
- **key ของฉันถูกเก็บไหม?** ไม่ ใช้เฉพาะคำขอเดียว ไม่ log และ redact ออกจาก error
- **ข้อมูลสแต็กถูกส่งไปไหน?** share link อยู่ใน URL fragment ซึ่งไม่ถูกส่งไปเซิร์ฟเวอร์ prompt ถูกส่งไปที่ `/api/plan` (และ OpenAI ถ้าใช้ AI โดยตั้ง `store: false`) และไม่ถูก log
- **รองรับ Windows ไหม?** รองรับผ่าน `setup.ps1` คำสั่งที่ไม่มี override เฉพาะ Windows จะถูกแปลงแบบ best-effort (`curl` → `curl.exe`, `python3` → `py -3.12`, `&&` → `;`)
- **เพิ่มเทมเพลตได้ไหม?** ได้ และเรายินดีมาก ดู [add-template.md](../contributing/add-template.md)
- **เอาเอกสารไปใช้ต่อได้ไหม?** ได้ ทุกหน้ามีปุ่มคัดลอก Markdown และ URL `.md` ส่วน AI agent อ่านสารบัญได้ที่ `/llms.txt`

## อ้างอิง

[`src/lib/sanitize.ts`](../../src/lib/sanitize.ts), [`src/lib/scripts.ts`](../../src/lib/scripts.ts), [`src/lib/composer.ts`](../../src/lib/composer.ts)
