# Chat & Factory API

ทุก route ตอบ `Cache-Control: no-store` ข้อผิดพลาดเป็น JSON `{ error, code, ... }` (ข้อความไทย/อังกฤษ)

| Route | Method | ใช้ทำอะไร |
|---|---|---|
| `/api/chat?channel=user\|dev` | GET | สถานะ, `limits`, `models`, `quota` คงเหลือ, รายการแชตของ cookie นี้ |
| `/api/chat/turn` | POST | User Chat: `{ message, conversationId?, mode?: general\|thai\|code\|strong\|image }` → SSE |
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
| 503 | `unavailable` / `no_database` / `uploads_disabled` | ปิดแชต หรือไม่มี binding |
| 401/403 | `key_rejected` / `missing_scope` | Factory: key ผู้ใช้ใช้ไม่ได้ |
