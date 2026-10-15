# Chat & Factory API

ทุก route ตอบ `Cache-Control: no-store` ข้อผิดพลาดเป็น JSON `{ error, code, ... }` (ข้อความไทย/อังกฤษ)

| Route | Method | ใช้ทำอะไร |
|---|---|---|
| `/api/chat?channel=user\|dev` | GET | สถานะ, `limits`, `models` (รวม Vercel AI Gateway), `github.configured`, `account` ถ้าเข้าสู่ระบบแล้ว, `quota`, รายการแชตของ session หรือ cookie |
| `/api/chat/turn` | POST | User Chat: `{ message, conversationId?, mode?: general\|thai\|code\|strong\|image\|gateway, model? }` → SSE โหมด `gateway` รับเฉพาะ id ในรายการอนุญาต |
| `/login` | GET | หน้าเข้าสู่ระบบ: Cursor, Google, GitHub และบัญชี DevStack |
| `/api/auth/session` | GET | `{ account }` ของ cookie `nvx_auth` หรือ `account: null` |
| `/api/auth/github` | GET | เริ่ม GitHub OAuth (state ลงนามใน cookie) ถ้ายังไม่ตั้งค่า จะพากลับ `/login?auth=missing&provider=github` |
| `/api/auth/github/callback` | GET | แลก code, ผูกแชตกับบัญชี, ตั้ง cookie `nvx_auth` |
| `/api/auth/google` | GET | เริ่ม Google OAuth พร้อม PKCE ถ้ายังไม่ตั้งค่า จะพากลับ `/login?auth=missing&provider=google` |
| `/api/auth/google/callback` | GET | แลก code, อ่าน userinfo, ไม่เก็บ access token |
| `/api/auth/cursor` | GET | พาไปติดตั้งแอป Cursor Origin ถ้ายังไม่มี `CURSOR_APP_ID` จะพากลับ `/login?auth=missing&provider=cursor` |
| `/api/auth/cursor/callback` | GET | ตรวจใบเสร็จติดตั้ง (EdDSA) แล้วตั้ง session จาก `installedBy` |
| `/api/auth/password` | POST | ฟอร์ม `email`, `password`, `action=login\|register`, `next` สร้างหรือเข้าบัญชี DevStack (ต้องมาจาก origin เดียวกัน) จำกัดอัตราทั้งต่อ IP และต่ออีเมล (key เป็น SHA-256 ของอีเมล) เกินแล้วตอบ `auth=error` |
| `/api/auth/logout` | POST | ลบแถว `auth_sessions` ของเบราว์เซอร์นี้ (`?everywhere=1` ลบทุก session ของบัญชี), ลบ token GitHub ที่เข้ารหัสไว้และล้าง cookie (ต้องมาจาก origin เดียวกัน) |
| `/api/github/repos` | GET | รายการ repo ที่บัญชีที่เข้าสู่ระบบ push ได้ |
| `/api/github/contents` | POST | `{ repo, path, message, content, branch? }` สร้างหรืออัปเดตไฟล์ผ่าน GitHub Contents API ไม่รันไฟล์ |
| `/api/chat/dev/turn` | POST | Dev Chat: `{ message, conversationId? }` → SSE |
| `/api/chat/conversations/[id]` | GET / DELETE | อ่านข้อความ / archive แชต (เฉพาะเจ้าของ) |
| `/api/chat/images/[id]` | GET | bytes ของภาพ (เฉพาะเจ้าของ) |
| `/api/chat/files/[conversationId]/[artifactId]` | GET | ดาวน์โหลดไฟล์จาก sandbox ของ Dev Chat |
| `/api/chat/attachments` | POST | อัปโหลดไฟล์ (≤ `MAX_ATTACHMENT_BYTES`) — ตอบ 503 `uploads_disabled` จนกว่าจะมี `ASSETS_BUCKET` |
| `/api/factory` | GET | config ของ Factory (models, scopes, limits) |
| `/api/factory/session` | POST | สร้าง agent + session ด้วย key ผู้ใช้ |
| `/api/factory/watch` | GET | SSE สถานะ environment |
| `/api/factory/turn` | POST | ส่งข้อความใน session ของ Factory |

## SSE events (`UiEvent`)

`meta`, `quota`, `status`, `delta`, `text`, `activity`, `image`, `file`, `usage`, `done`, `error` ดูชนิดเต็มใน [`events.ts`](../../src/lib/chat/events.ts)

## Error codes

| HTTP | code | เมื่อไร |
|---|---|---|
| 400 | `empty` | ข้อความว่าง |
| 404 | `not_found` | แชตไม่ใช่ของคุณ หรือข้ามช่อง (user ↔ dev) |
| 409 | `busy` | ข้อความก่อนหน้ายังตอบไม่เสร็จ |
| 413 | `too_long` | เกิน `CHAT_MAX_INPUT_CHARS` / ไฟล์เกิน 10 MB |
| 429 | `rate_limited` + `limit` | `burst`, `msg_user_day`, `msg_ip_day`, `chat_global_day`, `image_user_day`, `image_ip_day`, `image_global_day`, `agent_user_day`, `agent_global_day`, `budget` พร้อม `Retry-After` |
| 503 | `unavailable` / `no_database` / `uploads_disabled` / `gateway_unconfigured` | ปิดแชต, ไม่มี binding, หรือยังไม่มี `AI_GATEWAY_API_KEY` |
| 401 | `unauthorized` / `reauth` | ยังไม่เข้าสู่ระบบ GitHub หรือ token ที่เก็บไว้เปิดไม่ได้อีก |
| 403 | `forbidden` | คำขอเขียนข้าม origin |
| 401/403 | `key_rejected` / `missing_scope` | Factory: key ผู้ใช้ใช้ไม่ได้ |
