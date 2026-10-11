# API reference: `/api/plan`

endpoint เดียวของเซิร์ฟเวอร์ โค้ด: [`src/app/api/plan/route.ts`](../../src/app/api/plan/route.ts) คำสั่งในผลลัพธ์เป็น **ข้อความเท่านั้น** ไม่มีการรันบนเซิร์ฟเวอร์ ทุกคำตอบมี `Cache-Control: no-store`

## `GET /api/plan`

บอกสถานะ AI ฝั่งเซิร์ฟเวอร์ (ไม่เปิดเผย key)

```json
{ "serverKeyConfigured": true, "model": "gpt-6.1-sol" }
```

```bash
curl -s https://devstack.bid/api/plan
```

## `POST /api/plan`

### Request

- Header `Content-Type: application/json` (บังคับ)
- Header `x-openai-key: <key>` (ไม่บังคับ) key ของผู้ใช้ ใช้เฉพาะคำขอนี้ ต้องตรง `^[\w-]{20,400}$` ไม่งั้นถูกเพิกเฉย
- Body ≤ 16 KB

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "prompt": { "type": "string", "minLength": 3, "description": "คำอธิบายแอป (ถูก clean และตัดที่ 2000 ตัวอักษร)" },
    "lang":   { "enum": ["en", "th"], "default": "en", "description": "ภาษาของ summary/คำอธิบาย/ข้อความ error" },
    "mode":   { "enum": ["auto", "fallback"], "default": "auto", "description": "fallback = ใช้ rule-based planner เสมอ" }
  },
  "required": ["prompt"]
}
```

### Response 200: `AgentPlan`

ชนิดใน [`src/lib/ai/types.ts`](../../src/lib/ai/types.ts)

```json
{
  "type": "object",
  "required": ["source", "lang", "templateId", "projectName", "summary", "addons", "jsPm", "pyPm", "extraSteps", "fileTree", "starterFiles", "nextSteps", "warnings"],
  "properties": {
    "source":        { "enum": ["openai", "fallback"] },
    "model":         { "type": "string", "description": "เฉพาะ source=openai" },
    "fallbackReason":{ "type": "string", "description": "เฉพาะ source=fallback เช่น 'no OpenAI API key configured', 'offline mode requested', 'OpenAI 401: ...' (redact แล้ว)" },
    "lang":          { "enum": ["en", "th"] },
    "templateId":    { "enum": ["nextjs-dashboard", "vite-react-game", "express-api", "fastapi-ai", "streamlit-dashboard", "node-cli-npx", "pypi-package", "collab-workspace", "react-admin-tool", "nextjs-ai-chat"] },
    "projectName":   { "type": "string", "pattern": "^[a-z0-9._-]{1,50}$" },
    "summary":       { "type": "string" },
    "addons":        { "type": "array", "items": { "enum": ["typescript", "tailwind", "eslint", "testing", "docker", "ci"] } },
    "jsPm":          { "enum": ["npm", "pnpm", "yarn"] },
    "pyPm":          { "enum": ["pip", "uv"] },
    "extraSteps":    { "type": "array", "maxItems": 6, "items": { "$ref": "#/$defs/ResolvedStep" } },
    "fileTree":      { "type": "array", "items": { "type": "string" }, "maxItems": 40 },
    "starterFiles":  { "type": "array", "items": { "type": "object", "properties": { "path": { "type": "string" }, "content": { "type": "string" } } } },
    "nextSteps":     { "type": "array", "items": { "type": "string" } },
    "warnings":      { "type": "array", "items": { "type": "string" } }
  }
}
```

`ResolvedStep` = `{ id, title: {en,th}, explanation: {en,th}, commands[], windows[], files[], expected: {en,th}, verify?, verifyWindows?, kind: "setup"|"longRunning"|"publish"|"manual", source: "custom" }` (ดู [`src/lib/types.ts`](../../src/lib/types.ts))

### Status codes

| Status | เมื่อไร | Body |
|---|---|---|
| **200** | สำเร็จ ทั้งแผนจาก AI และ fallback (รวมกรณี OpenAI error/timeout ซึ่งกลายเป็น fallback) | `AgentPlan` |
| **400** | JSON เสีย (`Invalid JSON`), อ่าน body ไม่ได้ (`Bad request`), หรือ prompt สั้นกว่า 3 ตัวอักษร | `{ "error": "..." }` (ข้อความ prompt เป็นภาษาตาม `lang`) |
| **413** | body เกิน 16 KB (ทั้งจาก Content-Length และระหว่าง stream) | `{ "error": "Request too large" }` |
| **415** | Content-Type ไม่ใช่ `application/json` | `{ "error": "Content-Type must be application/json" }` |
| **429** | เกิน general limiter (20/นาที/IP) หรือ AI limiter (5/นาที/IP เมื่อใช้ key ของเซิร์ฟเวอร์) | `{ "error": "...", "retryAfter": 60 }` + header `Retry-After: 60` |

ไม่มี 5xx จากเส้นทางปกติ: timeout ภายใน (504) ถูกจับแล้วตอบเป็น fallback 200 ลำดับการตรวจ: general rate limit → body (415/413/400) → prompt (400) → `mode` → key → AI limiter (429) → OpenAI → fallback

### ตัวอย่าง curl

```bash
BASE=http://localhost:8787   # หรือ https://devstack.bid

