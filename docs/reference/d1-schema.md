# D1 schema reference (`nvx-db`)

Reference ของทุกตารางในฐานข้อมูล D1 `nvx-db` (binding `DB`, id `[deployment ID redacted]`, region WNAM) ที่มาของข้อมูลคือไฟล์ใน `migrations/` เหตุผลของการออกแบบอยู่ที่ [architecture/chat-data-model.md](../architecture/chat-data-model.md)

กติกาที่ใช้ทุกตาราง: ทุกตารางเป็น `STRICT`, id เป็น `TEXT` (UUIDv7/ULID), เวลาเป็น `INTEGER` epoch มิลลิวินาที UTC และค่า default คือ `unixepoch('subsec') * 1000` D1 บังคับ foreign key โดยค่าเริ่มต้น

## `schema_meta`

| คอลัมน์ | ชนิด | null | ค่าเริ่มต้น | หมายเหตุ |
|---|---|---|---|---|
| `key` | TEXT | ไม่ | — | PK |
| `value` | TEXT | ไม่ | — | |
| `updated_at` | INTEGER | ไม่ | now (ms) | |

ไฟล์ migration ตั้ง `schema_version` ไปจนถึง `8` บน remote `nvx-db` มีการบันทึกว่า apply `0001`–`0007` แล้วเมื่อ 14 ต.ค. 2026 และ apply `0008_mcp_clients` ก่อน deploy MCP ในวันเดียวกัน

## `users`

| คอลัมน์ | ชนิด | null | ค่าเริ่มต้น | หมายเหตุ |
|---|---|---|---|---|
| `id` | TEXT | ไม่ | — | PK |
| `created_at` | INTEGER | ไม่ | now (ms) | |
| `display_name` | TEXT | ได้ | — | |
| `auth_provider` | TEXT | ได้ | — | `github`, `google`, `cursor`, `password` หรือ null สำหรับผู้ใช้ที่ไม่ระบุตัวตน |
| `auth_subject` | TEXT | ได้ | — | id ถาวรจากผู้ให้บริการ หรืออีเมลที่ปรับรูปแบบแล้วสำหรับ `password` |
| `email` | TEXT | ได้ | — | |
| `login` | TEXT | ได้ | — | ชื่อที่โชว์ในหัวเว็บ (migration 0006) |
| `avatar_url` | TEXT | ได้ | — | รูปจาก `avatars.githubusercontent.com` หรือ `*.googleusercontent.com` |

Constraint: `auth_provider` กับ `auth_subject` ต้องเป็น null พร้อมกันหรือมีค่าพร้อมกัน
Index: `users_auth_identity_uq` (unique: `auth_provider`, `auth_subject`), `users_email_idx` (`email`, เฉพาะแถวที่มี email)

## `github_credentials` (0006)

| คอลัมน์ | ชนิด | null | ค่าเริ่มต้น | หมายเหตุ |
|---|---|---|---|---|
| `user_id` | TEXT | ไม่ | — | PK, FK → `users.id`, `ON DELETE CASCADE` |
| `token_enc` | TEXT | ไม่ | — | ciphertext AES-GCM ของ OAuth token ไม่ใช่ token จริง |
| `scope` | TEXT | ไม่ | — | scope ที่ขอตอนเข้าสู่ระบบ |
| `updated_at` | INTEGER | ไม่ | now (ms) | |

ออกจากระบบจะลบแถวนี้ แถวผู้ใช้และแชตยังอยู่

## `password_credentials` (0007)

| คอลัมน์ | ชนิด | null | ค่าเริ่มต้น | หมายเหตุ |
|---|---|---|---|---|
| `user_id` | TEXT | ไม่ | — | PK, FK → `users.id`, `ON DELETE CASCADE` |
| `password_hash` | TEXT | ไม่ | — | ผล PBKDF2-SHA256 ไม่ใช่รหัสผ่านจริง |
| `salt` | TEXT | ไม่ | — | salt แบบสุ่ม |
| `iterations` | INTEGER | ไม่ | — | 50000–1000000 |
| `updated_at` | INTEGER | ไม่ | now (ms) | |

ออกจากระบบไม่ลบแถวนี้ อีเมลเดียวกันบน Google หรือ GitHub เป็นคนละแถวใน `users`

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
| `user_id` | TEXT | ได้ | — | migration `0008`; FK → `users.id`, `ON DELETE CASCADE`; null for pre-existing unowned clients |
| `name` | TEXT | ไม่ | — | ชื่อที่อ่านเข้าใจ เช่นชื่อบริการ |
| `key_hash` | TEXT | ไม่ | — | unique; SHA-256 hex ของ key เต็ม (ห้ามเก็บ key จริง) |
| `scopes` | TEXT | ไม่ | `'[]'` | JSON array (CHECK `json_valid` + ต้องเป็น array) |
| `rate_limit` | INTEGER | ไม่ | `60` | คำขอต่อนาที, > 0 |
| `created_at` | INTEGER | ไม่ | now (ms) | |
| `revoked_at` | INTEGER | ได้ | — | null = ใช้งานได้ |

Index: unique index ของ `key_hash`, `api_clients_active_created_idx` (`created_at DESC`, เฉพาะแถวที่ `revoked_at IS NULL`), `api_clients_user_active_idx` (`user_id`, `created_at DESC`, เฉพาะแถวที่ยังไม่ revoke)

Migration `0008_mcp_clients` เพิ่ม `user_id` ที่ผูกกับ `users.id` และ owner index เพื่อให้เจ้าของบัญชีออกและเพิกถอน scoped MCP keys ได้ key ดิบแสดงครั้งเดียว ส่วน D1 เก็บ SHA-256 hash เท่านั้น

## Migration 0003–0005 (แชต)

- **0003** `conversations.agent_session_id`, `messages.meta` (JSON), ตาราง `usage_counters` (`scope`, `bucket`, `count`, `updated_at`; PK `(scope, bucket)`) และ `attachment_blobs` (`attachment_id` → `attachments.id`, `data` BLOB ≤ 1,500,000 ไบต์)
- **0004** `conversations.source` (`'chat'|'factory'`, default `'chat'`), `conversations.environment` (`none|openai_hosted|self_hosted`), index `conversations_user_source_updated`
- **0005** `conversations.channel` (`'user'|'dev'`, default `'user'`; แถวที่มี `agent_session_id` หรือ `source='factory'` ถูกตั้งเป็น `'dev'`), index `conversations_user_channel_updated`, `schema_version = 5`
- **0006** `users.login`, `users.avatar_url`, ตาราง `github_credentials` (`user_id` PK → `users.id`, `token_enc` คือ ciphertext AES-GCM ของ OAuth token, `scope`, `updated_at`), `schema_version = 6` apply บน remote แล้วเมื่อ 14 ต.ค. 2026
- **0007** ตาราง `password_credentials` (แฮช PBKDF2 ของบัญชี DevStack), `schema_version = 7` apply บน remote แล้วเมื่อ 14 ต.ค. 2026
- **0008** `api_clients.user_id` foreign key ไป `users.id` และ active-owner index สำหรับจัดการ key ที่หน้า MCP settings apply บน remote แล้วก่อน deploy MCP เมื่อ 14 ต.ค. 2026

bucket ของ `usage_counters`: `d:YYYYMMDD` = วันตามเวลาไทย (UTC+7), `h:YYYYMMDDHH` = ชั่วโมง UTC

## ตารางของระบบ

`d1_migrations` สร้างโดย wrangler เพื่อจำว่า migration ไหน apply ไปแล้ว ห้ามแก้ด้วยมือ
