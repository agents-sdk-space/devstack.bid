import type { ResolvedStep, StarterFile, StepKind } from "./types";

/**
 * Sanitisation for untrusted content (AI output, share links, user-typed steps).
 * Everything is treated as text to display/export — never executed server-side.
 */

const MAX_COMMAND = 400;
const MAX_TEXT = 1200;
const MAX_FILE = 12_000;

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u001B]/g;
const ANSI = /\u001B\[[0-9;?]*[ -/]*[@-~]/g;

/** Commands that are destructive on any machine. They are dropped entirely. */
const BLOCKED: RegExp[] = [
  /\brm\s+-[a-z]*r[a-z]*\s+(-[a-z]+\s+)*(\/|~|\$HOME|\*|\/\*)(\s|$)/i,
  /\bsudo\s+rm\b/i,
  /\bmkfs(\.[a-z0-9]+)?\b/i,
  /\bdd\s+if=/i,
  /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/,
  /\b(shutdown|reboot|halt|poweroff)\b/i,
  /\bchmod\s+(-R\s+)?777\s+\//i,
  />\s*\/dev\/(sd[a-z]|nvme|disk)/i,
  /\bformat\s+[a-z]:/i,
  /Remove-Item\b.*-Recurse.*\s(C:\\|\/|~)(\s|$)/i,
  /\bdel\s+\/[sq].*\s[a-z]:\\/i,
];

/** Commands that are legitimate but deserve a human look (kept, marked manual). */
const RISKY: RegExp[] = [
  /\b(curl|wget|iwr|irm|Invoke-WebRequest|Invoke-RestMethod)\b[^|]*\|\s*(sudo\s+)?(sh|bash|zsh|iex|python3?|node)\b/i,
  /\bsudo\b/i,
  /\beval\b/i,
  /\b(npm|pnpm|yarn)\s+publish\b/i,
  /\btwine\s+upload\b/i,
  /\bgit\s+push\b.*--force/i,
];

export function cleanText(value: unknown, max = MAX_TEXT): string {
  if (typeof value !== "string") return "";
  return value.replace(ANSI, "").replace(CONTROL, "").trim().slice(0, max);
}

export function isBlockedCommand(cmd: string): boolean {
  return BLOCKED.some((re) => re.test(cmd));
}

export function isRiskyCommand(cmd: string): boolean {
  return RISKY.some((re) => re.test(cmd));
}

/** Single-line, length-limited command. Returns "" when blocked or empty. */
export function cleanCommand(value: unknown): string {
  const text = cleanText(value, MAX_COMMAND * 2).replace(/[\r\n]+/g, " ").trim().slice(0, MAX_COMMAND);
  if (!text || isBlockedCommand(text)) return "";
  return text;
}

/** Relative, traversal-free file path. Returns "" when invalid. */
export function cleanPath(value: unknown): string {
  const path = cleanText(value, 200).replace(/\\/g, "/").replace(/^\.\//, "");
  if (!path || path.startsWith("/") || /^[a-z]:/i.test(path) || path.split("/").includes("..")) return "";
  if (!/^[\w@.\-/ ()[\]+]+$/.test(path)) return "";
  return path;
}

export function cleanFile(value: unknown): StarterFile | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const path = cleanPath(v.path);
  if (!path || typeof v.content !== "string") return null;
  const content = v.content.replace(ANSI, "").replace(/\r\n/g, "\n").slice(0, MAX_FILE);
  // Would break the heredoc / here-string used by setup.sh / setup.ps1.
  if (/^NVX_EOF$/m.test(content) || /^'@/m.test(content)) return null;
  return { path, content };
}

function l10n(value: unknown, max = MAX_TEXT): { en: string; th: string } {
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    const en = cleanText(v.en, max);
    const th = cleanText(v.th, max);
    return { en: en || th, th: th || en };
  }
  const text = cleanText(value, max);
  return { en: text, th: text };
}

/**
 * Validate a custom step (from AI, a share link, or the user). Blocked commands are removed;
 * steps with risky commands become "manual" so scripts comment them out.
 */
export function sanitizeStep(value: unknown, idHint?: string): ResolvedStep | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const title = l10n(v.title, 120);
  if (!title.en) return null;
  const commands = (Array.isArray(v.commands) ? v.commands : []).slice(0, 12).map(cleanCommand).filter(Boolean);
  const windowsRaw = Array.isArray(v.windows) ? v.windows.slice(0, 12).map(cleanCommand).filter(Boolean) : commands;
  const files = (Array.isArray(v.files) ? v.files : []).slice(0, 8).map(cleanFile).filter((f): f is StarterFile => f !== null);
  if (commands.length === 0 && files.length === 0) return null;
  const verifyText = cleanCommand(v.verify);
  const risky = [...commands, ...windowsRaw, verifyText].some((c) => c && isRiskyCommand(c));
  const kinds: StepKind[] = ["setup", "longRunning", "publish", "manual"];
  const requested = kinds.includes(v.kind as StepKind) ? (v.kind as StepKind) : "setup";
  const rawId = typeof v.id === "string" && /^custom-[a-z0-9-]{1,40}$/.test(v.id) ? v.id : idHint;
  return {
    id: rawId ?? `custom-${Math.abs(hash(title.en + commands.join("|"))).toString(36)}`,
    title,
    explanation: l10n(v.explanation),
    commands,
    windows: windowsRaw,
    files,
    expected: l10n(v.expected ?? ""),
    verify: verifyText || undefined,
    verifyWindows: verifyText || undefined,
    kind: risky && requested === "setup" ? "manual" : requested,
    source: "custom",
  };
}

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
  return h;
}
