# D1 schema reference (`nvx-db`)

Reference ของทุกตารางในฐานข้อมูล D1 `nvx-db` (binding `DB`, id `3ee9bbab-06b5-49da-b175-5f7162ad5086`, region WNAM) ที่มาของข้อมูลคือไฟล์ใน `migrations/` เหตุผลของการออกแบบอยู่ที่ [architecture/chat-data-model.md](../architecture/chat-data-model.md)

กติกาที่ใช้ทุกตาราง: ทุกตารางเป็น `STRICT`, id เป็น `TEXT` (UUIDv7/ULID), เวลาเป็น `INTEGER` epoch มิลลิวินาที UTC และค่า default คือ `unixepoch('subsec') * 1000` D1 บังคับ foreign key โดยค่าเริ่มต้น

## `schema_meta`

| คอลัมน์ | ชนิด | null | ค่าเริ่มต้น | หมายเหตุ |
|---|---|---|---|---|
| `key` | TEXT | ไม่ | — | PK |
| `value` | TEXT | ไม่ | — | |
| `updated_at` | INTEGER | ไม่ | now (ms) | |

ค่าที่มีตอนนี้คือ `schema_version = 2`

## `users`

| คอลัมน์ | ชนิด | null | ค่าเริ่มต้น | หมายเหตุ |
|---|---|---|---|---|
| `id` | TEXT | ไม่ | — | PK |
| `created_at` | INTEGER | ไม่ | now (ms) | |
| `display_name` | TEXT | ได้ | — | |
| `auth_provider` | TEXT | ได้ | — | เช่น `github`, `google`, `passkey`, `cf-access` |
| `auth_subject` | TEXT | ได้ | — | id ถาวรของผู้ใช้ที่ผู้ให้บริการ auth ส่งมา (`sub`) |
| `email` | TEXT | ได้ | — | |

Constraint: `auth_provider` กับ `auth_subject` ต้องเป็น null พร้อมกันหรือมีค่าพร้อมกัน
Index: `users_auth_identity_uq` (unique: `auth_provider`, `auth_subject`), `users_email_idx` (`email`, เฉพาะแถวที่มี email)

## `conversations`

| คอลัมน์ | ชนิด | null | ค่าเริ่มต้น | หมายเหตุ |
|---|---|---|---|---|
| `id` | TEXT | ไม่ | — | PK |
| `user_id` | TEXT | ไม่ | — | FK → `users.id`, `ON DELETE CASCADE` |
| `title` | TEXT | ได้ | — | |
| `model` | TEXT | ได้ | — | โมเดลเริ่มต้นของบทสนทนา |
| `created_at` | INTEGER | ไม่ | now (ms) | |
| `updated_at` | INTEGER | ไม่ | now (ms) | แอปอัปเดตเมื่อมีข้อความใหม่ |
| `archived` | INTEGER | ไม่ | `0` | `CHECK (archived IN (0, 1))` |

Index: `conversations_user_updated_idx` (`user_id`, `archived`, `updated_at DESC`)

## `messages`

| คอลัมน์ | ชนิด | null | ค่าเริ่มต้น | หมายเหตุ |
|---|---|---|---|---|
| `id` | TEXT | ไม่ | — | PK |
| `conversation_id` | TEXT | ไม่ | — | FK → `conversations.id`, `ON DELETE CASCADE` |
| `role` | TEXT | ไม่ | — | `user` \| `assistant` \| `system` \| `tool` (CHECK) |
| `content` | TEXT | ไม่ | — | ข้อความ (Markdown หรือ JSON ของ tool call) |
| `tokens_in` | INTEGER | ได้ | — | ≥ 0 |
| `tokens_out` | INTEGER | ได้ | — | ≥ 0 |
| `model` | TEXT | ได้ | — | โมเดลที่ตอบหรือรับข้อความนี้ |
| `created_at` | INTEGER | ไม่ | now (ms) | |

Index: `messages_conversation_created_idx` (`conversation_id`, `created_at`, `id`)

## `attachments`

| คอลัมน์ | ชนิด | null | ค่าเริ่มต้น | หมายเหตุ |
|---|---|---|---|---|
| `id` | TEXT | ไม่ | — | PK |
| `message_id` | TEXT | ไม่ | — | FK → `messages.id`, `ON DELETE CASCADE` |
| `r2_key` | TEXT | ไม่ | — | unique; รูปแบบที่แนะนำ `u/<user_id>/c/<conversation_id>/<attachment_id>` |
| `mime` | TEXT | ไม่ | — | |
| `size` | INTEGER | ไม่ | — | ไบต์, ≥ 0 |
| `created_at` | INTEGER | ไม่ | now (ms) | |

Index: `attachments_message_idx` (`message_id`) และ unique index ของ `r2_key`
หมายเหตุ: cascade ลบได้แค่แถวใน D1 ส่วนวัตถุใน R2 ต้องลบจากโค้ด

## `api_clients`

| คอลัมน์ | ชนิด | null | ค่าเริ่มต้น | หมายเหตุ |
|---|---|---|---|---|
| `id` | TEXT | ไม่ | — | PK |
| `name` | TEXT | ไม่ | — | ชื่อที่อ่านเข้าใจ เช่นชื่อบริการ |
| `key_hash` | TEXT | ไม่ | — | unique; SHA-256 hex ของ key เต็ม (ห้ามเก็บ key จริง) |
| `scopes` | TEXT | ไม่ | `'[]'` | JSON array (CHECK `json_valid` + ต้องเป็น array) |
| `rate_limit` | INTEGER | ไม่ | `60` | คำขอต่อนาที, > 0 |
| `created_at` | INTEGER | ไม่ | now (ms) | |
| `revoked_at` | INTEGER | ได้ | — | null = ใช้งานได้ |

Index: unique index ของ `key_hash`, `api_clients_active_created_idx` (`created_at DESC`, เฉพาะแถวที่ `revoked_at IS NULL`)

## ตารางของระบบ

`d1_migrations` สร้างโดย wrangler เพื่อจำว่า migration ไหน apply ไปแล้ว ห้ามแก้ด้วยมือ
