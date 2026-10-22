import "server-only";
import { getTemplate, TEMPLATES } from "@/data/templates";
import { applyEdits, composeSteps, normalizeConfig } from "@/lib/composer";
import { toBash, toPowerShell, toReadme } from "@/lib/scripts";
import { encodeShare } from "@/lib/share";
import { searchDocs, type SearchEntry } from "@/lib/docs-search";
import { DOCS, getDoc, llmsTxt, SITE_URL } from "@/lib/docs";
import { chatRuntime } from "@/lib/chat/runtime";
import { AUTH_COOKIE, signUid } from "@/lib/chat/identity";
import { getAccount, getConversation, listConversations, listMessages, loadInlineImage } from "@/lib/chat/store";
import { chatEnv as loadChatEnv } from "@/lib/chat/config";
import { loadGithubToken, resolveSealKeys } from "@/lib/connections/credentials";
import { listWritableRepos, putFile } from "@/lib/auth/github-api";
import { parseRepo, safeBranch, safeCommitMessage, safeRepoPath, MAX_FILE_CHARS } from "@/lib/auth/github-policy";
import { handleTurn } from "@/lib/chat/turn-route";
import { POST as planPost } from "@/app/api/plan/route";
import { POST as factorySessionPost } from "@/app/api/factory/session/route";
import { POST as factoryTurnPost } from "@/app/api/factory/turn/route";
import { clientIp } from "@/lib/server/http";
import type { Lang } from "@/lib/types";
import { sanitizeStep } from "@/lib/sanitize";
import { authenticateMcpClient, consumeMcpClient, isMcpKey, type McpClient, type McpScope } from "./auth";

const PROTOCOL_VERSION = "2025-11-25";
const MAX_RPC_BODY = 96 * 1024;
const jsonHeaders = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };

type Tool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  requiredScope?: McpScope;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint?: boolean };
};
type RpcMessage = { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown };

const object = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required, additionalProperties: false });
const str = (description?: string) => ({ type: "string", ...(description ? { description } : {}) });
const optionalString = (description?: string) => str(description);
const editsSchema = {
  type: "object",
  description: "Optional Builder edits: custom steps, removed step ids, and the desired order of step ids.",
  properties: {
    order: { type: "array", items: str(), maxItems: 100 },
    removed: { type: "array", items: str(), maxItems: 100 },
    custom: { type: "array", items: { type: "object" }, maxItems: 20 },
  },
  additionalProperties: false,
};

