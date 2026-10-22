# @lsuperdev/devstack

เครื่องมือบรรทัดคำสั่งสำหรับ [devstack.bid](https://devstack.bid) ใช้เข้าสู่ระบบ สร้างโปรเจกต์จาก template เชื่อมโฟลเดอร์กับ GitHub repo deploy ขึ้น `<ชื่อ>.devstack.bid` และดูบันทึกการ build [English](./README.md)

```bash
npm i -g @lsuperdev/devstack     # หรือ npx @lsuperdev/devstack <คำสั่ง>
devstack login                   # เปิดเบราว์เซอร์ แล้วยืนยันรหัสที่แสดงใน terminal
devstack link --repo you/my-site # นำเข้า GitHub repo (ใช้การเชื่อม GitHub บน devstack.bid)
devstack deploy --prod           # build แสดง log สด แล้วพิมพ์ลิงก์ https://<ชื่อ>.devstack.bid
```

| คำสั่ง | ทำอะไร |
| --- | --- |
| `login [--token] [--no-browser]` | เข้าสู่ระบบผ่านเบราว์เซอร์ด้วยรหัสยืนยัน หรือวางคีย์จาก devstack.bid/settings/cli (ไม่แสดงบนจอ) |
| `logout` | เพิกถอนคีย์ของเครื่องนี้ที่เซิร์ฟเวอร์ และลบไฟล์คีย์ในเครื่อง |
| `whoami` | แสดงบัญชีที่เข้าสู่ระบบอยู่ |
| `templates` | แสดงรายการ template |
| `create <ชื่อ> --template <id>` | สร้างโปรเจกต์ใหม่จาก template |
| `init [--template static\|worker]` | สร้างไฟล์เริ่มต้นในโฟลเดอร์ปัจจุบัน (ต้องว่าง) |
| `link [--project ...] [--repo owner/name]` | เชื่อมโฟลเดอร์นี้กับโปรเจกต์ หรือนำเข้า repo ใหม่ |
| `deploy [--prod]` | build และ deploy จาก GitHub repo ที่เชื่อมไว้ |
| `status` | สถานะโปรเจกต์และ deploy ล่าสุด 10 รายการ |
| `logs <deployment-id> [--follow]` | ดูบันทึกการ build |

**ข้อจำกัดเวอร์ชัน 0.1.0:** deploy ได้จาก GitHub เท่านั้น การอัปโหลดโฟลเดอร์ในเครื่องขึ้น `*.devstack.bid` เซิร์ฟเวอร์ยังไม่รองรับ และ CLI จะบอกตรงๆ

**ความปลอดภัย:** เซิร์ฟเวอร์เก็บคีย์เป็นค่าแฮช จำกัดสิทธิ์ จำกัดจำนวนครั้ง และเพิกถอนได้ ในเครื่องเก็บที่ `~/.config/devstack/auth.json` สิทธิ์ไฟล์ `0600` CLI ไม่พิมพ์ token ออกมาเด็ดขาด ใน CI ให้ใช้ `DEVSTACK_TOKEN`

ต้องใช้ Node.js 18 ขึ้นไป ไม่มี dependency ตอนรัน สัญญาอนุญาต MIT
