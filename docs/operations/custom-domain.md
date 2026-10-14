# โดเมนจริง devstack.bid · Custom domain

> **สถานะ (11 ต.ค. 2026, v0.5.1): ใช้งานแล้ว** แอปเสิร์ฟที่ **https://devstack.bid** (apex) ผ่าน Workers Custom Domain ของ Worker `nvx-stack-builder` บัญชี `[account ID redacted]` ส่วน `www.devstack.bid` เป็น custom domain ของ Worker เดียวกันและ redirect แบบ 308 ไปที่ apex ได้รับอนุมัติจากเจ้าของโดเมนแล้ว รายละเอียดการ deploy อยู่ใน [DEPLOY.md](../DEPLOY.md)

## สิ่งที่สร้างไว้

| รายการ | ค่า | หมายเหตุ |
|---|---|---|
| zone | `devstack.bid` (id `[account ID redacted]`) | ก่อนเริ่มไม่มี DNS record เลย |
| Custom Domain | `devstack.bid` → `nvx-stack-builder` (id `[resource ID redacted]`) | ใบรับรอง `[deployment ID redacted]` (Google Trust Services, SAN `devstack.bid`, `*.devstack.bid`, หมดอายุ 9 ม.ค. 2027 ต่ออายุอัตโนมัติ) |
| Custom Domain | `www.devstack.bid` → `nvx-stack-builder` (id `[resource ID redacted]`) | ใบรับรอง `[deployment ID redacted]` |
| DNS (สร้างอัตโนมัติ) | `AAAA devstack.bid 100::` proxied, `AAAA www.devstack.bid 100::` proxied | **อย่าแก้หรือลบเอง** Cloudflare ผูก record เหล่านี้กับ custom domain |
| config | `routes` ใน [`wrangler.jsonc`](../../wrangler.jsonc): `{ "pattern": "devstack.bid", "custom_domain": true }` และ `www.devstack.bid` | ทำให้ `npm run deploy` ครั้งต่อไปยืนยันโดเมนเดิมเสมอ |
| redirect | `redirects()` ใน [`next.config.ts`](../../next.config.ts): host `www.devstack.bid` → `https://devstack.bid/:path*` (308, คง path และ query) | ให้มี URL หลักเดียว (canonical) ดีต่อ SEO และ cookie |
| metadata | `metadataBase` = `https://devstack.bid` (ค่าเริ่มต้นของ `NEXT_PUBLIC_SITE_URL` ใน [`src/app/layout.tsx`](../../src/app/layout.tsx)) | `og:image` / `twitter:image` เป็น URL เต็มบน devstack.bid |

workers.dev ยังเปิดอยู่เป็นทางสำรอง (`workers_dev: true`) ที่ `workers.dev URL redacted` บัญชีนี้เปลี่ยนชื่อ subdomain จาก `previous subdomain redacted` เป็น `production subdomain redacted` ระหว่างวันที่ 11 ต.ค. URL `previous subdomain redacted` เดิมจึงใช้ไม่ได้แล้ว

## ทำไมเลือก Workers Custom Domain (ไม่ใช่ route)

- Custom Domain สร้าง DNS record และใบรับรองให้อัตโนมัติ ไม่ต้องมี origin server
- route (`devstack.bid/*`) ต้องมี DNS record แบบ proxied อยู่ก่อน และเหมาะกับการแทรก Worker หน้า origin ที่มีอยู่แล้ว ซึ่งไม่ใช่กรณีนี้
- ลบ custom domain ได้ในคำสั่งเดียว DNS record ที่สร้างให้ก็ถูกลบตามไปด้วย

## สิทธิ์ของ token ที่ต้องใช้

การผูก custom domain (`PUT /accounts/{id}/workers/domains` หรือ `routes` + `wrangler deploy`) ต้องทำด้วย token **ตัวเดียว** ที่มีทั้ง:

- Account › **Workers Scripts: Edit** (ต้องเข้าถึง Worker ปลายทาง)
- สิทธิ์ระดับ zone ของ `devstack.bid` อย่างน้อย **Zone: Read** (ในการ deploy ครั้งนี้ token ที่มี Workers Scripts: Edit + Zone: Read ทำงานได้)

ผลการตรวจ token เมื่อ 11 ต.ค.: token `CLOUDFLARE_API_TOKEN` อยู่บัญชีเดียวกัน อ่าน zone และ DNS ได้ แต่ **ไม่มีสิทธิ์ Workers Scripts เลย** (list scripts ได้ผลว่าง และ `/workers/scripts/nvx-stack-builder/settings` ตอบ "No access to the specified resource", `/workers/domains` ตอบ Authentication error) จึงผูกโดเมนกับ Worker ไม่ได้ การผูกจึงใช้ token `CLOUDFLARE_API_TOKEN` (Workers Scripts: Edit + Zone: Read) ส่วน token ที่อ่าน DNS ได้ใช้แค่ยืนยันผล ถ้าต้องการให้ token เดียวทำได้ทั้งหมด ให้เพิ่ม **Account › Workers Scripts: Edit** ให้ deployment token