const safetyGuidance = {
  privacy: {
    en: { title: "Privacy basics", steps: ["Share only the information needed for the task; remove names, addresses, account numbers, and identifying screenshots.", "Use separate, narrowly scoped API keys for each client and revoke keys you no longer use.", "Check the destination and retention policy before sending prompts or files to another AI service.", "Use a password manager and unique passwords; enable passkeys or multi-factor authentication where available."], escalate: "If personal data was exposed, revoke affected credentials, contact the relevant service through its official site, and follow your local data protection authority's guidance." },
    th: { title: "พื้นฐานความเป็นส่วนตัว", steps: ["ส่งเฉพาะข้อมูลที่จำเป็น ลบชื่อ ที่อยู่ เลขบัญชี และข้อมูลระบุตัวตนออกจากภาพก่อนแชร์", "แยก API key ตาม client ให้สิทธิ์เท่าที่ต้องใช้ และเพิกถอนคีย์ที่เลิกใช้", "ตรวจปลายทางและนโยบายเก็บข้อมูลก่อนส่ง prompt หรือไฟล์ไปยังบริการ AI อื่น", "ใช้ password manager ตั้งรหัสผ่านไม่ซ้ำ และเปิด passkey หรือ MFA เมื่อมีให้ใช้"], escalate: "หากข้อมูลส่วนบุคคลรั่ว ให้เพิกถอนข้อมูลรับรองที่เกี่ยวข้อง ติดต่อบริการผ่านเว็บไซต์ทางการ และดูแนวทางจากหน่วยงานคุ้มครองข้อมูลในพื้นที่ของคุณ" },
  },
  accounts: {
    en: { title: "Account security", steps: ["Use a unique password stored in a reputable password manager.", "Turn on passkeys or multi-factor authentication; prefer an authenticator or security key over SMS when available.", "Review active sessions, recovery email/phone, connected apps, and recent sign-in alerts.", "Keep recovery codes offline in a secure place; never share them with support agents or AI tools."], escalate: "If you suspect takeover, use the service's official recovery page from a trusted device, revoke sessions and app tokens, then change reused passwords." },
    th: { title: "ความปลอดภัยของบัญชี", steps: ["ใช้รหัสผ่านเฉพาะบัญชีนั้นและเก็บใน password manager ที่เชื่อถือได้", "เปิด passkey หรือ MFA; ถ้าเลือกได้ให้ใช้แอปยืนยันตัวตนหรือ security key แทน SMS", "ตรวจ session ที่เปิดอยู่ อีเมล/เบอร์กู้คืน แอปที่เชื่อมต่อ และแจ้งเตือนการเข้าสู่ระบบ", "เก็บ recovery code แบบออฟไลน์ในที่ปลอดภัย ห้ามส่งให้ฝ่ายสนับสนุนหรือ AI"], escalate: "หากสงสัยว่าบัญชีถูกยึด ให้ใช้หน้ากู้คืนทางการจากอุปกรณ์ที่เชื่อถือ เพิกถอน session และ app token แล้วเปลี่ยนรหัสผ่านที่นำไปใช้ซ้ำ" },
  },
  devices: {
    en: { title: "Device security", steps: ["Install operating-system and browser security updates promptly.", "Use a screen lock and device encryption; set automatic locking for unattended devices.", "Install apps from official stores or verified publishers and review requested permissions.", "Avoid sensitive account activity on shared devices or untrusted Wi-Fi; use your mobile network if unsure."], escalate: "If a device is lost, use its official remote-lock or erase feature, change important account credentials, and contact your carrier if the SIM may be at risk." },
    th: { title: "ความปลอดภัยของอุปกรณ์", steps: ["ติดตั้งอัปเดตความปลอดภัยของระบบปฏิบัติการและเบราว์เซอร์โดยเร็ว", "ตั้งล็อกหน้าจอและเข้ารหัสดิสก์ พร้อมล็อกอัตโนมัติเมื่อไม่ได้ใช้งาน", "ติดตั้งแอปจาก store ทางการหรือผู้เผยแพร่ที่ตรวจสอบแล้ว และทบทวนสิทธิ์ที่แอปขอ", "หลีกเลี่ยงการทำธุรกรรมสำคัญบนเครื่องสาธารณะหรือ Wi-Fi ที่ไม่น่าเชื่อถือ หากไม่แน่ใจให้ใช้เครือข่ายมือถือ"], escalate: "หากอุปกรณ์หาย ให้ใช้ระบบล็อกหรือลบข้อมูลจากระยะไกล เปลี่ยนข้อมูลเข้าสู่ระบบที่สำคัญ และติดต่อเครือข่ายมือถือหาก SIM อาจมีความเสี่ยง" },
  },
  scams: {
    en: { title: "Scam and phishing response", steps: ["Pause before opening links, installing files, scanning QR codes, or sending money.", "Verify requests using a known official website or a separate trusted contact method; do not use contact details in the suspicious message.", "Never disclose passwords, one-time codes, recovery phrases, private keys, or API keys.", "Save relevant evidence without forwarding the suspicious link to others."], escalate: "If you already shared a secret, change or revoke it from the official service immediately. If money was sent, contact your bank or payment provider through its official channel as soon as possible." },
    th: { title: "รับมือมิจฉาชีพและฟิชชิง", steps: ["หยุดตรวจสอบก่อนกดลิงก์ ติดตั้งไฟล์ สแกน QR หรือโอนเงิน", "ยืนยันคำขอผ่านเว็บไซต์ทางการที่พิมพ์เองหรือช่องทางติดต่อที่เชื่อถือ อย่าใช้ข้อมูลติดต่อจากข้อความน่าสงสัย", "ห้ามเปิดเผยรหัสผ่าน รหัสใช้ครั้งเดียว recovery phrase private key หรือ API key", "เก็บหลักฐานที่เกี่ยวข้องโดยไม่ส่งต่อลิงก์น่าสงสัยให้ผู้อื่น"], escalate: "หากส่งความลับไปแล้ว ให้เปลี่ยนหรือเพิกถอนผ่านบริการทางการทันที หากโอนเงินแล้วให้ติดต่อธนาคารหรือผู้ให้บริการชำระเงินผ่านช่องทางทางการโดยเร็ว" },
  },
  personal_safety: {
    en: { title: "Personal safety", steps: ["Avoid posting real-time location, travel plans, home details, or identifying documents publicly.", "Review location sharing and audience settings on social and messaging apps; disable sharing you do not need.", "For an in-person meeting, choose a public place, tell a trusted person your plan, and arrange your own transport.", "If a situation feels unsafe, move toward a staffed public place and contact someone you trust."], escalate: "If there is immediate danger, contact local emergency services. This general checklist cannot assess your surroundings or replace professional help." },
    th: { title: "ความปลอดภัยส่วนบุคคล", steps: ["หลีกเลี่ยงการโพสต์ตำแหน่งแบบเรียลไทม์ แผนเดินทาง รายละเอียดบ้าน หรือเอกสารระบุตัวตนต่อสาธารณะ", "ตรวจการแชร์ตำแหน่งและกลุ่มผู้ชมในแอปโซเชียล/แชต ปิดสิ่งที่ไม่จำเป็น", "หากนัดพบกัน ให้เลือกที่สาธารณะ บอกแผนกับคนที่ไว้ใจ และจัดการเดินทางกลับด้วยตนเอง", "ถ้ารู้สึกไม่ปลอดภัย ให้ไปยังพื้นที่สาธารณะที่มีเจ้าหน้าที่และติดต่อคนที่ไว้ใจ"], escalate: "หากมีอันตรายทันที ให้ติดต่อหน่วยฉุกเฉินในพื้นที่ คำแนะนำทั่วไปนี้ประเมินสภาพแวดล้อมแทนคุณหรือทดแทนความช่วยเหลือจากผู้เชี่ยวชาญไม่ได้" },
  },
} as const;
type SafetyTopic = keyof typeof safetyGuidance;

