import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { L } from "@/components/prefs";

export const metadata: Metadata = {
  title: "API Acceptable Use Policy",
  description: "How to use the devstack.bid API, MCP endpoint and AI features responsibly: rate limits, retries, prohibited uses and enforcement.",
  alternates: { canonical: "/terms/api" },
};

type Tx = { en: string; th: string };

function Section({ id, n, title, children }: { id: string; n: string; title: Tx; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-24 border-t border-border py-8 md:grid md:grid-cols-[10rem_1fr] md:gap-8">
      <p className="font-mono text-caption text-subtle">{n}</p>
      <div>
        <h2 id={`${id}-h`} className="text-lg font-semibold tracking-tight text-fg"><L {...title} /></h2>
        <div className="mt-3 space-y-3 leading-relaxed text-muted">{children}</div>
      </div>
    </section>
  );
}

function Items({ items }: { items: Tx[] }) {
  return (
    <ul className="space-y-2">
      {items.map((t) => (
        <li key={t.en} className="flex gap-3">
          <span aria-hidden className="mt-2.5 h-px w-3 shrink-0 bg-border-strong" />
          <span><L {...t} /></span>
        </li>
      ))}
    </ul>
  );
}

const TOC: { id: string; t: Tx }[] = [
  { id: "scope", t: { en: "Scope", th: "ขอบเขต" } },
  { id: "rate-limits", t: { en: "Rate limits and retries", th: "ขีดจำกัดและการลองใหม่" } },
  { id: "usage", t: { en: "Proper and improper usage", th: "การใช้งานที่เหมาะสมและไม่เหมาะสม" } },
  { id: "tokens", t: { en: "Your tokens", th: "โทเค็นของคุณ" } },
  { id: "prohibited", t: { en: "Prohibited uses", th: "การใช้งานที่ห้าม" } },
  { id: "responsibility", t: { en: "Your responsibility", th: "ความรับผิดชอบของคุณ" } },
  { id: "enforcement", t: { en: "Enforcement", th: "การบังคับใช้" } },
  { id: "references", t: { en: "References", th: "แหล่งอ้างอิง" } },
];

