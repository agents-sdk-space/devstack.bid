# การทดสอบ · Testing

## ชั้นของการทดสอบ

| ชั้น | เครื่องมือ | คำสั่ง | ครอบคลุม |
|---|---|---|---|
| Unit / logic | Vitest (environment `node`) | `npm test` | composer, scripts, share, sanitizer, fallback, AI plan, production hardening, tokens/contrast, docs-check |
| Component | Vitest + Testing Library + jsdom (ต่อไฟล์ด้วย `// @vitest-environment jsdom`) | `npm test` | Button, Stepper, EmptyState, Field, Segmented, Tabs, Dialog, CodeBlock/Toast, ToolIcon/ToolTile |
| Static | ESLint, TypeScript | `npm run lint`, `npm run typecheck` | ชนิดข้อมูล, กฎ React/Next |
| Docs | `scripts/docs-check.mjs` | `npm run docs:check` | ความยาวเอกสาร, ลิงก์, template id, env var, npm scripts |
| Build | OpenNext | `npm run cf:build` | bundle ของ Worker build ได้ |
| E2E / ภาพ | Playwright กับ `npm run preview` (ยังไม่อยู่ใน repo) | ทำด้วยมือ/สคริปต์ภายนอก | flow builder, 404, headers, ไม่มี horizontal scroll, ภาพหน้าจอ |

config: [`vitest.config.mts`](../../vitest.config.mts) — alias `@` → `src`, alias `server-only` เป็นโมดูลว่าง (เพื่อ test โค้ดฝั่งเซิร์ฟเวอร์ได้ตรง ๆ), JSX runtime automatic, `include: tests/**/*.test.{ts,tsx}`, setup ใน [`tests/setup.ts`](../../tests/setup.ts) (cleanup + polyfill ResizeObserver, pointer capture, scrollIntoView, matchMedia สำหรับ Radix)

## ไฟล์ test และสิ่งที่ล็อกไว้

- `tests/composer.test.ts` — ทุกเทมเพลต Node เริ่มด้วย nvm และไม่มี placeholder ค้าง, flags ของ create-next-app, ตัวคั่น `--` ของ npm, ตัด syntax TS สำหรับ JS, pip/uv, add-on ก่อน long-running, ไม่มีขั้นซ้ำ, applyEdits, ชื่อโปรเจกต์
- `tests/scripts-share-ai.test.ts` — bash heredoc + คอมเมนต์ long-running, PowerShell, nvm check, README ไทย, share round-trip/ปฏิเสธขยะ, BLOCKED/RISKY, fallback ไทย/อังกฤษ, sanitizeAiPlan
- `tests/production.test.ts` — env defaults/invalid, body 415/413/400, timeout 504, redactSecrets, security headers + CSP, template ids ตรงกับ registry, POST 429 + Retry-After, AI limiter ไม่ใช้กับ user key, IPv6 /64
- `tests/tokens.test.ts` — WCAG AA 32 คู่ทั้งสองธีม + non-text 3:1, ธีมดำเป็นค่าเริ่มต้น (layout มี `className={\`dark ` และ `var dark=t!=='light'`)
- `tests/ui-components.test.tsx` — พฤติกรรมและ accessibility ของคอมโพเนนต์
- `tests/tool-icons.test.tsx` — ทุกเทมเพลตมีไทล์, `commandTool`, ARIA ของไอคอน, **ไม่มีอีโมจิใน `src/`**
- `tests/docs-check.test.ts` — docs-check ผ่านบน repo จริง และจับความผิดพลาดใน fixture (หน้าสั้น, ลิงก์เสีย, id/env ที่ไม่มีในเอกสาร)

## แนวทางเขียน test

- **ทดสอบพฤติกรรมที่ผู้ใช้เห็นหรือสัญญา (contract)** ไม่ใช่รายละเอียดภายใน เช่น "dev server อยู่หลังขั้น add-on" ดีกว่า "array index 5 คือ ..."
- ทุก bug fix ควรมี test ที่ล้มก่อนแก้ (เช่น `712eb8e` มาพร้อม test IPv6)
- test ที่ใช้ DOM ใส่ `// @vitest-environment jsdom` บรรทัดแรก
- ห้ามเรียก OpenAI จริงใน test — route test ใช้ `mode: "fallback"` หรือไม่มี key
- ใช้ `getByRole`/ชื่อที่เข้าถึงได้ ซึ่งทดสอบ accessibility ไปพร้อมกัน

## ก่อนเปิด PR

```bash
npm run lint && npm run typecheck && npm test && npm run docs:check && npm run cf:build
```

ถ้าแก้ UI: รัน `npm run preview` แล้วตรวจภาพทั้งธีมดำ/สว่าง ไทย/อังกฤษ เดสก์ท็อป 1440px/มือถือ 390px และแนบภาพหน้าจอ

## E2E ที่แนะนำ (ทำด้วย Playwright)

1. palette (Ctrl+K) นำทางไปเทมเพลต
2. builder: โหลดเทมเพลต → Configure → ย้ายด้วยคีย์บอร์ด (Space, ↓, Space) และลากด้วยเมาส์ → ลบ (toast) → ดาวน์โหลด setup.sh (ตรวจขนาด/เนื้อหา) → คัดลอก share link → เปิดลิงก์ใน context ใหม่ภาษาไทย ได้ขั้น Review
3. agent panel: skeleton ระหว่างโหลด, error state
4. `/templates/unknown` → 404, ทุกหน้าไม่มี horizontal scroll