export const MCP_TOOLS: Tool[] = [
  { name: "list_templates", description: "List all runnable Node.js and Python stack templates available on DevStack.", inputSchema: object({}), annotations: { readOnlyHint: true } },
  { name: "get_template", description: "Read one stack template, including its ordered setup steps and supported add-ons.", inputSchema: object({ templateId: str("Template id from list_templates") }, ["templateId"]), annotations: { readOnlyHint: true } },
  {
    name: "compose_stack",
    description: "Compose and validate ordered setup steps for a template. Returns commands only; DevStack never executes them.",
    inputSchema: object({ templateId: str(), projectName: optionalString(), node: { type: "string", enum: ["lts", "24", "22", "20"] }, python: { type: "string", enum: ["3.13", "3.12", "3.11"] }, jsPm: { type: "string", enum: ["npm", "pnpm", "yarn"] }, pyPm: { type: "string", enum: ["pip", "uv"] }, addons: { type: "array", items: { type: "string", enum: ["typescript", "tailwind", "eslint", "testing", "docker", "ci"] } }, edits: editsSchema }, ["templateId"]), annotations: { readOnlyHint: true } },
  { name: "export_scripts", description: "Generate reviewable setup.sh and setup.ps1 files from a template configuration and optional Builder edits. Scripts are text and are not run on the server.", inputSchema: object({ templateId: str(), projectName: optionalString(), node: { type: "string", enum: ["lts", "24", "22", "20"] }, python: { type: "string", enum: ["3.13", "3.12", "3.11"] }, jsPm: { type: "string", enum: ["npm", "pnpm", "yarn"] }, pyPm: { type: "string", enum: ["pip", "uv"] }, addons: { type: "array", items: { type: "string" } }, edits: editsSchema, lang: { type: "string", enum: ["en", "th"] } }, ["templateId"]), annotations: { readOnlyHint: true } },
  { name: "export_starter_bundle", description: "Return every file in the Builder's starter ZIP as a path-to-text map: setup scripts, README, nvx-stack.json and starter files. The client can write these files locally; DevStack does not execute them.", inputSchema: object({ templateId: str(), projectName: optionalString(), node: { type: "string", enum: ["lts", "24", "22", "20"] }, python: { type: "string", enum: ["3.13", "3.12", "3.11"] }, jsPm: { type: "string", enum: ["npm", "pnpm", "yarn"] }, pyPm: { type: "string", enum: ["pip", "uv"] }, addons: { type: "array", items: { type: "string" } }, edits: editsSchema, lang: { type: "string", enum: ["en", "th"] } }, ["templateId"]), annotations: { readOnlyHint: true } },
  { name: "create_share_link", description: "Create a shareable Builder URL for a validated template configuration, including optional Builder edits.", inputSchema: object({ templateId: str(), projectName: optionalString(), node: { type: "string", enum: ["lts", "24", "22", "20"] }, python: { type: "string", enum: ["3.13", "3.12", "3.11"] }, jsPm: { type: "string", enum: ["npm", "pnpm", "yarn"] }, pyPm: { type: "string", enum: ["pip", "uv"] }, addons: { type: "array", items: { type: "string" } }, edits: editsSchema }, ["templateId"]), annotations: { readOnlyHint: true } },
  { name: "search_docs", description: "Search DevStack's bilingual user guide and technical reference.", inputSchema: object({ query: str(), limit: { type: "integer", minimum: 1, maximum: 20 } }, ["query"]), annotations: { readOnlyHint: true } },
  { name: "read_doc", description: "Read a public DevStack documentation page as Markdown. Use a slug such as user-guide/getting-started.", inputSchema: object({ slug: str("Documentation slug; use empty string for the docs index") }, ["slug"]), annotations: { readOnlyHint: true } },
  { name: "get_platform_info", description: "Return the public platform description and documentation entry point.", inputSchema: object({}), annotations: { readOnlyHint: true } },
  { name: "get_safety_recommendations", description: "Return general privacy, account, device, scam-response, or personal-safety steps. It accepts no personal details, does not inspect your device, and does not contact anyone.", inputSchema: object({ topic: { type: "string", enum: ["privacy", "accounts", "devices", "scams", "personal_safety"] }, lang: { type: "string", enum: ["en", "th"] } }, ["topic"]), annotations: { readOnlyHint: true } },
  { name: "plan_stack", description: "Generate a complete app scaffold plan through DevStack's AI planner. Requires plan:write. Optional x-openai-key header uses the caller's key for this request only.", inputSchema: object({ prompt: str(), lang: { type: "string", enum: ["en", "th"] }, mode: { type: "string", enum: ["auto", "fallback"] } }, ["prompt"]), requiredScope: "plan:write", annotations: { openWorldHint: true } },
  { name: "chat_send", description: "Send a message to DevStack User Chat, including general, Thai, code, strong, image, and allowlisted Gateway modes. Requires chat:write; consumes site quota.", inputSchema: object({ message: str(), conversationId: optionalString(), mode: { type: "string", enum: ["general", "thai", "code", "strong", "image", "gateway"] }, model: optionalString() }, ["message"]), requiredScope: "chat:write", annotations: { openWorldHint: true } },
  { name: "dev_chat_send", description: "Send a turn to the DevStack Image and Research Orchestrator. Requires dev:write and uses the site's protected daily budget.", inputSchema: object({ message: str(), conversationId: optionalString() }, ["message"]), requiredScope: "dev:write", annotations: { openWorldHint: true } },
  { name: "list_conversations", description: "List your DevStack chat, Dev Chat, or Factory conversations. Requires chat:read; returns only conversations owned by this API key.", inputSchema: object({ channel: { type: "string", enum: ["user", "dev"] }, source: { type: "string", enum: ["chat", "factory"] }, limit: { type: "integer", minimum: 1, maximum: 50 } }), requiredScope: "chat:read", annotations: { readOnlyHint: true } },
  { name: "read_conversation", description: "Read messages from one of your conversations. Requires chat:read and checks ownership.", inputSchema: object({ conversationId: str() }, ["conversationId"]), requiredScope: "chat:read", annotations: { readOnlyHint: true } },
  { name: "factory_create_session", description: "Create an OpenAI Agents API agent and sandbox session using the caller's x-openai-key MCP header. Requires factory:write; your OpenAI key is never stored by DevStack.", inputSchema: object({ template: { type: "string", enum: ["orchestrator", "blank"] }, model: { type: "string", enum: ["gpt-6.1-sol", "gpt-6-astra", "gpt-6-luna"] }, environment: { type: "string", enum: ["openai_hosted", "self_hosted"] }, instructions: optionalString(), workspaceDirectory: optionalString() }), requiredScope: "factory:write", annotations: { openWorldHint: true } },
  { name: "factory_send_message", description: "Send a turn to one of your Factory sessions using the caller's x-openai-key MCP header. Requires factory:write.", inputSchema: object({ conversationId: str(), message: str() }, ["conversationId", "message"]), requiredScope: "factory:write", annotations: { openWorldHint: true } },
  { name: "github_list_repositories", description: "List GitHub repositories this signed-in account can push to. Requires github:read and a GitHub-linked DevStack account.", inputSchema: object({}), requiredScope: "github:read", annotations: { readOnlyHint: true, openWorldHint: true } },
  { name: "github_commit_file", description: "Create or update one file on a GitHub branch. This creates a real commit. Requires github:write; the MCP client should ask the user before calling it.", inputSchema: object({ repo: str("owner/name"), path: str(), message: str("Commit message"), content: str(), branch: str("Branch name; defaults to main") }, ["repo", "path", "message", "content"]), requiredScope: "github:write", annotations: { destructiveHint: true, openWorldHint: true } },
];