export default function Page() {
  return (
    <div className="mx-auto max-w-content px-5 py-14">
      <header className="max-w-3xl">
        <p className="font-mono text-caption uppercase tracking-wider text-subtle">
          <Link href="/terms" className="hover:text-fg">Terms</Link> / API
        </p>
        <h1 className="mt-3 text-4xl font-bold tracking-tighter text-fg sm:text-5xl">
          <L en="API Acceptable Use Policy" th="นโยบายการใช้งาน API ที่ยอมรับได้" />
        </h1>
        <p className="mt-4 text-muted">
          <L
            en="This policy applies to the devstack.bid HTTP API, the MCP endpoint, the CLI and the AI chat. It adds to our Terms of Use."
            th="นโยบายนี้ใช้กับ HTTP API, MCP endpoint, CLI และแชท AI ของ devstack.bid โดยเป็นส่วนเพิ่มเติมจากข้อกำหนดการใช้งาน"
          />
        </p>
      </header>

      <div className="mt-10 lg:grid lg:grid-cols-[1fr_14rem] lg:gap-12">
        <div>
          <Section id="scope" n="01" title={TOC[0].t}>
            <p><L en="We provide planning, code generation, GitHub actions and deploys for software projects. Deploys and self-heal run against your own accounts, using tokens you provide. Use the service only for lawful software work." th="เราให้บริการวางแผน สร้างโค้ด ทำงานกับ GitHub และ deploy โปรเจกต์ซอฟต์แวร์ การ deploy และการแก้ไขอัตโนมัติ (self-heal) ทำงานในบัญชีของคุณเอง โดยใช้โทเค็นที่คุณให้มา ใช้บริการเพื่องานซอฟต์แวร์ที่ถูกกฎหมายเท่านั้น" /></p>
          </Section>

          <Section id="rate-limits" n="02" title={TOC[1].t}>
            <p><L en="Requests are limited per network, per account and per API key, by the minute, hour and day. When you go over a limit, the HTTP API responds with status 429, a Retry-After header in seconds, and a JSON body with code &quot;rate_limited&quot; and retryAfter. The MCP endpoint returns a rate_limited tool error with the wait time in the message." th="คำขอถูกจำกัดตามเครือข่าย บัญชี และ API key ทั้งรายนาที รายชั่วโมง และรายวัน เมื่อเกินขีดจำกัด HTTP API จะตอบสถานะ 429 พร้อม header Retry-After (หน่วยวินาที) และ JSON ที่มี code เป็น &quot;rate_limited&quot; กับ retryAfter ส่วน MCP endpoint จะตอบ tool error แบบ rate_limited พร้อมเวลาที่ต้องรอในข้อความ" /></p>
            <pre className="overflow-x-auto rounded-lg border border-border bg-surface-2 px-4 py-3 font-mono text-xs text-fg">{`HTTP/1.1 429 Too Many Requests
Retry-After: 60
Content-Type: application/json

{"error":"Too many requests.","code":"rate_limited","retryAfter":60}`}</pre>
            <p><L en="Always wait at least Retry-After seconds. If there is no header, back off exponentially with jitter:" th="รออย่างน้อยตามค่า Retry-After เสมอ ถ้าไม่มี header ให้รอแบบเพิ่มขึ้นทวีคูณพร้อมสุ่มเวลา (jitter):" /></p>
            <p className="rounded-lg border border-border px-4 py-3 text-center font-mono text-sm text-fg">
              T<sub>wait</sub> = min(T<sub>max</sub>, T<sub>base</sub> × 2<sup>attempt</sup>) + random(0, J)
            </p>
            <p><L en="For example T_base = 1 s, T_max = 60 s, J = 1 s. Stop after a few attempts instead of retrying forever." th="ตัวอย่าง T_base = 1 วินาที, T_max = 60 วินาที, J = 1 วินาที และหยุดหลังลองไม่กี่ครั้ง อย่าลองใหม่ไปเรื่อยๆ" /></p>
          </Section>

          <Section id="usage" n="03" title={TOC[2].t}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-border p-4">
                <h3 className="text-sm font-semibold text-fg"><L en="Proper" th="เหมาะสม" /></h3>
                <div className="mt-2 text-sm"><Items items={[
                  { en: "Building, deploying and fixing your own projects.", th: "สร้าง deploy และแก้ไขโปรเจกต์ของคุณเอง" },
                  { en: "Honouring Retry-After and backing off.", th: "เคารพค่า Retry-After และรอก่อนลองใหม่" },
                  { en: "One API key per integration, with the smallest scopes it needs.", th: "ใช้ API key หนึ่งตัวต่อหนึ่งระบบ และให้สิทธิ์เท่าที่จำเป็น" },
                  { en: "Caching results you already have.", th: "แคชผลลัพธ์ที่ได้มาแล้ว" },
                ]} /></div>
              </div>
              <div className="rounded-lg border border-border p-4">
                <h3 className="text-sm font-semibold text-fg"><L en="Improper" th="ไม่เหมาะสม" /></h3>
                <div className="mt-2 text-sm"><Items items={[
                  { en: "Tight retry loops that ignore 429.", th: "วนลองใหม่ถี่ๆ โดยไม่สนใจ 429" },
                  { en: "Sharing one key across many people or apps.", th: "ใช้ key เดียวร่วมกันหลายคนหรือหลายแอป" },
                  { en: "Automated bulk requests unrelated to building software.", th: "ส่งคำขอจำนวนมากแบบอัตโนมัติที่ไม่เกี่ยวกับการสร้างซอฟต์แวร์" },
                  { en: "Putting secrets in chat messages or prompts.", th: "ใส่ secret ลงในข้อความแชทหรือ prompt" },
                ]} /></div>
              </div>
            </div>
          </Section>

          <Section id="tokens" n="04" title={TOC[3].t}>
            <p><L en="Paste provider tokens (GitHub, Cloudflare, OpenAI and others) only into the designated token fields, for example in Settings → Connections. A token is used for that request only, unless you tick Remember; remembered tokens are stored encrypted and you can remove them at any time. Never paste tokens, passwords or keys into chat prompts." th="วางโทเค็นของผู้ให้บริการ (GitHub, Cloudflare, OpenAI และอื่นๆ) เฉพาะในช่องสำหรับโทเค็นเท่านั้น เช่น ในหน้า Settings → Connections โทเค็นจะถูกใช้เฉพาะคำขอนั้น เว้นแต่คุณติ๊ก “จำไว้” โทเค็นที่จำไว้จะถูกเก็บแบบเข้ารหัส และคุณลบได้ทุกเมื่อ ห้ามวางโทเค็น รหัสผ่าน หรือคีย์ลงใน prompt ของแชท" /></p>
          </Section>

          <Section id="prohibited" n="05" title={TOC[4].t}>
            <Items items={[
              { en: "Prompt injection or jailbreak attempts against our models or tools.", th: "พยายามทำ prompt injection หรือ jailbreak กับโมเดลหรือเครื่องมือของเรา" },
              { en: "Trying to extract system prompts, credentials, keys or other users' data.", th: "พยายามดึง system prompt, credential, คีย์ หรือข้อมูลของผู้ใช้อื่น" },
              { en: "Generating malware, backdoors, credential stealers or exploit code aimed at systems you do not own.", th: "สร้างมัลแวร์ backdoor โปรแกรมขโมยรหัส หรือโค้ดโจมตีระบบที่คุณไม่ได้เป็นเจ้าของ" },
              { en: "Typosquatting or dependency confusion: publishing or referencing look-alike packages.", th: "Typosquatting หรือ dependency confusion: เผยแพร่หรืออ้างอิงแพ็กเกจที่ตั้งชื่อเลียนแบบ" },
              { en: "Scraping, or evading rate limits by rotating IPs, spoofing TLS fingerprints or creating many accounts.", th: "ดูดข้อมูล หรือหลบขีดจำกัดด้วยการสลับ IP ปลอม TLS fingerprint หรือสร้างหลายบัญชี" },
              { en: "Deliberately exhausting quotas or resources so others cannot use the service.", th: "จงใจใช้โควตาหรือทรัพยากรจนหมด เพื่อให้ผู้อื่นใช้บริการไม่ได้" },
            ]} />
          </Section>

          <Section id="responsibility" n="06" title={TOC[5].t}>
            <p><L en="Generated code, scripts and commands can be wrong. Review every script before you run it on your machine or deploy it, and check the permissions of any token you give us. Deploys and self-heal act in your own accounts, so you are responsible for what runs there." th="โค้ด สคริปต์ และคำสั่งที่สร้างขึ้นอาจผิดพลาดได้ ตรวจทุกสคริปต์ก่อนรันบนเครื่องหรือ deploy และตรวจสิทธิ์ของโทเค็นที่ให้เรา การ deploy และ self-heal ทำงานในบัญชีของคุณเอง คุณจึงรับผิดชอบสิ่งที่รันอยู่ในนั้น" /></p>
          </Section>

          <Section id="enforcement" n="07" title={TOC[6].t}>
            <p><L en="We reserve the right to refuse requests, revoke API keys, block networks or clients, and suspend or close accounts that break this policy, with or without notice." th="เราขอสงวนสิทธิ์ในการปฏิเสธคำขอ เพิกถอน API key บล็อกเครือข่ายหรือไคลเอนต์ และระงับหรือปิดบัญชีที่ละเมิดนโยบายนี้ โดยอาจแจ้งหรือไม่แจ้งล่วงหน้า" /></p>
            <p><L en="Report abuse or a security issue via" th="แจ้งการใช้งานในทางที่ผิดหรือปัญหาความปลอดภัยได้ที่" />{" "}<Link href="/security" className="text-fg underline underline-offset-4">/security</Link>.</p>
          </Section>

          <Section id="references" n="08" title={TOC[7].t}>
            <Items items={[
              { en: "The initial draft of this policy was prepared with the help of Google Gemini, then edited to match how devstack.bid works.", th: "ร่างแรกของนโยบายนี้จัดทำโดยใช้ Google Gemini ช่วย แล้วแก้ไขให้ตรงกับการทำงานจริงของ devstack.bid" },
            ]} />
            <ul className="space-y-2">
              <li><a className="text-fg underline underline-offset-4" href="https://genai.owasp.org/llm-top-10/" rel="noopener noreferrer" target="_blank">OWASP Top 10 for LLM Applications</a></li>
              <li><a className="text-fg underline underline-offset-4" href="https://www.rfc-editor.org/rfc/rfc9110#field.retry-after" rel="noopener noreferrer" target="_blank">RFC 9110 §10.2.3 Retry-After</a></li>
            </ul>
          </Section>
          <p className="border-t border-border pt-6 text-caption text-subtle"><L en="Last updated: October 2026." th="อัปเดตล่าสุด: ตุลาคม 2026" /></p>
        </div>

        <nav aria-label="On this page" className="hidden lg:block">
          <div className="sticky top-24 border-l border-border pl-4 text-sm">
            <p className="mb-2 font-medium text-fg"><L en="On this page" th="ในหน้านี้" /></p>
            <ul className="space-y-1.5">
              {TOC.map((s) => (
                <li key={s.id}><a href={`#${s.id}`} className="text-muted hover:text-fg"><L {...s.t} /></a></li>
              ))}
            </ul>
          </div>
        </nav>
      </div>
    </div>
  );
}