## HSTS

ตั้งแต่ v0.5.1 แอปส่ง `Strict-Transport-Security: max-age=31536000` **โดยไม่มี `includeSubDomains` และ `preload`** ทั้งใน [`src/lib/security-headers.ts`](../../src/lib/security-headers.ts) และ [`public/_headers`](../../public/_headers)

เหตุผล: แอปอยู่บน apex ของ zone ถ้าส่ง `includeSubDomains` เบราว์เซอร์จะบังคับ HTTPS ให้ **ทุก subdomain ในอนาคต** ของ devstack.bid เป็นเวลาหนึ่งปี ถ้าวันหนึ่งเพิ่ม subdomain ที่ยังไม่มี HTTPS (เช่น mail หรือบริการภายนอก) ผู้ใช้จะเข้าไม่ได้ และ `preload` ถอนออกยากมาก

ข้อควรรู้: เวอร์ชันก่อนหน้า (`d369f2b6…`) ส่ง `includeSubDomains` อยู่ไม่กี่นาทีหลังผูกโดเมน (ผูกโดเมนราว 09:13 และ deploy v0.5.1 เมื่อ 09:15 ICT) ในช่วงนั้นมีเพียงเบราว์เซอร์ทดสอบอัตโนมัติที่เข้าเว็บ ผลกระทบจึงแทบไม่มี เมื่อแน่ใจว่าทุก subdomain รองรับ HTTPS แล้วค่อยเพิ่ม `includeSubDomains` (และพิจารณา `preload`) ทีหลัง

## Cloudflare Web Analytics กับ CSP

zone นี้เปิด Web Analytics แบบติดตั้งอัตโนมัติ Cloudflare จึงแทรก `https://static.cloudflareinsights.com/beacon.min.js` ลงใน HTML ที่ส่งให้เบราว์เซอร์ แต่ CSP ของแอป (`script-src 'self' 'unsafe-inline'`) บล็อกสคริปต์นั้นไว้ ผลคือมี console error ทุกหน้าและไม่มีข้อมูล analytics (แอปทำงานปกติ) เลือกได้ 2 ทาง (ต้องให้เจ้าของตัดสินใจ):

1. ปิด automatic setup ของ Web Analytics สำหรับ devstack.bid ใน Dashboard (ไม่ต้องแก้โค้ด และ CSP ยังเข้มเท่าเดิม)
2. อนุญาตใน CSP: เพิ่ม `https://static.cloudflareinsights.com` ใน `script-src` และ `https://cloudflareinsights.com` ใน `connect-src` (มีสคริปต์ภายนอกเพิ่ม 1 ตัว)

## Rollback ของโดเมน (ต้องได้รับอนุมัติ)

- ถอดโดเมน: ลบ `routes` ใน `wrangler.jsonc` แล้วลบ custom domain ด้วย `DELETE /accounts/{id}/workers/domains/{domain_id}` หรือใน Dashboard → Worker → Settings → Domains & Routes (DNS record ที่สร้างให้จะถูกลบตาม) workers.dev ยังใช้ได้
- rollback เวอร์ชัน Worker **ไม่ถอดโดเมน** โดเมนผูกกับ Worker ไม่ได้ผูกกับเวอร์ชัน ถ้าย้อนไป `d369f2b6…` โดเมนยังเสิร์ฟอยู่แต่จะกลับไปส่ง HSTS `includeSubDomains` และ metadata ที่ชี้ workers.dev (ดู [rollback.md](./rollback.md))

## zone อื่น: agents-sdk.space (ห้ามแตะ)

zone `agents-sdk.space` (id `[account ID redacted]`, บัญชี `[account ID redacted]`) เป็นของระบบอื่น มี Worker `agents-sdk-space` เสิร์ฟอยู่ **ห้ามแตะ** DNS, routes หรือ custom domain ของ zone นี้ แผนเดิมที่จะผูกโดเมนนี้ถูกยกเลิก เพราะเจ้าของเลือก devstack.bid แทน

## สิ่งที่ AI agent ต้องทำเมื่อถูกขอให้เพิ่มหรือเปลี่ยนโดเมน

หยุดและขออนุมัติพร้อมแผน ระบุ zone, hostname, บัญชี, สิทธิ์ token ที่ต้องใช้ และผลกระทบต่อ Worker หรือ DNS เดิม ตรวจก่อนว่า zone ไม่มี record ชื่อเดียวกัน (custom domain จะชน) ห้ามแก้ Worker หรือ record อื่น และห้ามพิมพ์ token