function result(data: unknown, isError = false, extraContent: Array<Record<string, unknown>> = []) {
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return { content: [{ type: "text", text }, ...extraContent], structuredContent: data, ...(isError ? { isError: true } : {}) };
}

function toolError(code: string, message: string) {
  return result({ code, error: message }, true);
}

function plain(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function safeConfig(args: Record<string, unknown>) {
  return normalizeConfig({
    templateId: typeof args.templateId === "string" ? args.templateId : undefined,
    projectName: typeof args.projectName === "string" ? args.projectName : undefined,
    node: typeof args.node === "string" ? (args.node as "lts" | "24" | "22" | "20") : undefined,
    python: typeof args.python === "string" ? (args.python as "3.13" | "3.12" | "3.11") : undefined,
    jsPm: typeof args.jsPm === "string" ? (args.jsPm as "npm" | "pnpm" | "yarn") : undefined,
    pyPm: typeof args.pyPm === "string" ? (args.pyPm as "pip" | "uv") : undefined,
    addons: Array.isArray(args.addons) ? args.addons.filter((x): x is string => typeof x === "string") as never : undefined,
  });
}

function safeEdits(raw: unknown) {
  const input = plain(raw);
  const order = Array.isArray(input.order) ? input.order.filter((x): x is string => typeof x === "string").slice(0, 100) : [];
  const removed = Array.isArray(input.removed) ? input.removed.filter((x): x is string => typeof x === "string").slice(0, 100) : [];
  const custom = Array.isArray(input.custom) ? input.custom.slice(0, 20).map((step, i) => sanitizeStep(step, `custom-mcp-${i + 1}`)).filter((step) => step !== null) : [];
  return { order, removed, custom };
}

let docsCache: SearchEntry[] | null = null;
async function docsIndex(): Promise<SearchEntry[]> {
  if (!docsCache) docsCache = (await import("../../../public/docs-search-index.json")).default as SearchEntry[];
  return docsCache;
}

function makeInternalRequest(incoming: Request, path: string, body: unknown, extraHeaders: Record<string, string> = {}) {
  const headers = new Headers({ "content-type": "application/json", "x-forwarded-proto": new URL(incoming.url).protocol.slice(0, -1), ...extraHeaders });
  for (const name of ["cf-connecting-ip", "x-forwarded-for", "cf-ray"]) {
    const value = incoming.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Request(new URL(path, incoming.url), { method: "POST", headers, body: JSON.stringify(body) });
}

async function makeUserRequest(incoming: Request, path: string, body: unknown, client: McpClient, secret: string, extraHeaders: Record<string, string> = {}) {
  const req = makeInternalRequest(incoming, path, body, extraHeaders);
  const headers = new Headers(req.headers);
  headers.set("cookie", `${AUTH_COOKIE}=${encodeURIComponent(await signUid(client.userId, secret))}`);
  return new Request(req.url, { method: "POST", headers, body: JSON.stringify(body) });
}

async function readSse(response: Response) {
  if (!response.ok && !response.headers.get("content-type")?.includes("text/event-stream")) {
    const body = await response.json().catch(() => ({}));
    throw Object.assign(new Error((body as { error?: string }).error ?? `Request failed (${response.status})`), { status: response.status, body });
  }
  if (!response.body) return { text: "", events: [] as Record<string, unknown>[] };
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const events: Record<string, unknown>[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const frames = buffer.split(/\r?\n\r?\n/);
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const data = frame.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
      if (!data) continue;
      try { events.push(JSON.parse(data) as Record<string, unknown>); } catch { /* ignore malformed stream frame */ }
    }
    if (done) break;
  }
  const final = events.filter((e) => e.t === "text").map((e) => String(e.text ?? "")).join("\n") || events.filter((e) => e.t === "delta").map((e) => String(e.text ?? "")).join("");
  const meta = events.find((e) => e.t === "meta");
  const error = events.find((e) => e.t === "error");
  if (error) throw Object.assign(new Error(String(error.message ?? "Chat failed")), { body: error });
  return { text: final, conversationId: meta?.conversationId, events: events.filter((e) => ["image", "file", "usage", "quota"].includes(String(e.t))) };
}

export async function needScope(req: Request, scope: McpScope, db: NonNullable<Awaited<ReturnType<typeof chatRuntime>>["db"]>) {
  const auth = await authenticateMcpClient(req, db);
  if (!auth.client) throw Object.assign(new Error(auth.error === "missing" ? "Connect a DevStack API key with the required scope." : "The DevStack API key is invalid or has been revoked."), { status: 401, code: "unauthorized" });
  if (!isMcpKey(auth.client.scopes)) throw Object.assign(new Error("CLI keys cannot be used for MCP. Create an MCP key at devstack.bid/settings/mcp."), { status: 403, code: "missing_scope" });
  if (!auth.client.scopes.includes(scope)) throw Object.assign(new Error(`This API key needs the ${scope} scope.`), { status: 403, code: "missing_scope" });
  const rate = await consumeMcpClient(db, auth.client);
  if (!rate.ok) throw Object.assign(new Error(`API key rate limit reached. Retry in ${rate.retryAfter} seconds.`), { status: 429, code: "rate_limited", retryAfter: rate.retryAfter });
  return auth.client;
}

export async function callTool(req: Request, name: string, rawArgs: unknown) {
  const args = plain(rawArgs);
  const tool = MCP_TOOLS.find((item) => item.name === name);
  if (!tool) return toolError("unknown_tool", `Unknown DevStack tool: ${name}`);
  const runtime = await chatRuntime();
  const db = runtime.db;
  const env = loadChatEnv();
  let client: McpClient | undefined;
  if (tool.requiredScope) {
    if (!db) return toolError("unavailable", "DevStack storage is not available.");
    try { client = await needScope(req, tool.requiredScope, db); }
    catch (error) { return toolError(String((error as { code?: string }).code ?? "unauthorized"), (error as Error).message); }
  }

  try {
    switch (name) {
      case "list_templates":
        return result(TEMPLATES.map((t) => ({ id: t.id, name: t.name, summary: t.summary, runtimes: t.runtimes, addons: t.supportedAddons, steps: t.steps.length })));
      case "get_template": {
        const template = getTemplate(String(args.templateId ?? ""));
        return template ? result(template) : toolError("not_found", "Template not found.");
      }
      case "compose_stack": {
        const config = safeConfig(args);
        if (!getTemplate(config.templateId)) return toolError("not_found", "Template not found.");
        return result({ config, steps: applyEdits(composeSteps(config), safeEdits(args.edits)) });
      }
      case "export_scripts": {
        const config = safeConfig(args);
        const steps = applyEdits(composeSteps(config), safeEdits(args.edits));
        const lang: Lang = args.lang === "th" ? "th" : "en";
        return result({ config, files: { "setup.sh": toBash(steps, config, lang), "setup.ps1": toPowerShell(steps, config, lang) }, note: "Review the scripts before running; the server never executes them." });
      }
      case "export_starter_bundle": {
        const config = safeConfig(args);
        if (!getTemplate(config.templateId)) return toolError("not_found", "Template not found.");
        const edits = safeEdits(args.edits);
        const steps = applyEdits(composeSteps(config), edits);
        const lang: Lang = args.lang === "th" ? "th" : "en";
        const token = encodeShare({ config, edits });
        const shareUrl = `${SITE_URL}/builder#s=${token}`;
        const files: Record<string, string> = {
          "setup.sh": toBash(steps, config, lang),
          "setup.ps1": toPowerShell(steps, config, lang),
          "README.md": toReadme(steps, config, lang, shareUrl),
          "nvx-stack.json": JSON.stringify({ generator: "NVX Stack Builder", shareUrl, config, steps: steps.map((s) => ({ id: s.id, title: s.title, commands: s.commands, windows: s.windows, verify: s.verify, kind: s.kind })) }, null, 2),
        };
        for (const step of steps) for (const file of step.files) files[`starter-files/${file.path}`] = file.content;
        return result({ directory: `${config.projectName}-starter`, files, note: "These are the contents of the Builder starter ZIP. Review them before writing or running; DevStack never executes them." });
      }
      case "create_share_link": {
        const config = safeConfig(args);
        const state = encodeShare({ config, edits: safeEdits(args.edits) });
        return result({ url: `${SITE_URL}/builder#s=${state}`, config });
      }
      case "search_docs": {
        const query = typeof args.query === "string" ? args.query.trim().slice(0, 200) : "";
        if (query.length < 2) return toolError("invalid", "Search query must contain at least two characters.");
        const limit = Math.max(1, Math.min(20, Number(args.limit) || 10));
        return result(searchDocs(await docsIndex(), query, limit));
      }
      case "read_doc": {
        const slug = typeof args.slug === "string" ? args.slug.replace(/^\/+|\/+$/g, "") : "";
        const doc = getDoc(slug);
        return doc ? result({ slug: doc.slug, title: doc.title, description: doc.description, markdown: doc.raw }) : toolError("not_found", "Documentation page not found.");
      }
      case "get_platform_info":
        return result({ name: "NVX Stack Builder", url: SITE_URL, description: "Compose and export bilingual Node.js and Python setup plans; the server does not execute commands.", agentEntry: `${SITE_URL}/llms.txt`, templateCount: TEMPLATES.length, docs: `${SITE_URL}/docs/platform` });
      case "get_safety_recommendations": {
        const topic = typeof args.topic === "string" && Object.prototype.hasOwnProperty.call(safetyGuidance, args.topic) ? args.topic as SafetyTopic : null;
        if (!topic) return toolError("invalid", "Choose a supported safety topic.");
        const lang = args.lang === "th" ? "th" : "en";
        const guide = safetyGuidance[topic][lang];
        return result({ topic, ...guide, neverShare: lang === "th" ? ["รหัสผ่าน", "OTP / recovery code", "API key / private key", "ตำแหน่งปัจจุบันหรือที่อยู่เต็ม"] : ["passwords", "one-time or recovery codes", "API or private keys", "live location or full address"], privacy: lang === "th" ? "คำแนะนำนี้เป็นข้อมูลทั่วไป ไม่รับหรือเก็บรายละเอียดส่วนบุคคล และไม่ได้ตรวจอุปกรณ์หรือบัญชีของคุณ" : "This is general guidance. It does not ask for or store personal details and cannot inspect your device or accounts." });
      }
      case "plan_stack": {
        const prompt = typeof args.prompt === "string" ? args.prompt.slice(0, 2000) : "";
        const input = { prompt, lang: args.lang === "th" ? "th" : "en", mode: args.mode === "fallback" ? "fallback" : "auto" };
        const headers: Record<string, string> = {};
        const ownKey = req.headers.get("x-openai-key");
        if (ownKey) headers["x-openai-key"] = ownKey;
        const internal = new Request(new URL("/api/plan", req.url), { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": clientIp(req), ...headers }, body: JSON.stringify(input) });
        const response = await planPost(internal);
        const data = await response.json().catch(() => ({}));
        return response.ok ? result(data) : toolError("planner_failed", JSON.stringify(data));
      }
      case "chat_send":
      case "dev_chat_send": {
        if (!client || !env.CHAT_COOKIE_SECRET) return toolError("unavailable", "Chat is not configured.");
        const mode = name === "dev_chat_send" ? "agent" : (typeof args.mode === "string" ? args.mode : "general");
        const body = { message: args.message, ...(typeof args.conversationId === "string" ? { conversationId: args.conversationId } : {}), ...(name === "chat_send" ? { mode, ...(typeof args.model === "string" ? { model: args.model } : {}) } : {}) };
        const internal = await makeUserRequest(req, name === "dev_chat_send" ? "/api/chat/dev/turn" : "/api/chat/turn", body, client, env.CHAT_COOKIE_SECRET);
        const response = await handleTurn(internal, name === "dev_chat_send" ? "dev" : "user");
        const data = await readSse(response);
        const imageParts: Array<Record<string, unknown>> = [];
        if (db && data.events.length) {
          for (const event of data.events) {
            if (event.t !== "image" || typeof event.id !== "string") continue;
            const image = await loadInlineImage(db, client.userId, event.id);
            if (!image) continue;
            const bytes = image.data instanceof Uint8Array ? image.data : Array.isArray(image.data) ? new Uint8Array(image.data) : new Uint8Array(image.data);
            if (bytes.byteLength > 5 * 1024 * 1024 || !/^image\/(webp|png|jpeg)$/.test(image.mime)) continue;
            let binary = "";
            for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
            imageParts.push({ type: "image", data: btoa(binary), mimeType: image.mime });
          }
        }
        return result({ conversationId: data.conversationId, text: data.text, events: data.events }, false, imageParts);
      }
      case "list_conversations": {
        if (!client || !db) return toolError("unavailable", "Storage is not available.");
        const source = args.source === "factory" ? "factory" : "chat";
        const channel = args.channel === "dev" || source === "factory" ? "dev" : "user";
        const limit = Math.max(1, Math.min(50, Number(args.limit) || 20));
        return result((await listConversations(db, client.userId, limit, source, channel)).map((c) => ({ id: c.id, title: c.title, model: c.model, source: c.source, channel: c.channel, environment: c.environment, updatedAt: c.updated_at })));
      }
      case "read_conversation": {
        if (!client || !db) return toolError("unavailable", "Storage is not available.");
        const id = String(args.conversationId ?? "");
        const conversation = await getConversation(db, client.userId, id);
        if (!conversation || conversation.archived) return toolError("not_found", "Conversation not found.");
        return result({ id: conversation.id, title: conversation.title, model: conversation.model, messages: await listMessages(db, id, 200) });
      }
      case "factory_create_session":
      case "factory_send_message": {
        if (!client) return toolError("unauthorized", "A scoped API key is required.");
        const secret = env.CHAT_COOKIE_SECRET;
        if (!secret) return toolError("unavailable", "Factory is not configured.");
        const path = name === "factory_create_session" ? "/api/factory/session" : "/api/factory/turn";
        const body = name === "factory_create_session"
          ? { template: args.template, model: args.model, environment: args.environment, instructions: args.instructions, workspaceDirectory: args.workspaceDirectory }
          : { conversationId: args.conversationId, message: args.message };
        const openAiKey = req.headers.get("x-openai-key");
        const internal = await makeUserRequest(req, path, body, client, secret, openAiKey ? { "x-openai-key": openAiKey } : {});
        const response = name === "factory_create_session" ? await factorySessionPost(internal) : await factoryTurnPost(internal);
        if (response.headers.get("content-type")?.includes("text/event-stream")) return result(await readSse(response));
        const data = await response.json().catch(() => ({}));
        return response.ok ? result(data) : toolError("factory_failed", JSON.stringify(data));
      }
      case "github_list_repositories": {
        if (!client || !db) return toolError("unavailable", "Storage is not available.");
        const account = await getAccount(db, client.userId);
        if (account?.provider !== "github") return toolError("github_required", "Sign in to DevStack with GitHub to use GitHub tools.");
        const token = env.CHAT_COOKIE_SECRET ? await loadGithubToken(db, await resolveSealKeys(env.CHAT_COOKIE_SECRET), client.userId) : null;
        if (!token) return toolError("reauth", "Reconnect GitHub in DevStack before using this tool.");
        return result(await listWritableRepos(token));
      }
      case "github_commit_file": {
        if (!client || !db) return toolError("unavailable", "Storage is not available.");
        const account = await getAccount(db, client.userId);
        if (account?.provider !== "github") return toolError("github_required", "Sign in to DevStack with GitHub to use GitHub tools.");
        const repo = typeof args.repo === "string" ? parseRepo(args.repo) : null;
        const path = typeof args.path === "string" ? safeRepoPath(args.path) : null;
        const message = typeof args.message === "string" ? safeCommitMessage(args.message) : null;
        const branch = typeof args.branch === "string" && args.branch.trim() ? safeBranch(args.branch) : "main";
        const content = typeof args.content === "string" ? args.content : "";
        if (!repo || !path || !message || !branch || !content.trim() || content.length > MAX_FILE_CHARS) return toolError("invalid", "Repository, path, branch, commit message, or file content is invalid.");
        const token = env.CHAT_COOKIE_SECRET ? await loadGithubToken(db, await resolveSealKeys(env.CHAT_COOKIE_SECRET), client.userId) : null;
        if (!token) return toolError("reauth", "Reconnect GitHub in DevStack before committing.");
        return result({ ...(await putFile(token, { owner: repo.owner, repo: repo.name, path, message, content, branch })), repo: `${repo.owner}/${repo.name}`, branch, path });
      }
      default:
        return toolError("unknown_tool", `Unknown DevStack tool: ${name}`);
    }
  } catch (error) {
    const status = Number((error as { status?: number }).status ?? 0);
    return toolError(status === 429 ? "rate_limited" : status === 401 ? "unauthorized" : status === 403 ? "forbidden" : "internal", status ? (error as Error).message : "The requested DevStack operation failed.");
  }
}

export async function readResource(uri: string) {
  if (uri === "devstack://platform") return { contents: [{ uri, mimeType: "text/markdown", text: DOCS.find((d) => d.slug === "platform")?.raw ?? "" }] };
  if (uri === "devstack://templates") return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(TEMPLATES) }] };
  if (uri === "devstack://llms.txt") return { contents: [{ uri, mimeType: "text/plain", text: llmsTxt() }] };
  if (uri.startsWith("devstack://docs/")) {
    const doc = getDoc(decodeURIComponent(uri.slice("devstack://docs/".length)));
    if (doc) return { contents: [{ uri, mimeType: "text/markdown", text: doc.raw }] };
  }
  throw new Error("Resource not found.");
}

