# NVX UI — UI/UX Framework

> 🇹🇭 ภาษาไทยอยู่ด้านล่าง · Thai version below — [ไปที่ภาษาไทย](#ภาษาไทย)

NVX UI is the design system behind NVX Stack Builder: **design tokens** (CSS variables → Tailwind theme), a small **component library** in `src/components/ui`, and a **living style guide** at [`/design`](http://localhost:3000/design) that renders every token and component variant in Thai and English, in both themes.

**v0.4 "terminal" theme.** The default look is a black developer-tools / DOS terminal: near-black surfaces, phosphor-green primary (`#33ff66`), amber accent, cyan info, 1px borders, 1–4px corners, monospace UI chrome. It's the default for everyone, whatever the OS colour preference. A light "paper printout" variant stays available from the theme toggle.

```
src/app/tokens.css          ← token values (.dark = default terminal theme, :root = light "paper" variant)
src/app/globals.css         ← maps tokens into Tailwind (@theme inline), motion utilities, keyframes
src/lib/design-tokens.ts    ← token manifest (names, descriptions) used by /design and tests
src/components/ui/          ← components (import from "@/components/ui")
src/components/design-system.tsx + src/app/design/page.tsx  ← the /design style guide
tests/ui-components.test.tsx, tests/tokens.test.ts          ← component + token/contrast tests
```

## 1. Design tokens

All values live in `src/app/tokens.css` as `--nvx-*` variables. `.dark` overrides only what changes; everything else cascades from `:root`. `globals.css` maps them into the Tailwind theme so you write **semantic utilities**, never raw palette colours:

| Group | Tokens (`--nvx-…`) | Tailwind utilities |
|---|---|---|
| Surfaces | `bg`, `surface`, `surface-2`, `surface-3`, `border`, `border-strong` | `bg-bg`, `bg-surface`, `bg-surface-2`, `border-border`, `border-border-strong` |
| Text | `fg`, `muted`, `subtle` | `text-fg`, `text-muted`, `text-subtle` |
| Brand | `primary`, `primary-hover`, `primary-fg`, `primary-soft`, `primary-soft-fg`, `accent`, `ring` | `bg-primary`, `hover:bg-primary-hover`, `text-primary-fg`, `bg-primary-soft`, `ring-ring` |
| Status | `success`/`warning`/`danger`/`info` + `-soft` + `-fg` (`danger-hover`) | `bg-success-soft text-success-fg`, `bg-danger` … |
| Code | `code-bg`, `code-fg`, `code-prompt`, `code-muted`, `code-border` (always a black terminal) | `bg-code-bg text-code-fg text-code-prompt` |
| Decoration | `grid`, `scanline`, `glow` | used by `.hero-glow` (grid), CRT scanlines, `.term-glow` |
| Overlay | `overlay` | `bg-overlay` |
| Radius | xs 1px · sm 2px · md 2px · lg 3px · xl 4px | `rounded-md` (controls, badges), `rounded-xl` (cards). Don't use `rounded-full`. |
| Spacing | 4px base unit (`--spacing: 0.25rem`) | `p-1` = 4px, `gap-4` = 16px — prefer 2/3/4/6/8 |
| Shadow | `shadow-sm` none · `shadow-md` 1px phosphor outline (hover) · `shadow-lg` outline + faint glow (dialogs/toasts); hard offset shadows on light | `shadow-sm` … |
| Motion | `duration-fast` 120ms, `duration-base` 200ms, `duration-slow` 320ms, `ease-standard`, `ease-emphasized` | `motion-fast`, `motion-base`, `animate-fade-in`, `animate-pop-in`, `animate-slide-in`, `animate-sheet-in` |
| Focus | — | `focus-ring` utility (2px `ring` outline on `:focus-visible`) |

**Typography.** Monospace-forward. `font-mono` = **IBM Plex Mono** → IBM Plex Sans Thai (Thai glyphs). It's applied globally to `h1–h6`, `nav`, `button`, `label`, `summary`, tabs/radios and `kbd`, and explicitly to badges and chips. `font-sans` = **IBM Plex Sans** → IBM Plex Sans Thai, for body copy, so long Latin and Thai text stays readable. Primary buttons are UPPERCASE with wide tracking; Thai has no case and is unaffected. Scale: `text-display` 48px (hero), `text-4xl` (h1), `text-2xl` (h2), `text-xl` (stage titles), `text-base` (body/card titles), `text-sm` (UI), `text-xs` (captions/badges). Thai needs line-height ≥ 1.5 — don't use `leading-none`/`leading-tight` on Thai body text.

**Theme.** The terminal theme is the `.dark` class on `<html>`. It's rendered by the server and is the **default**. The inline pre-paint script only removes it when `localStorage["nvx-theme"] === "light"` (the toggle), and the OS `prefers-color-scheme` is deliberately ignored. Because components only use semantic tokens, nothing in a component should ever need a `dark:` variant — if you reach for one, add/adjust a token instead.

**Reduced motion.** Under `prefers-reduced-motion: reduce` all durations become 0.01ms and animations are disabled. The hero cursor stays visible but stops blinking.

**Terminal details (decoration only, CSS in `globals.css`).** Pseudo-element glyphs use the `content: "…" / ""` alt-text form, so screen readers skip them.

| Class | Effect | Used on |
|---|---|---|
| `term-prompt` | `$ ` prefix in primary | page titles (h1) |
| `term-section` | `> ` prefix | home section headings |
| `term-eyebrow` | `// ` prefix | eyebrows, hero badge |
| `term-dos` | `C:\NVX> ` prefix | footer status line |
| `term-cursor` | blinking block cursor (`aria-hidden` span) | hero headline |
| `term-bracket` | `[ … ]` around the label | added automatically by `buttonClasses()` for primary/secondary/outline md/lg |
| `term-statusbar` | mono status-bar typography | header, footer |
| `term-rule` | dashed section rule | home section borders |
| `term-glow` | faint phosphor text-shadow (dark only) | logo |
| `hero-glow` | faint 24px phosphor grid (replaces gradient blobs) | hero, AI agent panel |
| CRT scanlines | `.dark body::after`, static, very light, hidden in print | whole page |

Active nav links get a `>` caret automatically (`nav a[aria-current="page"]`).

## 2. Components

Import everything from the barrel: `import { Button, Card, useToast } from "@/components/ui"`. Interactive pieces are built on **Radix UI** primitives (headless, accessible); styling is Tailwind + tokens. `card`, `badge`, `empty-state`, `kbd`, `skeleton`, `button-classes` are server-safe; the rest are client components.

| Component | File | Variants / props | Notes |
|---|---|---|---|
| `Button` | `button.tsx` | `variant`: primary · secondary · outline · soft · ghost · danger; `size`: sm · md · lg · icon; `loading`; `asChild` | Defaults to `type="button"`. `loading` ⇒ disabled + `aria-busy` + spinner. Icon-only buttons need `aria-label`. `buttonClasses()` (server-safe) styles a `<Link>`. |
| `Input`, `Textarea`, `Select` | `field.tsx` | `size` sm·md·lg, `invalid` | Native controls (best mobile + a11y support). |
| `Field`, `Label` | `field.tsx` | `label`, `hint`, `error`, render-prop child | Wires `id`, `aria-describedby`, `aria-invalid`; error has `role="alert"`. |
| `Checkbox`, `Switch` | `checkbox.tsx` | `label`, `description`, `checked`, `onCheckedChange`, `disabled` | Radix. Always labelled. |
| `Segmented` | `segmented.tsx` | `legend`, `options`, `value`, `onChange`, `size`, `hideLegend` | Native radio group in a `<fieldset>` — arrow keys work. |
| `Card` + `CardHeader/Title/Description/Content/Footer` | `card.tsx` | `interactive`, `as` (div/article/section/aside/li); `CardTitle as` h2/h3/h4 | Pick the heading level that fits the page outline. |
| `Badge` | `badge.tsx` | neutral · primary · success · warning · danger · info · outline; `size` sm·md | Text carries the meaning, not colour. |
| `Tabs` | `tabs.tsx` | Radix Tabs (`TabsList` needs `aria-label`) | ←/→ roving focus. |
| `Dialog`, `DialogTrigger`, `DialogContent`, `DialogClose` | `dialog.tsx` | `title` (required), `description`, `side` center·right, `hideTitle`, `closeLabel` | Focus trap, Esc, scroll lock, focus return. `side="right"` = sheet (mobile nav). |
| `ToastProvider`, `useToast` | `toast.tsx` | `toast({ title, description?, variant: default·success·error·info, duration? })` | Radix Toast; polite (errors assertive); swipe/✕ to dismiss; pauses on hover/focus. `useToastOptional` for library code. |
| `Tooltip`, `TooltipProvider` | `tooltip.tsx` | `content`, `side` | Opens on hover **and** focus. Supplements, never replaces, an accessible name. |
| `CodeBlock` | `code-block.tsx` | `code`, `title`, `prompt`, `copyLabel`, `copiedLabel`, `toastTitle`, `maxHeight` | Copy button with live label; `$` prompt glyphs aren't copied; toast when inside provider. App wrapper with i18n: `src/components/copy-button.tsx`. |
| `Stepper` | `stepper.tsx` | `items`, `current`, `onStepChange?`, `label` | `<nav>` + `<ol>`; current = `aria-current="step"`; completed show ✓ + sr-only “(completed)”. Compact on mobile (only the current label visible; others stay screen-reader text). |
| `EmptyState` | `empty-state.tsx` | `icon`, `title`, `description`, `action`, `tone` neutral·danger, `headingAs` | Danger tone = `role="alert"` for recoverable errors. |
| `Skeleton`, `Spinner` | `skeleton.tsx` | `className`; Spinner `label` | Wrap skeletons in `role="status"` with an sr-only label. |
| `Kbd`, `SearchIcon`, `cn`, `copyText` | `kbd.tsx`, `icons.tsx`, `cn.ts`, `copy.ts` | | Helpers. |

App-level composites built from these: `Header` (desktop nav, mobile sheet, theme/lang), `CommandPalette` (cmdk inside `Dialog`, **Ctrl/⌘ + K**), `SortableSteps` (dnd-kit), `StepCard`, `TemplateCard`, `AgentPanel`, `Builder` (4-stage wizard).

## 3. Adding a component

1. **Check first** — can an existing component + a variant do it? Prefer adding a variant over a new component.
2. **Create** `src/components/ui/<name>.tsx`. Add `"use client"` only if it uses state, effects, context or event handlers. Use a Radix primitive for anything with complex keyboard/focus behaviour (menus, popovers, comboboxes…).
3. **Style with tokens only** (`bg-surface`, `text-muted`, `border-border`, `focus-ring`, `motion-fast` …). No hex values, no `slate-*`/`indigo-*`, no `dark:`. Need a new colour role? Add `--nvx-<role>` to both `:root` and `.dark` in `tokens.css`, map it in `@theme inline`, list it in `src/lib/design-tokens.ts`.
4. **API conventions** — `variant` + `size` props with string unions and sensible defaults; accept `className` (merged last via `cn`); forward refs for form controls; spread remaining native props; user-visible strings (labels like “Close”) come in as props so callers can translate them.
5. **Export** it from `src/components/ui/index.ts`.
6. **Document** it on `/design`: add an entry to `SECTIONS` and a `<Section>` in `src/components/design-system.tsx` showing every variant/size/state, with bilingual title + description and a usage snippet. Add a row to the table above (EN + TH).
7. **Test** it in `tests/ui-components.test.tsx` (`// @vitest-environment jsdom`, Testing Library): role/name, keyboard behaviour, ARIA states. Run `npm run lint && npm run typecheck && npm test && npm run build`.

## 4. Accessibility rules

- **Semantics first.** Use real `<button>`, `<a href>`, `<label>`, `<fieldset>/<legend>`, headings in order (one `h1` per page). Lists of things are `<ul>/<ol>`.
- **Every control has an accessible name** — a visible label (`Field`, `Checkbox label`) or `aria-label` for icon-only buttons. Tooltips don't count.
- **Keyboard:** everything reachable with Tab, operable with Enter/Space, Esc closes overlays; never remove focus outlines — use `focus-ring`. Dialogs trap and return focus (Radix). Step reordering works without a mouse (drag handle → Space → ↑/↓ → Space, or the ↑/↓ buttons).
- **Contrast:** text ≥ 4.5:1, large text/focus ring ≥ 3:1, in **both** themes. `tests/tokens.test.ts` enforces this for the token pairs we use.
- **Don't rely on colour alone** — badges and states always include text or an icon + sr-only text.
- **Announce changes:** toasts and `aria-live` regions for copy/download/plan results; errors use `role="alert"`; loading regions set `aria-busy` and include `role="status"` text.
- **Motion:** use motion tokens; everything respects `prefers-reduced-motion`.
- **Language:** `<html lang>` follows the TH/EN toggle; every UI string exists in both languages (`src/lib/i18n.ts`).
- **Touch targets:** ≥ 32px (`size="sm"`), 40px default; mobile nav items are 48px tall.

---

## ภาษาไทย

NVX UI คือระบบดีไซน์ของ NVX Stack Builder ประกอบด้วย **design token** (ตัวแปร CSS → ธีม Tailwind), **ไลบรารีคอมโพเนนต์** ขนาดเล็กใน `src/components/ui` และ **คู่มือสไตล์แบบมีชีวิต** ที่ [`/design`](http://localhost:3000/design) ซึ่งแสดงโทเคนและคอมโพเนนต์ทุกแบบ ทั้งภาษาไทย/อังกฤษ และโหมดสว่าง/มืด

### 1. Design token

ค่าทั้งหมดอยู่ใน `src/app/tokens.css` เป็นตัวแปร `--nvx-*` โดย `.dark` เขียนทับเฉพาะค่าที่ต่างกัน ส่วน `globals.css` แมปเข้าธีม Tailwind เพื่อให้เขียน **utility เชิงความหมาย** แทนสีดิบ

- **พื้นผิว/ข้อความ:** `bg-bg`, `bg-surface`, `bg-surface-2/3`, `border-border(-strong)`, `text-fg`, `text-muted`, `text-subtle`
- **แบรนด์:** `bg-primary`, `hover:bg-primary-hover`, `text-primary-fg`, `bg-primary-soft text-primary-soft-fg`, `accent`, `ring`
- **สถานะ:** `success` / `warning` / `danger` / `info` พร้อม `-soft` (พื้น) และ `-fg` (ข้อความบนพื้น)
- **ธีมเทอร์มินัล (v0.4):** ค่าเริ่มต้นคือธีมสีดำแบบเทอร์มินัล/DOS สำหรับทุกคน (ไม่สนใจค่าสว่าง/มืดของระบบ) สีหลักเขียวฟอสฟอร์ `#33ff66` สีรองอำพัน สีข้อมูลฟ้าอมเขียว เส้นขอบ 1px และมุมโค้ง 1–4px ธีมสว่างแบบกระดาษยังเลือกได้จากปุ่มสลับ
- **โค้ด:** `bg-code-bg text-code-fg text-code-prompt` (เทอร์มินัลสีดำเสมอ)
- **มุมโค้ง:** xs 1px · sm/md 2px (ปุ่ม ช่องกรอก ป้าย) · lg 3px · xl 4px (การ์ด) — ไม่ใช้ `rounded-full`
- **ระยะห่าง:** หน่วยฐาน 4px (`p-1` = 4px) ใช้ 2/3/4/6/8 เป็นหลัก
- **เงา:** พื้นผิวแบน `shadow-sm` ไม่มีเงา · `shadow-md` เส้นเรืองแสง 1px (hover) · `shadow-lg` เพิ่มแสงเรืองจาง ๆ (หน้าต่าง/toast)
- **การเคลื่อนไหว:** 120 / 200 / 320ms, `ease-standard`, `ease-emphasized` และ utility `motion-fast`, `motion-base`, `animate-*`
- **ตัวอักษร:** เน้น monospace — IBM Plex Mono สำหรับหัวข้อ เมนู ปุ่ม ป้าย label และโค้ด, IBM Plex Sans สำหรับเนื้อหา และอักษรไทยใช้ IBM Plex Sans Thai ในทั้งสองสแต็กเพื่อให้อ่านง่าย สเกล: `text-display` 48px, `text-4xl` (h1), `text-2xl` (h2), `text-xl`, `text-base`, `text-sm`, `text-xs` — ภาษาไทยต้องใช้ระยะบรรทัด ≥ 1.5
- **ธีม:** คลาส `.dark` บน `<html>` ถูกเรนเดอร์จากเซิร์ฟเวอร์เป็นค่าเริ่มต้น และจะถูกถอดออกเฉพาะเมื่อผู้ใช้เลือกธีมสว่าง (`localStorage["nvx-theme"] = "light"`) คอมโพเนนต์ไม่ควรต้องใช้ `dark:` เลย — ถ้าจำเป็น ให้เพิ่ม/ปรับโทเคนแทน
- **ลดการเคลื่อนไหว:** เมื่อผู้ใช้ตั้ง `prefers-reduced-motion` ระยะเวลาทั้งหมดเป็น 0.01ms และเคอร์เซอร์จะหยุดกะพริบ
- **รายละเอียดเทอร์มินัล (ตกแต่งเท่านั้น):** `term-prompt` (`$ `), `term-section` (`> `), `term-eyebrow` (`// `), `term-dos` (`C:\NVX> `), `term-cursor` (เคอร์เซอร์กะพริบ), `term-bracket` (`[ ปุ่ม ]` ใส่ให้อัตโนมัติ), `term-statusbar`, `term-rule`, `term-glow`, `hero-glow` (ตารางจาง ๆ) และเส้น scanline แบบ CRT จาง ๆ โปรแกรมอ่านหน้าจอจะข้ามสัญลักษณ์เหล่านี้

### 2. คอมโพเนนต์

นำเข้าจาก `@/components/ui` ส่วนที่โต้ตอบได้สร้างบน **Radix UI** (headless และเข้าถึงได้)

- **Button** — 6 แบบ (primary, secondary, outline, soft, ghost, danger) × 4 ขนาด (sm, md, lg, icon), `loading` (ปิดใช้งาน + `aria-busy`), `asChild` สำหรับ Link; `buttonClasses()` ใช้ได้ใน Server Component
- **Input / Textarea / Select / Field / Label** — คอนโทรลเนทีฟ; `Field` ผูก id, คำใบ้, ข้อผิดพลาด (`aria-describedby`, `aria-invalid`, `role="alert"`)
- **Checkbox / Switch** (Radix) และ **Segmented** (กลุ่มเรดิโอเนทีฟ ใช้ลูกศรได้)
- **Card** (+ Header/Title/Description/Content/Footer, `interactive`, `as`) และ **Badge** 7 แบบ 2 ขนาด
- **Tabs** (Radix, ←/→), **Dialog** (กักโฟกัส, Esc, คืนโฟกัส; `side="right"` = แผ่นข้างสำหรับเมนูมือถือ)
- **Toast** (`useToast()`; default/success/error/info) และ **Tooltip** (เปิดทั้งตอนชี้และโฟกัส)
- **CodeBlock** — ปุ่มคัดลอกพร้อมป้ายที่เปลี่ยนสถานะ ไม่คัดลอกเครื่องหมาย `$` และแสดง toast
- **Stepper** — `aria-current="step"`, ขั้นที่เสร็จแสดง ✓, คลิกได้, แบบกะทัดรัดบนมือถือ
- **EmptyState** — อธิบายสถานะว่าง/ข้อผิดพลาดพร้อมปุ่มถัดไป (`tone="danger"` = `role="alert"`)
- **Skeleton / Spinner**, **Kbd**, **SearchIcon**

คอมโพเนนต์ระดับแอป: `Header` (เมนูเดสก์ท็อป/มือถือ), `CommandPalette` (**Ctrl/⌘ + K**), `SortableSteps` (ลากวางด้วย dnd-kit + คีย์บอร์ด), `StepCard`, `TemplateCard`, `AgentPanel`, `Builder` (วิซาร์ด 4 ขั้น)

### 3. วิธีเพิ่มคอมโพเนนต์ใหม่

1. ตรวจก่อนว่าใช้คอมโพเนนต์เดิม + เพิ่ม variant ได้หรือไม่
2. สร้าง `src/components/ui/<name>.tsx` ใส่ `"use client"` เฉพาะเมื่อมี state/effect/event; ใช้ Radix สำหรับพฤติกรรมคีย์บอร์ด/โฟกัสที่ซับซ้อน
3. ใช้ **โทเคนเท่านั้น** ห้ามใช้ hex, `slate-*`, `indigo-*` หรือ `dark:` — ถ้าต้องการสีใหม่ ให้เพิ่ม `--nvx-<role>` ทั้งใน `:root` และ `.dark`, แมปใน `@theme inline` และเพิ่มใน `src/lib/design-tokens.ts`
4. API: `variant` + `size` เป็น string union พร้อมค่าเริ่มต้น, รับ `className` (รวมด้วย `cn`), forward ref สำหรับฟอร์ม, ข้อความที่ผู้ใช้เห็นรับเป็น prop เพื่อแปลภาษาได้
5. export จาก `src/components/ui/index.ts`
6. เพิ่มตัวอย่างทุกแบบในหน้า `/design` (`src/components/design-system.tsx`) พร้อมชื่อ/คำอธิบายสองภาษาและโค้ดตัวอย่าง และอัปเดตตารางในเอกสารนี้
7. เขียนเทสต์ใน `tests/ui-components.test.tsx` (role/ชื่อ, คีย์บอร์ด, สถานะ ARIA) แล้วรัน `npm run lint && npm run typecheck && npm test && npm run build`

### 4. กฎการเข้าถึง (Accessibility)

- ใช้ HTML ที่ถูกความหมาย: `<button>`, `<a href>`, `<label>`, `<fieldset>/<legend>`, หัวข้อเรียงลำดับ (หนึ่ง `h1` ต่อหน้า)
- ทุกคอนโทรลต้องมีชื่อที่เข้าถึงได้ — ป้ายที่มองเห็น หรือ `aria-label` สำหรับปุ่มไอคอน (Tooltip ไม่นับ)
- ใช้งานด้วยคีย์บอร์ดได้ทั้งหมด: Tab, Enter/Space, Esc ปิดหน้าต่าง; ห้ามลบเส้นโฟกัส (ใช้ `focus-ring`); จัดลำดับขั้นตอนได้โดยไม่ใช้เมาส์ (ที่จับ → Space → ↑/↓ → Space หรือปุ่ม ↑/↓)
- คอนทราสต์: ข้อความ ≥ 4.5:1, ข้อความใหญ่/วงโฟกัส ≥ 3:1 ทั้งสองธีม (ตรวจอัตโนมัติใน `tests/tokens.test.ts`)
- ไม่สื่อความหมายด้วยสีอย่างเดียว
- ประกาศการเปลี่ยนแปลง: toast และ `aria-live` สำหรับคัดลอก/ดาวน์โหลด/ผลลัพธ์ AI, ข้อผิดพลาดใช้ `role="alert"`, ส่วนที่กำลังโหลดใช้ `aria-busy` + `role="status"`
- เคารพ `prefers-reduced-motion`, `<html lang>` ตามภาษาที่เลือก และทุกข้อความมีทั้งไทยและอังกฤษ
- พื้นที่แตะ ≥ 32px (ขนาด sm), ค่าเริ่มต้น 40px, เมนูมือถือสูง 48px
