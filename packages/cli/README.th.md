# devstack-bid

เครื่องมือบรรทัดคำสั่งสำหรับ [devstack.bid](https://devstack.bid) ใช้เข้าสู่ระบบ สร้างโปรเจกต์จาก template เชื่อมโฟลเดอร์กับ GitHub repo deploy ขึ้น `<ชื่อ>.devstack.bid` และดูบันทึกการ build [English](./README.md)

## ติดตั้ง

```bash
npm i -g devstack-bid     # หรือ npx devstack-bid <คำสั่ง>
```

ต้องใช้ Node.js 20 ขึ้นไป ไม่มี dependency ตอนรัน

## เริ่มต้นใช้งาน

```bash
devstack login                   # เปิด devstack.bid/cli/device แล้วพิมพ์รหัสที่แสดงใน terminal
devstack link --repo you/my-site # นำเข้า GitHub repo (ใช้การเชื่อม GitHub บน devstack.bid)
devstack deploy --prod           # build แสดง log สด แล้วพิมพ์ลิงก์ https://<ชื่อ>.devstack.bid
```

## คำสั่ง

| คำสั่ง | ทำอะไร |
| --- | --- |
| `login [--token] [--no-browser]` | เข้าสู่ระบบผ่านเบราว์เซอร์ด้วยรหัส หรือใช้ `--token` เพื่อวางคีย์จาก devstack.bid/settings/cli (ไม่แสดงบนจอ และอ่านจาก stdin ได้: `echo "$KEY" \| devstack login --token`) |
| `logout` | เพิกถอนคีย์ของเครื่องนี้ที่เซิร์ฟเวอร์ และลบไฟล์คีย์ในเครื่อง |
| `whoami` | แสดงบัญชีที่เข้าสู่ระบบอยู่และสิทธิ์ของคีย์ |
| `templates` | แสดง starter (`static`, `worker`) และ repo template |
| `create <ชื่อ> [--template <id>]` | starter (ค่าเริ่มต้น `static`) สร้างไฟล์ใน `./<ชื่อ>` ส่วน repo template จะสร้าง GitHub repo ใหม่ในบัญชีคุณ |
| `init [--template static\|worker]` | สร้าง starter ในโฟลเดอร์ปัจจุบันที่ว่างอยู่ (ค่าเริ่มต้น `static`) |
| `link [--project <id\|ชื่อ>] [--repo owner/name] [--branch b] [--root dir]` | เชื่อมโฟลเดอร์นี้ (`.devstack/project.json`) ถ้าใส่ `--repo` จะนำเข้า repo และเริ่ม build ครั้งแรก |
| `deploy [--prod] [--ref <ref>]` | build จาก GitHub repo ที่เชื่อมไว้ (ค่าเริ่มต้นเป็น preview) พร้อมแสดง log |
| `status` | โปรเจกต์ที่เชื่อมไว้และ deploy ล่าสุด 10 รายการ |
| `logs <deployment-id> [--follow]` | ดูบันทึกการ build ของ deploy นั้น |

รหัสออก: `0` สำเร็จ, `1` API ผิดพลาดหรือ build ล้มเหลว, `2` ใช้คำสั่งผิด (ตัวเลือกไม่รู้จัก ไม่ใส่ค่า หรือยังไม่ได้เชื่อมโฟลเดอร์)

## สิทธิ์

ในหน้าอนุมัติ คุณเลือกได้ว่าคีย์ทำอะไรได้บ้าง `cli:setup` (สร้างโปรเจกต์ ดูสถานะ) ได้เสมอ ส่วน `cli:deploy` (นำเข้า repo สั่ง build ดู log) ต้องติ๊กเลือกเอง คำสั่ง `deploy`, `link --repo` และ `logs` ต้องใช้ `cli:deploy`

## ข้อจำกัด (v0.1.0)

deploy ได้จาก GitHub เท่านั้น การอัปโหลดโฟลเดอร์ในเครื่องขึ้น `*.devstack.bid` เซิร์ฟเวอร์ยังไม่รองรับ และ CLI จะแจ้งเรื่องนี้อย่างชัดเจน

## ความปลอดภัย

- เซิร์ฟเวอร์เก็บคีย์เป็นค่าแฮช จำกัดจำนวนครั้งต่อคีย์ หมดอายุ 90 วันหลังใช้ครั้งล่าสุด และเพิกถอนได้ที่ devstack.bid/settings/cli (หน้านั้นแสดงเวลาใช้ล่าสุดและประวัติการเข้าสู่ระบบด้วย)
- อนุมัติเฉพาะเมื่อคุณเพิ่งสั่ง `devstack login` ด้วยตัวเองเท่านั้น ลิงก์จะไม่มีรหัสติดมา คุณต้องพิมพ์เอง
- ในเครื่องเก็บคีย์ที่ `~/.config/devstack/auth.json` สิทธิ์ไฟล์ `0600` (รองรับ `XDG_CONFIG_HOME`) และผูกกับเซิร์ฟเวอร์ที่ออกคีย์ ถ้า `DEVSTACK_API` ชี้ไปที่อื่น จะไม่ส่งคีย์ที่บันทึกไว้ ใช้ได้เฉพาะ `DEVSTACK_TOKEN` พร้อมคำเตือน
- CLI ไม่พิมพ์ token ออกมาเด็ดขาด และปิดบังข้อความที่หน้าตาเหมือน token ใน log
- ใน CI ให้ใช้ `DEVSTACK_TOKEN` และ `DEVSTACK_API` ต้องเป็น `https://` (http ได้เฉพาะ localhost)

## สัญญาอนุญาต

MIT เป็นส่วนหนึ่งของโปรเจกต์ devstack.bid