export function hasAllowedOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return true; // Native/server-side MCP clients normally omit Origin.
  try {
    const parsed = new URL(origin);
    if (["https://devstack.bid", "https://www.devstack.bid"].includes(parsed.origin)) return true;
    const localHost = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
    return localHost && ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

export async function handleMcpMessage(req: Request, rpc: RpcMessage) {
  const id = rpc.id;
  const method = typeof rpc.method === "string" ? rpc.method : "";
  const params = plain(rpc.params);
  const respond = (resultValue: unknown, status = 200, protocolVersion = req.headers.get("mcp-protocol-version") ?? PROTOCOL_VERSION) => new Response(JSON.stringify({ jsonrpc: "2.0", id, result: resultValue }), { status, headers: { ...jsonHeaders, "MCP-Protocol-Version": protocolVersion } });
  const fail = (code: number, message: string, status = 200) => new Response(JSON.stringify({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }), { status, headers: jsonHeaders });
  const isNotification = id === undefined;

  if (rpc.jsonrpc !== "2.0" || !method) return fail(-32600, "Invalid JSON-RPC request", 400);
  if (method === "notifications/initialized" || method.startsWith("notifications/")) return new Response(null, { status: 202, headers: { "Cache-Control": "no-store" } });
  if (method === "initialize") {
    const requested = typeof params.protocolVersion === "string" ? params.protocolVersion : PROTOCOL_VERSION;
    const supported = ["2025-11-25", "2025-06-18", "2025-03-26"];
    const negotiated = supported.includes(requested) ? requested : PROTOCOL_VERSION;
    return respond({ protocolVersion: negotiated, capabilities: { tools: { listChanged: false }, resources: { subscribe: false, listChanged: false } }, serverInfo: { name: "devstack-bid", version: "0.8.0", description: "NVX Stack Builder tools, docs, AI planning, chat, Factory, and GitHub integration." } }, 200, negotiated);
  }
  if (method === "ping") return respond({});
  if (method === "tools/list") return respond({ tools: MCP_TOOLS.map((tool) => Object.fromEntries(Object.entries(tool).filter(([key]) => key !== "requiredScope"))) });
  if (method === "tools/call") {
    const name = typeof params.name === "string" ? params.name : "";
    const resultValue = await callTool(req, name, params.arguments);
    return respond(resultValue);
  }
  if (method === "resources/list") return respond({ resources: [
    { uri: "devstack://platform", name: "Platform function index", mimeType: "text/markdown" },
    { uri: "devstack://templates", name: "Stack template catalog", mimeType: "application/json" },
    { uri: "devstack://llms.txt", name: "AI documentation index", mimeType: "text/plain" },
  ] });
  if (method === "resources/read") {
    try { return respond(await readResource(String(params.uri ?? ""))); }
    catch { return fail(-32602, "Resource not found"); }
  }
  if (method === "prompts/list") return respond({ prompts: [] });
  if (method === "tools/subscribe") return fail(-32601, "Method not found");
  return isNotification ? new Response(null, { status: 202 }) : fail(-32601, `Method not found: ${method}`);
}

export function parseMcpBody(raw: unknown): RpcMessage | RpcMessage[] | null {
  if (Array.isArray(raw)) return raw.length > 0 && raw.length <= 20 && raw.every((item) => item && typeof item === "object") ? raw as RpcMessage[] : null;
  return raw && typeof raw === "object" ? raw as RpcMessage : null;
}

export { MAX_RPC_BODY, PROTOCOL_VERSION, jsonHeaders };
