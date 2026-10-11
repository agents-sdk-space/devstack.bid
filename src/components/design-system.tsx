"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { COLOR_GROUPS, MOTION, RADII, SHADOWS, SPACING, TYPE_SCALE } from "@/lib/design-tokens";
import {
  Badge,
  type BadgeVariant,
  Button,
  type ButtonSize,
  type ButtonVariant,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  CodeBlock,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
  EmptyState,
  Field,
  Input,
  Kbd,
  Segmented,
  Select,
  Skeleton,
  Spinner,
  Stepper,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  Tooltip,
  useToast,
} from "@/components/ui";
import { ArrowUp, Blocks, Copy, Download, Languages, LayoutGrid, Link2, Moon, RotateCw, SearchX, ShieldCheck, Sparkles, Sun, Trash2, TriangleAlert } from "lucide-react";
import { Mascot } from "./brand/mascot";
import { SIGNATURE_COMMANDS, TerminalSignature } from "./brand/terminal-signature";
import { ToolTile } from "./brand/tool-icon";
import { useLang } from "./prefs";

type Bi = { en: string; th: string };

const SECTIONS: { id: string; title: Bi; group: "tokens" | "components" }[] = [
  { id: "colors", title: { en: "Colour", th: "สี" }, group: "tokens" },
  { id: "typography", title: { en: "Typography", th: "ตัวอักษร" }, group: "tokens" },
  { id: "spacing", title: { en: "Spacing & radius", th: "ระยะห่างและมุมโค้ง" }, group: "tokens" },
  { id: "elevation", title: { en: "Elevation & motion", th: "เงาและการเคลื่อนไหว" }, group: "tokens" },
  { id: "button", title: { en: "Button", th: "ปุ่ม" }, group: "components" },
  { id: "inputs", title: { en: "Input, Textarea, Select", th: "ช่องกรอกข้อมูล" }, group: "components" },
  { id: "choice", title: { en: "Checkbox, Switch, Segmented", th: "ตัวเลือก" }, group: "components" },
  { id: "card", title: { en: "Card", th: "การ์ด" }, group: "components" },
  { id: "badge", title: { en: "Badge", th: "ป้าย" }, group: "components" },
  { id: "tabs", title: { en: "Tabs", th: "แท็บ" }, group: "components" },
  { id: "dialog", title: { en: "Dialog & Sheet", th: "หน้าต่างโต้ตอบ" }, group: "components" },
  { id: "toast", title: { en: "Toast", th: "การแจ้งเตือน (Toast)" }, group: "components" },
  { id: "tooltip", title: { en: "Tooltip & Kbd", th: "คำแนะนำและปุ่มลัด" }, group: "components" },
  { id: "codeblock", title: { en: "CodeBlock", th: "บล็อกโค้ด" }, group: "components" },
  { id: "stepper", title: { en: "Stepper", th: "ตัวแสดงขั้นตอน" }, group: "components" },
  { id: "empty", title: { en: "EmptyState", th: "สถานะว่าง" }, group: "components" },
  { id: "skeleton", title: { en: "Skeleton & Spinner", th: "โครงร่างระหว่างโหลด" }, group: "components" },
  { id: "icons", title: { en: "Icons & tool tiles", th: "ไอคอนและไทล์เครื่องมือ" }, group: "components" },
  { id: "mascot", title: { en: "Brand mascot", th: "มาสคอตของแบรนด์" }, group: "components" },
  { id: "signature", title: { en: "DevStack signature", th: "ซิกเนเจอร์ DevStack" }, group: "components" },
];

function Section({ id, title, description, usage, children }: { id: string; title: Bi; description: Bi; usage?: string; children: ReactNode }) {
  const { lang } = useLang();
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-24 border-t border-border pt-10">
      <h2 id={`${id}-h`} className="text-2xl font-bold tracking-tight text-fg">
        {title[lang]}
      </h2>
      <p className="mt-1 max-w-3xl text-muted">{description[lang]}</p>
      <div className="mt-5">{children}</div>
      {usage && (
        <details className="mt-4">
          <summary className="focus-ring inline-block cursor-pointer rounded text-sm font-medium text-link">{lang === "th" ? "ตัวอย่างโค้ด" : "Usage"}</summary>
          <CodeBlock code={usage} title="tsx" className="mt-2" />
        </details>
      )}
    </section>
  );
}

