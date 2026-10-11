# การดาวน์โหลด · Downloads (setup.sh / setup.ps1 / README / zip)

ขั้น **Export** ของตัวสร้างมีไฟล์ให้ดาวน์โหลด 4 แบบ ทั้งหมดสร้างในเบราว์เซอร์ของคุณเอง (client-side) จากขั้นตอนที่แสดงอยู่บนหน้าจอ ไม่มีอะไรถูกส่งมาที่เซิร์ฟเวอร์ของเรา ในหน้านี้เราจะเปิดให้ดูว่าสคริปต์ข้างในหน้าตาเป็นอย่างไร และทำไมเราเขียนแบบนั้น

## ไฟล์แต่ละแบบ

| ไฟล์ | สำหรับ | สร้างโดย |
|---|---|---|
| `setup.sh` | macOS / Linux / WSL (bash) | `toBash()` |
| `setup.ps1` | Windows PowerShell | `toPowerShell()` (บรรทัดลงท้าย CRLF) |
| `README.md` | เอกสารโปรเจกต์ไทยหรืออังกฤษตามภาษาที่เลือก | `toReadme()` |
| `<project>-starter.zip` | ทั้งหมดข้างบน + `nvx-stack.json` + โฟลเดอร์ `starter-files/` | `buildStarterZip()` |

## ข้างใน setup.sh มีอะไร และทำไมเราเขียนแบบนี้

1. **โหลด nvm ก่อน** (`. "$NVM_DIR/nvm.sh"`) เพราะ nvm เป็น shell function ไม่ใช่ไฟล์โปรแกรม สคริปต์ที่ไม่ได้ source จะหา `nvm` ไม่เจอ
2. `set -eo pipefail` หยุดทันทีเมื่อคำสั่งใดล้มเหลว เพื่อไม่ให้ขั้นต่อไปทำงานบนสถานะที่พัง
3. ฟังก์ชัน `step` พิมพ์หัวข้อ `==> 3/7 ...` และ `verify` รันคำสั่งตรวจสอบ ถ้าไม่ผ่านจะเตือน `[warn]` แต่ไม่หยุดสคริปต์
4. ไฟล์เริ่มต้นเขียนด้วย heredoc แบบ `<<'NVX_EOF'` (มี quote) จึงไม่มีการแทนค่าตัวแปร sanitizer ปฏิเสธไฟล์ที่มีบรรทัด `NVX_EOF` เพื่อกันการหลุดออกจาก heredoc
5. ขั้นที่มี `requires` (เช่น nvm) ถูกห่อด้วย `if command -v nvm ...` ถ้าไม่พบจะข้ามพร้อมคำเตือน
6. ขั้นชนิด **longRunning** (dev server), **publish** (npm publish, twine upload) และ **manual** ถูก **คอมเมนต์ไว้** พร้อมหมายเหตุ เพราะ dev server จะค้างสคริปต์ไว้ และการ publish เป็นการกระทำสาธารณะที่ย้อนกลับไม่ได้

`setup.ps1` ทำแบบเดียวกันด้วย `$ErrorActionPreference = "Stop"`, ฟังก์ชัน `Step`, `Assert-Ok` (ตรวจ `$LASTEXITCODE` หลังทุกคำสั่ง), `Write-NvxFile` (เขียนไฟล์ด้วย here-string `@' ... '@`) และ `Verify`

## วิธีรันอย่างปลอดภัย

เราแนะนำให้อ่านก่อนรันเสมอ คัดลอกคำสั่งด้านล่างไปใช้ได้เลย:

```bash
mkdir ~/projects && cd ~/projects
less setup.sh          # อ่านทุกบรรทัดก่อน
bash setup.sh
```

```powershell
Get-Content .\setup.ps1 | more
powershell -ExecutionPolicy Bypass -File .\setup.ps1
```

`-ExecutionPolicy Bypass` ใช้เฉพาะการรันครั้งนี้ ไม่เปลี่ยน policy ของเครื่อง

## ภายใน starter zip

```
<project>-starter/
  setup.sh            (สิทธิ์ 755)
  setup.ps1
  README.md           (มี share link)
  nvx-stack.json      (generator, shareUrl, config, steps[] แบบอ่านด้วยเครื่องได้)
  starter-files/...   (ทุกไฟล์ที่ขั้นตอนต่าง ๆ จะเขียน ณ path เดิม)
```

เราใส่ `nvx-stack.json` ไว้เผื่อเครื่องมืออัตโนมัติหรือ AI agent ที่ต้องการอ่านลำดับขั้นตอนโดยไม่ต้อง parse shell script

## เคล็ดลับจากทีมเรา

- รันในโฟลเดอร์ว่างเสมอ ขั้นแรกของเทมเพลตส่วนใหญ่สร้างโฟลเดอร์ `{{name}}` แล้ว `cd` เข้าไป
- หลังสคริปต์จบ ให้รันขั้นที่คอมเมนต์ไว้ (เช่น `npm run dev`) ในเทอร์มินัลแยก
- ผู้ร่วมพัฒนาสร้างสคริปต์จาก CLI ได้ด้วย `npm run export -- <templateId>` (ดู [npm-scripts.md](../reference/npm-scripts.md))

## อ้างอิง

[`src/lib/scripts.ts`](../../src/lib/scripts.ts), [`src/lib/download.ts`](../../src/lib/download.ts), [`scripts/export-template.ts`](../../scripts/export-template.ts)
