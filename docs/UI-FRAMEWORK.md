# NVX UI — UI/UX Framework

> 🇹🇭 ภาษาไทยอยู่ด้านล่าง · Thai version below — [ไปที่ภาษาไทย](#ภาษาไทย)

NVX UI is the design system behind NVX Stack Builder: **design tokens** (CSS variables → Tailwind theme), a small **component library** in `src/components/ui`, and a **living style guide** at [`/design`](http://localhost:3000/design) that renders every token and component variant in Thai and English, in both themes.

**v0.5 Apple-inspired developer theme.** The look references [developer.apple.com](https://developer.apple.com/) and is black-first: pure-black canvas, grey surfaces separated by tone and hairline borders, big bold tightly tracked sans headlines, generous spacing, 12–22px radii, pill buttons, a restrained blue accent (filled `primary` CTA plus `link` text), and real tool logos as app-icon tiles. It's the default for everyone, whatever the OS colour preference. A light variant (Apple's `#f5f5f7` canvas) stays available from the theme toggle. The terminal flavour is now limited to code windows: `$` prompts, macOS traffic lights, a blinking cursor in the hero.

```
src/app/tokens.css          ← token values (.dark = default black theme, :root = light variant)
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
| Surfaces | `bg` (#000), `surface`, `surface-2`, `surface-3`, `raised` (selected segment/tab), `border`, `border-strong` | `bg-bg`, `bg-surface`, `bg-surface-2`, `border-border`, `border-border-strong` |
| Text | `fg`, `muted`, `subtle` | `text-fg`, `text-muted`, `text-subtle` |
| Brand | `primary` `#0071e3`, `primary-hover`, `primary-fg`, `primary-soft`, `primary-soft-fg`, `link` (`#2997ff` dark / `#0066cc` light), `accent`, `ring`, `brand-pink` `#fb0fab` + `brand-glow` (mascot only, decorative) | `bg-primary text-primary-fg` for filled CTAs, **`text-link` for blue text** (never `text-primary`: `#0071e3` is not AA on black), `ring-ring` |
| Status | `success`/`warning`/`danger`/`info` + `-soft` + `-fg` (`danger-hover`) | `bg-success-soft text-success-fg`, `bg-danger` … |
| Code | `code-bg`, `code-fg`, `code-prompt` (terminal green), `code-muted`, `code-border`, `chrome-close/min/zoom` (traffic lights) — always dark | `bg-code-bg text-code-fg text-code-prompt` |
| Decoration | `glow-1`, `glow-2`, `tile-top`, `tile-bottom`, `tile-edge`, `tile-sheen` | `.hero-glow` (soft blue/purple radial glows), `.tool-tile` (app-icon tile), `.nav-glass` (translucent header) |
| Overlay | `overlay` | `bg-overlay` |
| Radius | xs 4px · sm 6px · md 10px · lg 12px · xl 18px · 2xl 22px · full | `rounded-md` (inputs, badges), `rounded-xl` (cards, code windows), `rounded-full` (buttons, chips, switches) |
| Spacing | 4px base unit (`--spacing: 0.25rem`) | `p-1` = 4px, `gap-4` = 16px — prefer 2/3/4/6/8 |
| Shadow | dark: surfaces separate by tone + hairline, `shadow-md` soft drop on hover, `shadow-lg` dialogs/toasts; light: soft Apple-style shadows | `shadow-sm` … |
| Motion | `duration-fast` 120ms, `duration-base` 200ms, `duration-slow` 320ms, `ease-standard`, `ease-emphasized` | `motion-fast`, `motion-base`, `animate-fade-in`, `animate-pop-in`, `animate-slide-in`, `animate-sheet-in` |
| Focus | — | `focus-ring` utility (2px `ring` outline on `:focus-visible`) |

**Typography.** `font-sans` = **Inter** (SF-like) → **IBM Plex Sans Thai** → system UI, for headlines, body, nav and buttons. `font-mono` = **IBM Plex Mono** → Plex Sans Thai, **only** for `code`/`pre`/`kbd`/`samp`, commands and small tags (badge `sm`). Headlines are bold with tight tracking (`tracking-tighter` −0.03em); Thai headings automatically get `letter-spacing: 0` and line-height 1.3. Scale: `text-display` 64px (hero, 44px on mobile), `text-4xl`/`sm:text-5xl` (page h1), `text-3xl`/`sm:text-[40px]` (section h2), `text-xl` (stage titles), `text-base`/17px (body), `text-sm` (UI), `text-xs` (captions/badges). Thai needs line-height ≥ 1.5 for body — don't use `leading-none`/`leading-tight` on Thai body text. Links use the `link` utility (`text-link`, underline on hover).

**Theme.** The black theme is the `.dark` class on `<html>`. It's rendered by the server and is the **default**. The inline pre-paint script only removes it when `localStorage["nvx-theme"] === "light"` (the toggle), and the OS `prefers-color-scheme` is deliberately ignored. Because components only use semantic tokens, nothing in a component should ever need a `dark:` variant — if you reach for one, add/adjust a token instead.

**Reduced motion.** Under `prefers-reduced-motion: reduce` all durations become 0.01ms and animations are disabled. The hero cursor stays visible but stops blinking.

**Icons.** No emoji anywhere in the UI.

- **Tool logos** (Node.js, npm, pnpm, Yarn, Python, PyPI, uv, Next.js, React, Vite, Express, FastAPI, Streamlit, TypeScript, Tailwind, Docker, GitHub Actions, Vitest, ESLint, pytest, Ruff, …) come from [simple-icons](https://simpleicons.org) (CC0 data). `scripts/gen-brand-icons.mjs` copies only the icons we use into `src/components/brand/brand-icons.data.ts` (run `node scripts/gen-brand-icons.mjs` after adding an id) so the bundle stays small. Logos are trademarks of their owners, used only to identify the tools (see `NOTICE`). OpenAI isn't in simple-icons, so AI features use a generic `ai` tile (lucide Sparkles).
- `src/components/brand/tool-icon.tsx`:
  - `<ToolTile id size="sm|md|lg" />` is an app-icon tile (28/40/56px, radius 8/11/15px) with the logo in its official colour. Use it on template cards, template detail, builder pick-lists and step cards.
  - `<ToolIcon id colored? />` is an inline 1em mark, `currentColor` by default (tags, badges, segmented options).
  - Helpers: `templateTool(t)`, `tagTool(tag)`, `commandTool(commands)` (first known CLI → logo, else `terminal`), `addonTool(id, runtimes)`.
- **UI icons** are [lucide-react](https://lucide.dev) line icons (`h-4 w-4`, `aria-hidden`; icon-only buttons keep an `aria-label`).

**Code windows (the remaining terminal touch).** `CodeBlock` and the hero card use `code-bg`, macOS traffic lights (`chrome-*` tokens), a `$` prompt in `code-prompt` green, and `term-cursor` (blinking block cursor, `aria-hidden`, static under reduced motion). The v0.4 `term-prompt`/`term-section`/`term-dos`/`term-bracket`/scanline classes were removed.

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

**Brand mascot** (`src/components/brand/mascot.tsx`, `<Mascot size interactive? label? />`): the pink blob logo as a living character. It is an eyeless body image (`public/brand/mascot-body-*`) with two glossy capsule eyes drawn in SVG on the same 1024 grid. CSS animations (`.nvx-mascot*` in `globals.css`): idle float + breathing, a single and a double blink per cycle, and a squish on hover/click (`interactive`). With `interactive`, the eyes follow a mouse pointer (`(hover: hover) and (pointer: fine)` only, throttled with requestAnimationFrame). The mascot is fully static under `prefers-reduced-motion` and decorative (`aria-hidden`) unless you pass `label`. The header uses 28px (float + blink); the home hero uses 112px (84px on mobile) in the empty corner of the code window. The pink is **never** used for text, buttons, links or focus: the interactive system stays blue. Assets, favicon, app icons and the OG card come from `scripts/gen-brand-assets.py`.

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
- **แบรนด์:** `bg-primary text-primary-fg` (ปุ่มหลักสีฟ้า `#0071e3`), `text-link` สำหรับข้อความ/ลิงก์สีฟ้า (`#2997ff` ธีมดำ / `#0066cc` ธีมสว่าง — ห้ามใช้ `text-primary` กับข้อความ เพราะไม่ผ่าน AA บนพื้นดำ), `bg-primary-soft text-primary-soft-fg`, `accent`, `ring`; `--nvx-brand-pink` / `--nvx-brand-glow` ใช้กับมาสคอตเท่านั้น
- **สถานะ:** `success` / `warning` / `danger` / `info` พร้อม `-soft` (พื้น) และ `-fg` (ข้อความบนพื้น)
- **ธีม v0.5 (อ้างอิง developer.apple.com):** ค่าเริ่มต้นคือธีมดำสำหรับทุกคน (ไม่สนใจค่าสว่าง/มืดของระบบ) พื้นดำสนิท พื้นผิวสีเทาแยกด้วยน้ำหนักสีและเส้นขอบบาง หัวข้อตัวใหญ่หนา เว้นระยะกว้าง มุมโค้ง 12–22px ปุ่มทรงแคปซูล สีฟ้าใช้อย่างจำกัด และโลโก้เครื่องมือจริงเป็นไทล์แบบไอคอนแอป ธีมสว่าง (พื้น `#f5f5f7`) ยังเลือกได้จากปุ่มสลับ
- **โค้ด:** `bg-code-bg text-code-fg text-code-prompt` (มืดเสมอ มีไฟสามสีแบบ macOS และ prompt `$` สีเขียว)
- **มุมโค้ง:** xs 4px · sm 6px · md 10px (ช่องกรอก ป้าย) · lg 12px · xl 18px (การ์ด หน้าต่างโค้ด) · 2xl 22px · `rounded-full` (ปุ่ม ชิป สวิตช์)
- **ระยะห่าง:** หน่วยฐาน 4px (`p-1` = 4px) ใช้ 2/3/4/6/8 เป็นหลัก
- **เงา:** ธีมดำแยกพื้นผิวด้วยน้ำหนักสีและเส้นขอบ · `shadow-md` เงานุ่มเมื่อชี้ · `shadow-lg` หน้าต่าง/toast · ธีมสว่างใช้เงานุ่มแบบ Apple
- **การเคลื่อนไหว:** 120 / 200 / 320ms, `ease-standard`, `ease-emphasized` และ utility `motion-fast`, `motion-base`, `animate-*`
- **ตัวอักษร:** Inter (แนวเดียวกับ SF) สำหรับหัวข้อ เนื้อหา เมนู และปุ่ม, IBM Plex Sans Thai สำหรับอักษรไทย (หัวข้อภาษาไทยใช้ระยะตัวอักษร 0 และบรรทัด 1.3 อัตโนมัติ), IBM Plex Mono ใช้**เฉพาะ**โค้ด คำสั่ง และป้ายเล็ก สเกล: `text-display` 64px (มือถือ 44px), `text-4xl`/`sm:text-5xl` (h1), `text-3xl`/`sm:text-[40px]` (h2), `text-xl`, `text-base`, `text-sm`, `text-xs` — เนื้อหาภาษาไทยต้องใช้ระยะบรรทัด ≥ 1.5
- **ธีม:** คลาส `.dark` บน `<html>` ถูกเรนเดอร์จากเซิร์ฟเวอร์เป็นค่าเริ่มต้น และจะถูกถอดออกเฉพาะเมื่อผู้ใช้เลือกธีมสว่าง (`localStorage["nvx-theme"] = "light"`) คอมโพเนนต์ไม่ควรต้องใช้ `dark:` เลย — ถ้าจำเป็น ให้เพิ่ม/ปรับโทเคนแทน
- **ลดการเคลื่อนไหว:** เมื่อผู้ใช้ตั้ง `prefers-reduced-motion` ระยะเวลาทั้งหมดเป็น 0.01ms และเคอร์เซอร์จะหยุดกะพริบ
- **ไอคอน:** ไม่ใช้อีโมจิ โลโก้เครื่องมือ (Node.js, npm, Python, Next.js, React, Vite, FastAPI, Docker ฯลฯ) มาจาก simple-icons (ข้อมูล CC0) ผ่าน `scripts/gen-brand-icons.mjs` → `src/components/brand/brand-icons.data.ts` ใช้ `<ToolTile>` (ไทล์ไอคอนแอป สีทางการ) และ `<ToolIcon>` (โลโก้ในบรรทัด) จาก `src/components/brand/tool-icon.tsx` โลโก้เป็นเครื่องหมายการค้าของเจ้าของ ใช้เพื่อระบุเครื่องมือเท่านั้น (ดู `NOTICE`) OpenAI ไม่มีใน simple-icons จึงใช้ไทล์ `ai` ทั่วไปแทน ไอคอน UI อื่นใช้ lucide-react
- **รายละเอียดเทอร์มินัลที่เหลือ:** เฉพาะหน้าต่างโค้ด — prompt `$`, ไฟสามสี และ `term-cursor` (เคอร์เซอร์กะพริบ หยุดนิ่งเมื่อลดการเคลื่อนไหว) คลาส `term-prompt`/`term-section`/`term-dos`/`term-bracket` และ scanline ถูกนำออกแล้ว

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

**มาสคอตแบรนด์** (`src/components/brand/mascot.tsx`): โลโก้ก้อนสีชมพูที่ขยับได้ ประกอบด้วยภาพตัวที่ลบตาออก และตาแคปซูลมันวาวสองข้างวาดด้วย SVG ทำให้กะพริบตาและกลอกตาได้ แอนิเมชันเป็น CSS ล้วน: ลอยและหายใจ กะพริบตาแบบครั้งเดียวและสองครั้งต่อรอบ และเด้งยุบเมื่อชี้หรือคลิก (`interactive`) ตามองตามเมาส์เฉพาะอุปกรณ์ที่มี pointer ละเอียด หยุดนิ่งทั้งหมดเมื่อผู้ใช้ตั้ง `prefers-reduced-motion` ใน header ใช้ขนาด 28px (ลอยและกะพริบเท่านั้น) ส่วน hero หน้าแรกใช้ 112px (มือถือ 84px) วางในมุมว่างของหน้าต่างโค้ด สี `brand-pink` `#fb0fab` ใช้ตกแต่งเท่านั้น ห้ามใช้กับข้อความ ปุ่ม หรือลิงก์

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