# offline planner (ไม่เสียเงิน)
curl -s -X POST $BASE/api/plan -H 'content-type: application/json' \
  -d '{"prompt":"FastAPI service with pytest and Docker, use uv","lang":"en","mode":"fallback"}'

# AI ด้วย key ของเซิร์ฟเวอร์ (ภาษาไทย)
curl -s -X POST $BASE/api/plan -H 'content-type: application/json' \
  -d '{"prompt":"แดชบอร์ดยอดขายด้วย Next.js พร้อมเทสต์และ CI","lang":"th"}'

# AI ด้วย key ของผู้ใช้
curl -s -X POST $BASE/api/plan -H 'content-type: application/json' \
  -H "x-openai-key: $MY_OPENAI_KEY" -d '{"prompt":"realtime collaborative notes app"}'

# 415
curl -s -o /dev/null -w '%{http_code}\n' -X POST $BASE/api/plan -H 'content-type: text/plain' -d 'hi'
# 413 (17 KB)
head -c 17000 /dev/zero | tr '\0' 'a' | sed 's/^/{"prompt":"/;s/$/"}/' | \
  curl -s -o /dev/null -w '%{http_code}\n' -X POST $BASE/api/plan -H 'content-type: application/json' --data-binary @-
```

### ตัวอย่างผลลัพธ์ (fallback, ย่อ — ได้จากการรัน `planFallback` จริงกับ prompt แรกข้างบน)

```json
{
  "source": "fallback",
  "fallbackReason": "offline mode requested",
  "lang": "en",
  "templateId": "fastapi-ai",
  "projectName": "nvx-ai-api",
  "summary": "The rule-based (offline) planner picked “FastAPI + Python AI App”: ...",
  "addons": ["testing", "docker"],
  "jsPm": "npm",
  "pyPm": "uv",
  "extraSteps": [],
  "fileTree": ["nvx-ai-api/", "  .venv/", "  main.py", "..."],
  "starterFiles": [{ "path": "main.py", "content": "..." }, { "path": ".env.example", "content": "..." }, { "path": ".gitignore", "content": "..." }, { "path": "tests/test_sanity.py", "content": "..." }],
  "nextSteps": ["Stream responses with StreamingResponse for a chat UI.", "..."],
  "warnings": []
}
```

## หมายเหตุสำหรับผู้เรียก API

- API ออกแบบมาสำหรับ UI ของแอปเอง (CSP `connect-src 'self'` และไม่มี CORS header) การเรียกจาก origin อื่นในเบราว์เซอร์จะถูกบล็อก ส่วน curl/เซิร์ฟเวอร์เรียกได้
- อย่าเรียกถี่กว่า rate limit; ใช้ `mode: "fallback"` สำหรับ health check
- แนวคิดและการตรวจผลดู [architecture/ai-planner.md](../architecture/ai-planner.md)