function Demo({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-5 ${className}`}>{children}</div>;
}

const SHADOW_CLASS = { sm: "shadow-sm", md: "shadow-md", lg: "shadow-lg" } as const;
const BUTTON_VARIANTS: ButtonVariant[] = ["primary", "secondary", "outline", "soft", "ghost", "danger"];
const BUTTON_SIZES: ButtonSize[] = ["sm", "md", "lg"];
const BADGE_VARIANTS: BadgeVariant[] = ["neutral", "primary", "success", "warning", "danger", "info", "outline"];

export function DesignSystem() {
  const { lang } = useLang();
  const toast = useToast();
  const L = (b: Bi) => b[lang];
  const [step, setStep] = useState(1);
  const [checked, setChecked] = useState(true);
  const [on, setOn] = useState(false);
  const [pm, setPm] = useState<"npm" | "pnpm" | "yarn">("pnpm");
  const [email, setEmail] = useState("nvx@");

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <header className="max-w-3xl">
        <Badge variant="primary">NVX UI · v0.5</Badge>
        <h1 className="mt-4 text-4xl font-bold tracking-tighter text-fg sm:text-5xl">{L({ en: "Design system", th: "ระบบดีไซน์" })}</h1>
        <p className="mt-3 text-lg text-muted">
          {L({
            en: "Living style guide for NVX Stack Builder: semantic design tokens (black-first theme referencing developer.apple.com, with a light theme on the toggle) and accessible, headless-based components. Everything below is rendered with the real components — switch theme or language in the header to see them adapt.",
            th: "คู่มือสไตล์แบบมีชีวิตของ NVX Stack Builder: design token เชิงความหมาย (ธีมดำเป็นค่าเริ่มต้นโดยอ้างอิง developer.apple.com และมีธีมสว่างจากปุ่มสลับ) และคอมโพเนนต์ที่เข้าถึงได้ สร้างบน headless primitives ทุกอย่างด้านล่างเรนเดอร์ด้วยคอมโพเนนต์จริง ลองสลับธีมหรือภาษาที่ส่วนหัวเพื่อดูการปรับตัว",
          })}
        </p>
        <p className="mt-3 text-sm text-subtle">
          {L({ en: "Source:", th: "ซอร์ส:" })} <code className="font-mono">src/app/tokens.css</code> · <code className="font-mono">src/components/ui/</code> ·{" "}
          <code className="font-mono">docs/UI-FRAMEWORK.md</code>
        </p>
      </header>

      <div className="mt-10 grid gap-10 lg:grid-cols-[200px_1fr]">
        <nav aria-label={L({ en: "Style guide sections", th: "หมวดในคู่มือ" })} className="lg:sticky lg:top-20 lg:h-fit">
          {(["tokens", "components"] as const).map((g) => (
            <div key={g} className="mb-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-subtle">
                {g === "tokens" ? L({ en: "Tokens", th: "โทเคน" }) : L({ en: "Components", th: "คอมโพเนนต์" })}
              </p>
              <ul className="flex flex-wrap gap-1 lg:block lg:space-y-0.5">
                {SECTIONS.filter((s) => s.group === g).map((s) => (
                  <li key={s.id}>
                    <a href={`#${s.id}`} className="focus-ring motion-fast block rounded-md px-2 py-1 text-sm text-muted hover:bg-surface-2 hover:text-fg">
                      {L(s.title)}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="min-w-0 space-y-10">
          {/* ───────────── Tokens ───────────── */}
          <Section
            id="colors"
            title={SECTIONS[0].title}
            description={{
              en: "Semantic colour tokens. Components never use raw palette colours, so dark mode is just a different set of variable values.",
              th: "โทเคนสีเชิงความหมาย คอมโพเนนต์ไม่ใช้สีดิบโดยตรง โหมดมืดจึงเป็นแค่ชุดค่าตัวแปรอีกชุดหนึ่ง",
            }}
            usage={`<div className="bg-surface text-fg border border-border">…</div>\n<p className="text-muted">Secondary text</p>\n<button className="bg-primary text-primary-fg hover:bg-primary-hover">…</button>`}
          >
            <div className="space-y-6">
              {COLOR_GROUPS.map((group) => (
                <div key={group.id}>
                  <h3 className="mb-2 text-sm font-semibold text-fg">{L(group)}</h3>
                  <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {group.tokens.map((tok) => (
                      <li key={tok.name} className="flex items-center gap-3 rounded-lg border border-border bg-surface p-2.5">
                        <span aria-hidden className="h-10 w-10 shrink-0 rounded-md border border-border" style={{ background: `var(--nvx-${tok.name})` }} />
                        <span className="min-w-0">
                          <span className="block font-mono text-xs font-semibold text-fg">--nvx-{tok.name}</span>
                          <span className="block truncate text-xs text-subtle">
                            {L(tok)} · <code>{tok.utility}</code>
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Section>

          <Section
            id="typography"
            title={SECTIONS[1].title}
            description={{
              en: "Inter (an SF-like grotesk) for headlines and body; bold, tightly tracked display type for heroes and page titles. IBM Plex Sans Thai covers Thai glyphs (Thai headings use looser tracking and taller line-height). IBM Plex Mono is only for code, commands and small tags. The one terminal touch left is the code window: $ prompts and a blinking cursor in the hero (static under reduced motion).",
              th: "Inter (ฟอนต์แนวเดียวกับ SF) สำหรับหัวข้อและเนื้อหา ตัวหัวข้อใหญ่หนาและชิดสำหรับ hero และหัวข้อหน้า IBM Plex Sans Thai สำหรับอักษรไทย (หัวข้อภาษาไทยใช้ระยะตัวอักษรปกติและบรรทัดสูงขึ้น) IBM Plex Mono ใช้เฉพาะโค้ด คำสั่ง และป้ายเล็ก รายละเอียดแบบเทอร์มินัลที่เหลืออยู่คือหน้าต่างโค้ด: prompt $ และเคอร์เซอร์กะพริบใน hero (หยุดนิ่งเมื่อลดการเคลื่อนไหว)",
            }}
            usage={`<h1 className="text-5xl font-bold tracking-tighter">…</h1>\n<h2 className="text-3xl font-semibold tracking-tight">…</h2>\n<p className="text-lg text-muted">…</p>\n<a className="link">Learn more</a>\n<code className="font-mono">npm install</code>`}
          >
            <Card>
              <ul className="divide-y divide-border">
                {TYPE_SCALE.map((ty) => (
                  <li key={ty.utility} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-baseline sm:gap-6">
                    <span className="w-40 shrink-0 font-mono text-xs text-subtle">
                      {ty.utility} · {ty.px}px
                    </span>
                    <span className={`${ty.utility} min-w-0 truncate font-semibold text-fg`}>{lang === "th" ? "สร้างสแต็กให้รันได้จริง" : "Runnable stacks"}</span>
                    <span className="text-xs text-subtle sm:ml-auto">{L(ty)}</span>
                  </li>
                ))}
              </ul>
              <CardFooter className="flex-col items-start gap-1 py-4">
                <p className="font-sans text-fg">Sans · The quick brown fox · ภาษาไทยอ่านง่าย สบายตา ๑๒๓</p>
                <p className="font-mono text-sm text-fg">Mono · npx create-next-app@latest --ts · ภาษาไทย</p>
                <p className="text-sm">
                  <a href="#typography" className="link">
                    {L({ en: "Link style · underline on hover", th: "รูปแบบลิงก์ · ขีดเส้นใต้เมื่อชี้" })}
                  </a>
                </p>
                <p className="rounded-md bg-code-bg px-2 py-1 font-mono text-sm text-code-fg">
                  <span className="text-code-prompt">$</span> npm run dev
                  <span aria-hidden className="term-cursor" />
                </p>
              </CardFooter>
            </Card>
          </Section>

          <Section
            id="spacing"
            title={SECTIONS[2].title}
            description={{
              en: "A 4px spacing unit (p-1 = 4px). Prefer 2, 3, 4, 6, 8 for UI gaps, and generous section padding (py-20 to py-24). Apple-like corners: md 10px for inputs, xl 18px for cards, 2xl 22px for large tiles; buttons and chips are pills (rounded-full).",
              th: "หน่วยระยะห่าง 4px (p-1 = 4px) ใช้ 2, 3, 4, 6, 8 สำหรับช่องว่างใน UI และเว้นระยะส่วนต่าง ๆ กว้าง (py-20 ถึง py-24) มุมโค้งแบบ Apple: md 10px สำหรับช่องกรอก, xl 18px สำหรับการ์ด, 2xl 22px สำหรับไทล์ใหญ่ ส่วนปุ่มและชิปเป็นทรงแคปซูล (rounded-full)",
            }}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Demo className="flex-col items-stretch">
                {SPACING.map((n) => (
                  <div key={n} className="flex items-center gap-3">
                    <span className="w-16 font-mono text-xs text-subtle">
                      {n} · {n * 4}px
                    </span>
                    <span className="h-3 rounded-sm bg-primary" style={{ width: `${n * 4}px` }} />
                  </div>
                ))}
              </Demo>
              <Demo className="justify-around">
                {RADII.map((r) => (
                  <div key={r.name} className="text-center">
                    <div className={`h-14 w-14 border-2 border-primary bg-primary-soft ${r.utility}`} />
                    <p className="mt-1 font-mono text-xs text-subtle">{r.name}</p>
                  </div>
                ))}
              </Demo>
            </div>
          </Section>

          <Section
            id="elevation"
            title={SECTIONS[3].title}
            description={{
              en: "Black-first surfaces separate by tone and hairline borders rather than shadow: sm is none in dark, md is a soft drop on hover, lg for dialogs and toasts. Motion uses three durations and two easings, and all animation is disabled under prefers-reduced-motion.",
              th: "พื้นผิวในธีมดำแยกกันด้วยน้ำหนักสีและเส้นขอบบาง ๆ แทนเงา: sm ไม่มีเงาในธีมดำ, md เป็นเงานุ่มเมื่อชี้, lg สำหรับหน้าต่างและ toast การเคลื่อนไหวมีสามระยะเวลาและสอง easing และถูกปิดทั้งหมดเมื่อผู้ใช้ตั้ง prefers-reduced-motion",
            }}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Demo className="justify-around bg-bg">
                {SHADOWS.map((s) => (
                  <div key={s} className={`grid h-20 w-24 place-items-center rounded-lg bg-surface font-mono text-xs text-muted ${SHADOW_CLASS[s]}`}>
                    shadow-{s}
                  </div>
                ))}
              </Demo>
              <Card>
                <ul className="divide-y divide-border text-sm">
                  {MOTION.map((m) => (
                    <li key={m.name} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                      <code className="font-mono text-xs text-fg">--nvx-{m.name}</code>
                      <span className="font-mono text-xs text-subtle">{m.value}</span>
                      <span className="ml-auto text-xs text-muted">{L(m)}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          </Section>

          {/* ───────────── Components ───────────── */}
          <Section
            id="button"
            title={SECTIONS[4].title}
            description={{
              en: "Six variants × four sizes. One primary button per view. `loading` shows a spinner and sets aria-busy; `asChild` styles a Link; icon-only buttons need an aria-label.",
              th: "6 แบบ × 4 ขนาด ควรมีปุ่ม primary เพียงปุ่มเดียวต่อหน้าจอ `loading` แสดงสปินเนอร์และตั้ง aria-busy, `asChild` ใช้สไตล์กับ Link, ปุ่มไอคอนอย่างเดียวต้องมี aria-label",
            }}
            usage={`<Button>Save</Button>\n<Button variant="secondary" size="sm">Cancel</Button>\n<Button loading>Planning…</Button>\n<Button variant="ghost" size="icon" aria-label="Remove"><Trash2 /></Button>\n<Button asChild><Link href="/builder">Open</Link></Button>`}
          >
            <div className="space-y-3">
              {BUTTON_SIZES.map((size) => (
                <Demo key={size}>
                  <span className="w-8 font-mono text-xs text-subtle">{size}</span>
                  {BUTTON_VARIANTS.map((v) => (
                    <Button key={v} variant={v} size={size}>
                      {v}
                    </Button>
                  ))}
                </Demo>
              ))}
              <Demo>
                <Button loading>{L({ en: "Loading", th: "กำลังโหลด" })}</Button>
                <Button disabled>{L({ en: "Disabled", th: "ปิดใช้งาน" })}</Button>
                <Button variant="ghost" size="icon" aria-label={L({ en: "Remove", th: "ลบ" })}>
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
                <Button asChild variant="outline">
                  <Link href="/builder">asChild → /builder</Link>
                </Button>
              </Demo>
            </div>
          </Section>

          <Section
            id="inputs"
            title={SECTIONS[5].title}
            description={{
              en: "Native form controls with token styling. Always pair with a visible label — `Field` wires up id, hint and error (aria-describedby, aria-invalid, role=alert).",
              th: "ฟอร์มคอนโทรลแบบเนทีฟพร้อมสไตล์จากโทเคน ต้องมีป้ายกำกับที่มองเห็นได้เสมอ — `Field` ผูก id, คำใบ้ และข้อผิดพลาดให้อัตโนมัติ",
            }}
            usage={`<Field label="Email" hint="We never share it" error={error}>\n  {(p) => <Input {...p} invalid={!!error} type="email" />}\n</Field>`}
          >
            <Demo className="grid items-start gap-4 md:grid-cols-2">
              <Field label={L({ en: "Project name", th: "ชื่อโปรเจกต์" })} hint="a-z 0-9 - _ .">
                {(p) => <Input {...p} defaultValue="nvx-dashboard" className="font-mono" />}
              </Field>
              <Field
                label="Email"
                error={email.includes(".") ? undefined : L({ en: "Enter a valid email address", th: "กรุณากรอกอีเมลให้ถูกต้อง" })}
              >
                {(p) => <Input {...p} type="email" invalid={!email.includes(".")} value={email} onChange={(e) => setEmail(e.target.value)} />}
              </Field>
              <Field label={L({ en: "Node.js version", th: "เวอร์ชัน Node.js" })}>
                {(p) => (
                  <Select {...p} defaultValue="lts">
                    <option value="lts">LTS</option>
                    <option value="24">Node 24</option>
                    <option value="22">Node 22</option>
                  </Select>
                )}
              </Field>
              <Field label={L({ en: "Describe your app", th: "อธิบายแอปของคุณ" })}>
                {(p) => <Textarea {...p} rows={2} placeholder={L({ en: "A realtime notes app…", th: "แอปจดโน้ตเรียลไทม์…" })} />}
              </Field>
              <div className="flex flex-wrap items-center gap-2 md:col-span-2">
                <Input size="sm" placeholder="size sm" aria-label="size sm" className="w-32" />
                <Input size="md" placeholder="size md" aria-label="size md" className="w-32" />
                <Input size="lg" placeholder="size lg" aria-label="size lg" className="w-32" />
                <Input disabled placeholder="disabled" aria-label="disabled" className="w-32" />
              </div>
            </Demo>
          </Section>

          <Section
            id="choice"
            title={SECTIONS[6].title}
            description={{
              en: "Checkbox and Switch are Radix primitives (keyboard + screen-reader ready). Segmented is a styled native radio group: arrow keys move the selection.",
              th: "Checkbox และ Switch สร้างบน Radix (รองรับคีย์บอร์ดและโปรแกรมอ่านหน้าจอ) Segmented คือกลุ่มปุ่มเรดิโอเนทีฟ ใช้ลูกศรเลื่อนตัวเลือกได้",
            }}
            usage={`<Checkbox label="Docker" checked={on} onCheckedChange={setOn} />\n<Switch label="Dark mode" checked={dark} onCheckedChange={setDark} />\n<Segmented legend="Package manager" value={pm} onChange={setPm}\n  options={[{ value: "npm", label: "npm" }, { value: "pnpm", label: "pnpm" }]} />`}
          >
            <Demo className="items-start gap-8">
              <div className="space-y-2">
                <Checkbox label="Docker" checked={checked} onCheckedChange={setChecked} />
                <Checkbox label="GitHub Actions CI" description={L({ en: "Lint + test on every push", th: "lint + test ทุกครั้งที่ push" })} checked={false} onCheckedChange={() => {}} />
                <Checkbox label="Tailwind" description={L({ en: "not available for this template", th: "ใช้ไม่ได้กับเทมเพลตนี้" })} disabled checked={false} onCheckedChange={() => {}} />
              </div>
              <Switch label={L({ en: "Use my own API key", th: "ใช้ API key ของฉัน" })} checked={on} onCheckedChange={setOn} />
              <Segmented
                legend={L({ en: "JS package manager", th: "ตัวจัดการแพ็กเกจ JS" })}
                value={pm}
                onChange={setPm}
                options={[
                  { value: "npm", label: "npm" },
                  { value: "pnpm", label: "pnpm" },
                  { value: "yarn", label: "yarn" },
                ]}
              />
            </Demo>
          </Section>

          <Section
            id="card"
            title={SECTIONS[7].title}
            description={{
              en: "The main container. Compose with CardHeader/Title/Description/Content/Footer. `interactive` adds hover lift for clickable cards; pick the heading level with `as`.",
              th: "กล่องหลักของ UI ประกอบด้วย CardHeader/Title/Description/Content/Footer ใช้ `interactive` กับการ์ดที่คลิกได้ และเลือกระดับหัวข้อด้วย `as`",
            }}
            usage={`<Card interactive>\n  <CardHeader><CardTitle as="h3">Title</CardTitle><CardDescription>…</CardDescription></CardHeader>\n  <CardContent>…</CardContent>\n  <CardFooter><Button size="sm">Action</Button></CardFooter>\n</Card>`}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>{L({ en: "Next.js Dashboard", th: "แดชบอร์ด Next.js" })}</CardTitle>
                  <CardDescription>{L({ en: "Static card with header, content and footer.", th: "การ์ดปกติพร้อมส่วนหัว เนื้อหา และส่วนท้าย" })}</CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-muted">12 {L({ en: "steps", th: "ขั้นตอน" })} · Node.js</CardContent>
                <CardFooter>
                  <Button size="sm">{L({ en: "Open in builder", th: "เปิดในตัวสร้าง" })}</Button>
                  <Button size="sm" variant="ghost">
                    {L({ en: "View steps", th: "ดูขั้นตอน" })}
                  </Button>
                </CardFooter>
              </Card>
              <Card interactive>
                <CardHeader>
                  <CardTitle>interactive</CardTitle>
                  <CardDescription>{L({ en: "Hover me — lifts with shadow-md.", th: "ลองชี้ — การ์ดจะยกขึ้นพร้อม shadow-md" })}</CardDescription>
                </CardHeader>
                <CardContent />
              </Card>
            </div>
          </Section>

          <Section
            id="badge"
            title={SECTIONS[8].title}
            description={{
              en: "Short status or metadata labels. Colour is never the only signal — the text carries the meaning.",
              th: "ป้ายสั้นสำหรับสถานะหรือข้อมูลประกอบ สีไม่ใช่สัญญาณเดียว ข้อความต้องสื่อความหมายเสมอ",
            }}
            usage={`<Badge variant="success">AI plan</Badge>\n<Badge size="sm">tag</Badge>`}
          >
            <Demo>
              {BADGE_VARIANTS.map((v) => (
                <Badge key={v} variant={v}>
                  {v}
                </Badge>
              ))}
              <Badge size="sm">size sm</Badge>
            </Demo>
          </Section>

          <Section
            id="tabs"
            title={SECTIONS[9].title}
            description={{
              en: "Radix Tabs with roving focus: ←/→ switch tabs, Tab moves into the panel. Used for “Ask AI / Pick template” in the builder.",
              th: "Radix Tabs พร้อมการโฟกัสแบบวน: ←/→ สลับแท็บ, Tab เข้าไปในเนื้อหา ใช้ใน “ถาม AI / เลือกเทมเพลต” ของตัวสร้าง",
            }}
            usage={`<Tabs defaultValue="a">\n  <TabsList aria-label="Start"><TabsTrigger value="a">A</TabsTrigger><TabsTrigger value="b">B</TabsTrigger></TabsList>\n  <TabsContent value="a">…</TabsContent>\n</Tabs>`}
          >
            <Demo className="block">
              <Tabs defaultValue="ai">
                <TabsList aria-label="Demo tabs">
                  <TabsTrigger value="ai">
                    <Sparkles className="h-4 w-4" aria-hidden /> {L({ en: "Ask AI", th: "ถาม AI" })}
                  </TabsTrigger>
                  <TabsTrigger value="pick">
                    <LayoutGrid className="h-4 w-4" aria-hidden /> {L({ en: "Pick template", th: "เลือกเทมเพลต" })}
                  </TabsTrigger>
                  <TabsTrigger value="off" disabled>
                    {L({ en: "Disabled", th: "ปิดใช้งาน" })}
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="ai" className="mt-3 text-sm text-muted">
                  {L({ en: "Describe your app and let the agent plan it.", th: "อธิบายแอปแล้วให้ agent วางแผนให้" })}
                </TabsContent>
                <TabsContent value="pick" className="mt-3 text-sm text-muted">
                  {L({ en: "Choose one of the curated templates.", th: "เลือกจากเทมเพลตที่คัดสรรไว้" })}
                </TabsContent>
              </Tabs>
            </Demo>
          </Section>

          <Section
            id="dialog"
            title={SECTIONS[10].title}
            description={{
              en: "Modal dialog with focus trap, Escape to close, scroll lock and focus return. `side=\"right\"` turns it into a sheet — the mobile navigation uses it.",
              th: "หน้าต่างโมดอลที่กักโฟกัส กด Escape เพื่อปิด ล็อกการเลื่อน และคืนโฟกัสเมื่อปิด `side=\"right\"` จะเป็นแผ่นข้าง ใช้ในเมนูมือถือ",
            }}
            usage={`<Dialog>\n  <DialogTrigger asChild><Button>Open</Button></DialogTrigger>\n  <DialogContent title="Title" description="…">…</DialogContent>\n</Dialog>`}
          >
            <Demo>
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="secondary">{L({ en: "Open dialog", th: "เปิดหน้าต่าง" })}</Button>
                </DialogTrigger>
                <DialogContent
                  title={L({ en: "Reset all edits?", th: "รีเซ็ตการแก้ไขทั้งหมด?" })}
                  description={L({ en: "Removed and custom steps will be lost.", th: "ขั้นตอนที่ลบและที่เพิ่มเองจะหายไป" })}
                  closeLabel={L({ en: "Close", th: "ปิด" })}
                >
                  <div className="flex justify-end gap-2">
                    <DialogClose asChild>
                      <Button variant="ghost">{L({ en: "Cancel", th: "ยกเลิก" })}</Button>
                    </DialogClose>
                    <DialogClose asChild>
                      <Button variant="danger" onClick={() => toast({ title: L({ en: "Edits reset", th: "รีเซ็ตแล้ว" }) })}>
                        {L({ en: "Reset", th: "รีเซ็ต" })}
                      </Button>
                    </DialogClose>
                  </div>
                </DialogContent>
              </Dialog>
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="secondary">{L({ en: "Open sheet", th: "เปิดแผ่นข้าง" })}</Button>
                </DialogTrigger>
                <DialogContent side="right" title={L({ en: "Sheet", th: "แผ่นข้าง" })} closeLabel={L({ en: "Close", th: "ปิด" })}>
                  <p className="text-sm text-muted">{L({ en: "Used for mobile navigation.", th: "ใช้สำหรับเมนูบนมือถือ" })}</p>
                </DialogContent>
              </Dialog>
            </Demo>
          </Section>

          <Section
            id="toast"
            title={SECTIONS[11].title}
            description={{
              en: "Non-blocking feedback for copy, download, add/remove. Announced politely (errors assertively), swipe or use the close button to dismiss, auto-hide after 3.5 s and paused on hover/focus.",
              th: "การแจ้งผลแบบไม่ขัดจังหวะ สำหรับคัดลอก ดาวน์โหลด เพิ่ม/ลบ ประกาศให้โปรแกรมอ่านหน้าจอ ปัดหรือกดปุ่มปิด หายเองใน 3.5 วินาที และหยุดชั่วคราวเมื่อชี้/โฟกัส",
            }}
            usage={`const toast = useToast();\ntoast({ title: "Copied", description: "12 commands", variant: "success" });`}
          >
            <Demo>
              {(["default", "success", "info", "error"] as const).map((v) => (
                <Button
                  key={v}
                  variant="secondary"
                  onClick={() =>
                    toast({
                      title: v === "error" ? L({ en: "Couldn't copy", th: "คัดลอกไม่สำเร็จ" }) : L({ en: "Copied to clipboard", th: "คัดลอกแล้ว" }),
                      description: `variant="${v}"`,
                      variant: v,
                    })
                  }
                >
                  toast · {v}
                </Button>
              ))}
            </Demo>
          </Section>

          <Section
            id="tooltip"
            title={SECTIONS[12].title}
            description={{
              en: "Tooltips supplement — never replace — an accessible name. They open on hover and keyboard focus. Kbd renders keyboard shortcuts.",
              th: "Tooltip ใช้เสริม ไม่ใช่แทนชื่อที่เข้าถึงได้ เปิดเมื่อชี้หรือโฟกัสด้วยคีย์บอร์ด Kbd ใช้แสดงปุ่มลัด",
            }}
            usage={`<Tooltip content="Move up"><Button size="icon" aria-label="Move up"><ArrowUp /></Button></Tooltip>\n<Kbd>Ctrl</Kbd> <Kbd>K</Kbd>`}
          >
            <Demo>
              <Tooltip content={L({ en: "Move up", th: "เลื่อนขึ้น" })}>
                <Button variant="secondary" size="icon" aria-label={L({ en: "Move up", th: "เลื่อนขึ้น" })}>
                  <ArrowUp className="h-4 w-4" aria-hidden />
                </Button>
              </Tooltip>
              <Tooltip content={L({ en: "Copy all commands", th: "คัดลอกคำสั่งทั้งหมด" })} side="bottom">
                <Button variant="secondary">
                  <Copy className="h-4 w-4" aria-hidden /> {L({ en: "Hover or focus me", th: "ชี้หรือโฟกัสที่นี่" })}
                </Button>
              </Tooltip>
              <span className="text-sm text-muted">
                {L({ en: "Command palette:", th: "พาเลตต์คำสั่ง:" })} <Kbd>Ctrl</Kbd> <Kbd>K</Kbd> / <Kbd>⌘</Kbd> <Kbd>K</Kbd>
              </span>
            </Demo>
          </Section>

          <Section
            id="codeblock"
            title={SECTIONS[13].title}
            description={{
              en: "Always-dark code surface with a labelled copy button, optional title and shell prompt (prompt glyphs are not copied). Fires a toast when inside ToastProvider.",
              th: "พื้นที่โค้ดสีเข้มเสมอ พร้อมปุ่มคัดลอกที่มีป้ายกำกับ ชื่อไฟล์ และพรอมต์เชลล์ (ไม่คัดลอกเครื่องหมาย $) แสดง toast เมื่ออยู่ใน ToastProvider",
            }}
            usage={`<CodeBlock code={"npm install\\nnpm run dev"} prompt title="bash" toastTitle="Copied" />`}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <CodeBlock code={"nvm install --lts\nnpm install recharts\nnpm run dev"} prompt title="bash" toastTitle={L({ en: "Copied to clipboard", th: "คัดลอกแล้ว" })} copyLabel={L({ en: "Copy", th: "คัดลอก" })} copiedLabel={L({ en: "Copied!", th: "คัดลอกแล้ว!" })} />
              <CodeBlock
                code={'export default function Page() {\n  return <h1>Hello NVX</h1>;\n}'}
                title="src/app/page.tsx"
                toastTitle={L({ en: "Copied to clipboard", th: "คัดลอกแล้ว" })}
                copyLabel={L({ en: "Copy", th: "คัดลอก" })}
                copiedLabel={L({ en: "Copied!", th: "คัดลอกแล้ว!" })}
              />
            </div>
          </Section>

          <Section
            id="stepper"
            title={SECTIONS[14].title}
            description={{
              en: "Shows progress through a multi-step flow. The current step has aria-current=\"step\"; completed steps show a check icon. Clickable when onStepChange is set. Vertical on mobile.",
              th: "แสดงความคืบหน้าของขั้นตอนหลายขั้น ขั้นปัจจุบันมี aria-current=\"step\" ขั้นที่เสร็จแสดงไอคอนเครื่องหมายถูก คลิกได้เมื่อกำหนด onStepChange และเป็นแนวตั้งบนมือถือ",
            }}
            usage={`<Stepper current={step} onStepChange={setStep}\n  items={[{ id: "start", label: "Start" }, { id: "configure", label: "Configure" }]} />`}
          >
            <Demo className="block space-y-4">
              <Stepper
                current={step}
                onStepChange={setStep}
                label="Demo stepper"
                items={[
                  { id: "a", label: L({ en: "Start", th: "เริ่มต้น" }), description: L({ en: "Ask AI or pick", th: "ถาม AI หรือเลือก" }) },
                  { id: "b", label: L({ en: "Configure", th: "ตั้งค่า" }), description: L({ en: "Runtimes", th: "รันไทม์" }) },
                  { id: "c", label: L({ en: "Review", th: "ตรวจสอบ" }), description: L({ en: "Reorder", th: "จัดลำดับ" }) },
                  { id: "d", label: L({ en: "Export", th: "ส่งออก" }), description: L({ en: "Download", th: "ดาวน์โหลด" }) },
                ]}
              />
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
                  ← {L({ en: "Back", th: "ย้อนกลับ" })}
                </Button>
                <Button size="sm" disabled={step === 3} onClick={() => setStep((s) => s + 1)}>
                  {L({ en: "Next", th: "ถัดไป" })} →
                </Button>
              </div>
            </Demo>
          </Section>

          <Section
            id="empty"
            title={SECTIONS[15].title}
            description={{
              en: "Explains why there's nothing to show and offers the next action. The danger tone is used for recoverable errors (role=alert).",
              th: "อธิบายว่าทำไมไม่มีข้อมูลและเสนอการกระทำถัดไป โทน danger ใช้กับข้อผิดพลาดที่แก้ได้ (role=alert)",
            }}
            usage={`<EmptyState icon={<SearchX />} title="No templates match" action={<Button>Clear filters</Button>} />\n<EmptyState tone="danger" title="Couldn't plan" description={error} action={…} />`}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <EmptyState
                icon={<SearchX className="h-6 w-6" strokeWidth={1.75} />}
                title={L({ en: "No templates match your search.", th: "ไม่พบเทมเพลตที่ตรงกับคำค้น" })}
                action={<Button variant="secondary">{L({ en: "Clear filters", th: "ล้างตัวกรอง" })}</Button>}
              />
              <EmptyState
                tone="danger"
                icon={<TriangleAlert className="h-6 w-6" strokeWidth={1.75} />}
                title={L({ en: "The agent couldn't make a plan", th: "AI agent วางแผนไม่สำเร็จ" })}
                description={L({ en: "Rate limit reached. Try again in a few minutes.", th: "ใช้งานเกินกำหนด กรุณาลองใหม่ในอีกไม่กี่นาที" })}
                action={
                  <Button>
                    <RotateCw className="h-4 w-4" aria-hidden /> {L({ en: "Try again", th: "ลองอีกครั้ง" })}
                  </Button>
                }
              />
            </div>
          </Section>

          <Section
            id="skeleton"
            title={SECTIONS[16].title}
            description={{
              en: "Skeletons mirror the shape of the content being loaded (used while the AI agent plans). Wrap in role=status with a visually hidden label. Spinner is for inline/button loading.",
              th: "Skeleton จำลองรูปร่างของเนื้อหาที่กำลังโหลด (ใช้ระหว่าง AI agent วางแผน) ครอบด้วย role=status พร้อมข้อความซ่อน Spinner ใช้ในปุ่มหรือข้อความ",
            }}
            usage={`<div role="status"><span className="sr-only">Loading…</span><Skeleton className="h-4 w-2/3" /></div>\n<Spinner label="Loading" />`}
          >
            <Demo className="block">
              <div role="status" className="space-y-3">
                <span className="sr-only">{L({ en: "Loading…", th: "กำลังโหลด…" })}</span>
                <div className="flex gap-2">
                  <Skeleton className="h-6 w-28 rounded-sm" />
                  <Skeleton className="h-6 w-36 rounded-sm" />
                </div>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/6" />
              </div>
              <div className="mt-4 flex items-center gap-3 text-sm text-muted">
                <Spinner className="h-5 w-5" label={L({ en: "Loading", th: "กำลังโหลด" })} /> Spinner
              </div>
            </Demo>
          </Section>

          <Section
            id="icons"
            title={SECTIONS[17].title}
            description={{
              en: "Recognisable tools, recognisable marks. Tool logos come from simple-icons (CC0 data; logos are trademarks of their owners, used only to identify the tools) and render as app-icon tiles, the way Apple Developer shows Xcode and Swift. Everything else uses lucide line icons at 1.75–2px stroke. No emoji.",
              th: "เครื่องมือที่คนรู้จักควรมีโลโก้ที่จำได้ โลโก้เครื่องมือมาจาก simple-icons (ข้อมูล CC0 โลโก้เป็นเครื่องหมายการค้าของเจ้าของ ใช้เพื่อระบุเครื่องมือเท่านั้น) แสดงเป็นไทล์แบบไอคอนแอป เหมือนที่ Apple Developer แสดง Xcode และ Swift ส่วนไอคอนอื่นใช้ lucide แบบเส้น 1.75–2px และไม่ใช้อีโมจิ",
            }}
            usage={`import { ToolTile, ToolIcon } from "@/components/brand/tool-icon";\n<ToolTile id="next" size="lg" />      // app-icon tile, official colour\n<ToolIcon id="npm" className="text-sm" /> // inline mark, currentColor\nimport { Sparkles } from "lucide-react";\n<Sparkles className="h-4 w-4" aria-hidden />`}
          >
            <Demo className="flex-wrap gap-3">
              {(["node", "npm", "pnpm", "yarn", "nvm", "python", "pypi", "uv", "next", "react", "vite", "express", "fastapi", "streamlit", "typescript", "tailwind", "docker", "githubactions", "vitest", "ruff", "ai"] as const).map((id) => (
                <span key={id} className="flex w-16 flex-col items-center gap-1.5 text-center">
                  <ToolTile id={id} size="lg" />
                  <span className="font-mono text-[10px] text-subtle">{id}</span>
                </span>
              ))}
            </Demo>
            <Demo className="mt-3 flex-wrap gap-4 text-muted">
              {[Sparkles, LayoutGrid, Blocks, ShieldCheck, Languages, Sun, Moon, Copy, Download, Link2, Trash2, SearchX].map((Icon, i) => (
                <Icon key={i} className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              ))}
            </Demo>
          </Section>

          <Section
            id="mascot"
            title={SECTIONS[18].title}
            description={{
              en: "The pink blob is the NVX logo and a living character: it floats and breathes, blinks now and then, follows the cursor with its eyes (mouse only) and squishes when hovered or clicked. Everything stops under reduced motion. Its pink (--nvx-brand-pink #fb0fab) is decorative only, used for the mascot glow and the OG card. Buttons, links and focus stay blue.",
              th: "ก้อนสีชมพูคือโลโก้ NVX และเป็นตัวละครที่มีชีวิต: ลอยขึ้นลงและหายใจ กะพริบตาเป็นระยะ กลอกตามองตามเคอร์เซอร์ (เฉพาะเมาส์) และเด้งยุบเมื่อชี้หรือคลิก ทุกอย่างหยุดนิ่งเมื่อผู้ใช้ตั้ง reduced motion สีชมพู (--nvx-brand-pink #fb0fab) ใช้ตกแต่งเท่านั้น เช่น แสงเรืองรอบมาสคอตและภาพ OG ส่วนปุ่ม ลิงก์ และวงโฟกัสยังเป็นสีฟ้า",
            }}
            usage={`import { Mascot } from "@/components/brand/mascot";\n<Mascot size={28} />                 // header: float + blink only, decorative\n<Mascot size={112} interactive />    // hero: + eyes follow cursor, squish on hover/click\n<Mascot size={64} label="NVX" />     // role="img" with an accessible name`}
          >
            <Demo className="items-end gap-8">
              {[28, 48, 112].map((size) => (
                <span key={size} className="flex flex-col items-center gap-2">
                  <Mascot size={size} interactive={size > 48} />
                  <span className="font-mono text-[10px] text-subtle">{size}px{size > 48 ? " · interactive" : ""}</span>
                </span>
              ))}
              <span className="flex flex-col items-center gap-2">
                <span className="h-10 w-10 rounded-full" style={{ background: "var(--nvx-brand-pink)" }} aria-hidden />
                <span className="font-mono text-[10px] text-subtle">brand-pink #fb0fab</span>
              </span>
            </Demo>
          </Section>

          <Section
            id="signature"
            title={SECTIONS[19].title}
            description={{
              en: "The DevStack signature appears on every page (footer) and on the docs landing. A black terminal with a thick white outline, four tool tiles (JavaScript, curl, npm, PyPI; simple-icons marks plus text) and a prompt that types real, working commands, with the matching tile lit. Move the pointer near it: the outline lights up where you are, text glows on hover and the cursor pulses. On touch, a tap lights the edge. Static under reduced motion. HTML + inline SVG in container-query units, so it is crisp at any size.",
              th: "ซิกเนเจอร์ DevStack ปรากฏทุกหน้า (ส่วนท้าย) และหน้าแรกของเอกสาร เป็นหน้าต่างเทอร์มินัลสีดำขอบขาวหนา มีไทล์เครื่องมือ 4 ช่อง (JavaScript, curl, npm, PyPI ใช้โลโก้จาก simple-icons และข้อความ) และ prompt ที่พิมพ์คำสั่งจริงที่ใช้งานได้ พร้อมไฮไลต์ไทล์ที่ตรงกัน ขยับเมาส์เข้าใกล้: ขอบจะสว่างตรงตำแหน่งเมาส์ ตัวอักษรเรืองแสงเมื่อชี้ และเคอร์เซอร์เต้นเบา ๆ บนจอสัมผัส แตะเพื่อให้ขอบสว่าง หยุดนิ่งเมื่อตั้ง reduced motion สร้างด้วย HTML + SVG และหน่วย container query จึงคมชัดทุกขนาด",
            }}
            usage={`import { TerminalSignature } from "@/components/brand/terminal-signature";\n<TerminalSignature className="w-56" />                 // footer\n<TerminalSignature className="w-full max-w-md" />      // docs landing\n<TerminalSignature animate={false} />                  // static (shows the curl command)`}
          >
            <Demo className="items-end gap-8">
              {[160, 280, 440].map((w) => (
                <span key={w} className="flex flex-col items-center gap-2" style={{ width: w }}>
                  <TerminalSignature animate={w === 440} />
                  <span className="font-mono text-[10px] text-subtle">
                    {w}px{w === 440 ? " · typing" : " · static"}
                  </span>
                </span>
              ))}
            </Demo>
            <ul className="mt-4 space-y-1 font-mono text-xs text-muted">
              {SIGNATURE_COMMANDS.map((c) => (
                <li key={c.text}>
                  <span className="text-subtle">{c.tile.padEnd(5, " ")}</span> {c.text}
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </div>
    </div>
  );
}
