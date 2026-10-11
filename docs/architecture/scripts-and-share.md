# Subsystem: Script generators, downloads & share encoding

## Script generators — [`src/lib/scripts.ts`](../../src/lib/scripts.ts)

ฟังก์ชันบริสุทธิ์สามตัวที่รับ `ResolvedStep[]` + `BuilderConfig` + `lang`:

- **`toBash`** → `setup.sh` (LF) ส่วนหัว: shebang, คอมเมนต์ template/project, โหลด nvm, `set -eo pipefail`, ฟังก์ชัน `step()` และ `verify()` แต่ละขั้น: หัวคอมเมนต์ `# ─── i/total. title ───` + คำอธิบาย; ขั้นที่ kind อยู่ใน `SKIP_KINDS` (longRunning, publish, manual) ถูกคอมเมนต์ทั้งหมดพร้อม `kindNote`; ไฟล์เขียนด้วย heredoc `<<'NVX_EOF'`; ขั้นที่มี `requires` ห่อด้วย `if command -v` (heredoc ไม่ถูก indent เพราะ terminator ต้องอยู่คอลัมน์ 0)
- **`toPowerShell`** → `setup.ps1` (CRLF) ใช้ `$ErrorActionPreference = "Stop"`, `Step`, `Assert-Ok` (ตรวจ `$LASTEXITCODE` หลังทุกคำสั่ง เพราะ native command ไม่ throw เอง), `Write-NvxFile` (here-string `@' '@` + `[IO.File]::WriteAllText`), `Verify { }`
- **`toReadme`** → Markdown ไทยหรืออังกฤษ: quick start, คำเตือนให้ตรวจสคริปต์, สรุป runtime/add-on, share link, ทุกขั้น (คำสั่ง, ไฟล์, OS notes, expected, verify) และ next steps

การ quote: `shSingleQuote` (`'` → `'\''`) และ `psSingleQuote` (`'` → `''`) ใช้กับข้อความที่ไม่ใช่คำสั่ง (ชื่อขั้น, path, verify) เพื่อไม่ให้ชื่อขั้นที่มีอักขระพิเศษกลายเป็นโค้ด

**ทำไมสคริปต์ไม่รันขั้น longRunning:** dev server ไม่จบเอง สคริปต์จะค้างและขั้นหลังจากนั้นไม่ถูกรัน การคอมเมนต์ไว้พร้อมข้อความ "run it manually in a separate terminal" ชัดเจนกว่า

## Downloads — [`src/lib/download.ts`](../../src/lib/download.ts)

- `downloadBlob` / `downloadText` สร้าง object URL แล้วคลิกลิงก์ชั่วคราว (revoke หลัง 1 วินาที)
- `shareUrlFor(config, edits)` = `${origin}/builder#s=<token>`
- `buildStarterZip` ใช้ JSZip สร้างโฟลเดอร์ `<project>-starter/` มี `setup.sh` (unix mode 755), `setup.ps1`, `README.md`, `nvx-stack.json` (generator, shareUrl, config, steps แบบย่อ) และ `starter-files/<path>` ทุกไฟล์ จากนั้น `generateAsync({ platform: "UNIX" })` เพื่อให้สิทธิ์ไฟล์ติดไปด้วย

## CLI export — [`scripts/export-template.ts`](../../scripts/export-template.ts)

`npm run export -- <templateId> [--name] [--pm] [--py] [--addons a,b] [--out] [--lang]` เขียน `setup.sh`, `setup.ps1`, `README.md` ลงดิสก์ ใช้ทดสอบเทมเพลตแบบ end-to-end บนโฟลเดอร์สะอาด

## Share encoding — [`src/lib/share.ts`](../../src/lib/share.ts)

```ts
payload = { v: 1, c: BuilderConfig, o?: string[], r?: string[], x?: ResolvedStep[] }
token   = base64url(UTF-8(JSON.stringify(payload)))   // ไม่มี padding "="
```

- ใช้ `TextEncoder`/`TextDecoder` เพื่อรองรับภาษาไทยใน custom step (btoa ตรง ๆ รับเฉพาะ Latin-1)
- `decodeShare` ปฏิเสธ token ว่างหรือยาวเกิน 60,000, ตรวจ zod (`o`/`r` ≤ 100 รายการ สมาชิก ≤ 80 ตัวอักษร, `x` ≤ 20), `normalizeConfig(c)`, `sanitizeStep` ทุกขั้นใน `x` (id ใหม่ `custom-share-n`) และคืน `null` เมื่อมีข้อผิดพลาดใด ๆ
- เหตุผลของ fragment: ไม่ถูกส่งไปเซิร์ฟเวอร์ ไม่ต้องมี storage ไม่มีข้อมูลผู้ใช้ใน log (ดู [user-guide/sharing.md](../user-guide/sharing.md))

## Tests

`tests/scripts-share-ai.test.ts` ครอบคลุม: script generation (bash มี heredoc และขั้น long-running ถูกคอมเมนต์, PowerShell ใช้คำสั่ง Windows, ขั้น nvm ถูกห่อด้วยการตรวจว่ามีคำสั่ง, README ภาษาไทย), share round-trip และการปฏิเสธ token เสีย, sanitizer (บล็อกคำสั่งทำลายและทำเครื่องหมายคำสั่งเสี่ยง), fallback planner และ AI plan sanitising

## ข้อควรระวังเมื่อแก้

- ถ้าเปลี่ยนรูปแบบ payload ให้เพิ่ม `v: 2` และคงการถอด `v: 1` เพื่อไม่ให้ลิงก์เก่าเสีย
- ถ้าเปลี่ยน heredoc marker ต้องแก้ `cleanFile` ใน sanitizer ให้ตรงกัน
- ทดสอบสคริปต์จริงด้วย `npm run export` แล้ว `bash -n setup.sh` (syntax check) อย่างน้อย

## ประวัติ

ทั้งหมดสร้างใน `a452dc5` (v0.1.0) ปุ่มดาวน์โหลดมี toast ตั้งแต่ `853feac` (v0.2.0) และไอคอน lucide ตั้งแต่ `382750c` (v0.5) ตรรกะการสร้างไฟล์ไม่เปลี่ยน
