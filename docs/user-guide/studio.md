# Studio (สร้างแอป full-stack ด้วย AI ในเบราว์เซอร์)

หน้า [`/studio`](https://devstack.bid/studio/) คือพื้นที่ทำงานที่เรารวมเข้ามาจากโปรเจกต์ DEVSTACK ของทีม (v0.2.0) บอก AI ว่าอยากได้แอปอะไร แล้วดู agent สี่ตัวช่วยกันเขียนโค้ด ออกแบบฐานข้อมูล วาดภาพ และรันแอปให้ดูสด ๆ ในเบราว์เซอร์ของคุณเอง ไม่ต้องติดตั้งอะไร ไม่ต้องมี API key และไม่มีโค้ดของคุณถูกรันบนเซิร์ฟเวอร์ของเรา

> สถานะ: **beta (v0.8.0-rc)** เรากำลังทดลองใช้ ถ้าเจอปัญหา บอกเราได้ที่ repo

## เริ่มต้นใน 1 นาที

1. เปิด [`/studio`](https://devstack.bid/studio/) จากเมนูด้านบน (หรือกด `⌘K` แล้วพิมพ์ Studio) หน้าจะโหลดใหม่ทั้งหน้า เพราะ Studio ใช้ header ความปลอดภัยชุดของตัวเอง
2. รอให้ชิปด้านบนขึ้นว่า **DB: PGlite + pgvector** และ **Sandbox: ready** ครั้งแรกใช้เวลาราว 5–20 วินาที (โหลด Postgres แบบ WASM ราว 10 MB)
3. กดปุ่ม **ตัวอย่าง: build a todo app** หรือพิมพ์สิ่งที่อยากได้ในช่องด้านล่างซ้าย แล้วกด **รัน** (Enter)
4. ดูผลลัพธ์: ไฟล์ขึ้นใน editor ตรงกลาง แอปขึ้นในช่อง preview ด้านล่าง ตารางขึ้นใน **Data Inspector** และภาพประกอบขึ้นในแผง **ภาพจาก AI** ด้านขวา
5. กด **DEPLOY / EXPORT** เพื่อดาวน์โหลด `devstack-export.zip` ที่มีโค้ด, `db/migrations/001_init.sql`, `db/schema.prisma` และไฟล์ deploy สำหรับ Vercel, Cloudflare Pages และ Docker

## agent ทำอะไรบ้าง

| agent | หน้าที่ | ถ้า AI ไม่พร้อม |
|---|---|---|
| Core (Orchestrator) | อ่านคำขอแล้วแบ่งงานให้ agent ที่เหลือ | ใช้ router แบบกฎ |
| CodeAgent | เขียนไฟล์ React ใน `src/` ตรวจ syntax และ import ก่อนเขียนลงโปรเจกต์ (แก้ซ้ำได้ 2 รอบ) | ใช้แอปแม่แบบที่ทดสอบแล้ว |
| DBAgent | สร้างตารางและข้อมูลตัวอย่างใน Postgres ในเบราว์เซอร์ (อนุญาตเฉพาะคำสั่งที่เพิ่มของ ไม่ลบ) | ใช้ schema แม่แบบ |
| DesignAgent | วาดภาพด้วย FLUX แล้วบีบอัดเป็น PNG ลงโฟลเดอร์ `/public/assets/` ของแอป | ใช้ภาพ placeholder |

ชิป **LLM** ด้านบนบอกว่าตอนนี้ใช้โมเดลอะไร ในแชตจะเห็นว่าแต่ละขั้นมาจาก AI จริงหรือจากแม่แบบ เช่น `CodeAgent (llm)` หรือ `DesignAgent (mock)`

## preview ทำอะไรได้และไม่ได้

ช่อง preview ไม่ได้รัน Node.js เรารวมโค้ดในเบราว์เซอร์ของคุณด้วย [Sucrase](https://github.com/alangpierce/sucrase) (MIT) แล้วรันใน iframe แบบ sandbox ทุกชิ้นเป็น open source และไม่มีค่าบริการจากภายนอก

| ได้ | ไม่ได้ |
|---|---|
| React 19 (`react`, `react-dom`), ไฟล์ `.jsx` `.js` `.ts` `.tsx` `.css` `.json` ใน `src/` | `npm install` หรือแพ็กเกจอื่นนอกจาก `react` / `react-dom` |
| ภาพและ SVG ใน `public/` (เราแปลงเป็น data URL ให้) | terminal shell, Node server, Vite plugin |
| ฐานข้อมูลผ่าน `sql()` ในไฟล์ `devstackDb.js` ของแอป (PGlite ในแท็บนี้) | `fetch` หรือเรียกเน็ตใด ๆ (CSP `connect-src 'none'`) |
| แก้โค้ดแล้ว preview build ใหม่เองภายใน ~0.3 วินาที | เก็บ state ข้ามการแก้ (preview โหลดใหม่ทั้งหน้า ไม่ใช่ HMR) |

ไฟล์ที่ export ออกไปยังเป็นโปรเจกต์ Vite ปกติ รัน `npm install && npm run dev` บนเครื่องคุณได้ตามเดิม

## โควตาฟรี

- **60 การเรียก AI ต่อวัน** ต่อเบราว์เซอร์ (สร้างแอปหนึ่งครั้งใช้ราว 3–6 ครั้ง) นับจาก cookie `nvx_chat_uid` ตัวเดียวกับหน้าแชต
- ภาพใช้โควตา **5 ภาพต่อวัน** ร่วมกับ [User Chat](./chat.md)
- รีเซ็ตตอน **เที่ยงคืนเวลาไทย** มีเพดานต่อเครือข่าย (IP) และเพดานรวมทั้งเว็บ เพื่อให้เราเปิดบริการฟรีต่อไปได้
- โควตาหมดก็ยังใช้ Studio ต่อได้ agent จะสลับไปใช้แม่แบบและภาพ placeholder ให้เอง ชิป **ฟรีวันนี้** ด้านบนแสดงจำนวนที่เหลือ

## ข้อมูลของคุณอยู่ที่ไหน

- โค้ด ฐานข้อมูล และภาพ อยู่ในเบราว์เซอร์ของคุณทั้งหมด (หน่วยความจำของแท็บ + PGlite ใน IndexedDB) เราไม่เก็บไว้บนเซิร์ฟเวอร์
- ข้อความที่ส่งให้ AI ผ่าน `/api/studio/*` ของเราไปยัง Cloudflare Workers AI หรือ Hugging Face เราไม่บันทึกเนื้อหา เก็บแค่ตัวนับโควตา
- แอปที่สร้างรันใน iframe `/studio/preview/` แบบ `sandbox` (origin แยก) จึงอ่าน cookie หรือ storage ของ devstack.bid ไม่ได้ และส่งข้อมูลออกไปไหนไม่ได้ ไม่มี iframe หรือ script จากผู้ให้บริการภายนอก อย่างไรก็ดี อย่าใส่รหัสผ่านหรือ key จริงลงในโค้ดที่สร้าง

## เบราว์เซอร์ที่รองรับ

เราทดสอบกับ Chromium บนเดสก์ท็อป (Chrome, Edge) Firefox และ Safari ควรใช้ได้ เพราะ Studio ใช้แค่ iframe, Web Worker และ WebAssembly มาตรฐาน แต่เรายังไม่ได้ทดสอบ บนมือถือหน้าจอเล็กเกินไปสำหรับ workspace นี้ เราแนะนำให้ใช้คอมพิวเตอร์

## แก้ปัญหา

- **Sandbox: error**: ดูแท็บ **Output** ส่วนใหญ่เป็น syntax error หรือ import แพ็กเกจที่ไม่มี (มีแค่ `react` และ `react-dom`) แก้ไฟล์ใน editor แล้ว preview จะ build ใหม่เอง
- **LLM: mock**: เซิร์ฟเวอร์ยังไม่มี AI หรือโควตาหมด Studio ยังทำงานได้ด้วยแม่แบบ
- **หน้าโหลดช้าครั้งแรก**: Monaco editor และ Postgres WASM รวมราว 30 MB ครั้งต่อไปเบราว์เซอร์จะ cache ไว้

## In English

Studio (`/studio`) is the DEVSTACK workspace we merged into devstack.bid: four agents (Core, Code, DB, Design) build a full-stack app in your browser with a static live preview (compiled in the browser with Sucrase, run in a sandboxed iframe with no network; only `react` and `react-dom` can be imported, there is no npm install or Node), PGlite + pgvector, FLUX images and a one-click export zip. Every part is open source with no third-party runtime fees. AI calls go through our own server (`/api/studio/*`, Workers AI first, then Hugging Face DeepSeek V3) with free daily quotas per browser: 60 AI calls, plus the 5 images shared with User Chat. No key is needed and none reaches your browser. When AI is unavailable or the quota is used up, the agents fall back to tested templates and placeholder images, so the whole flow still works. Architecture: [Studio architecture](../architecture/studio.md).
