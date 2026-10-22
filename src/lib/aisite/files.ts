/**
 * Validation for AI-generated site files. Generated code is untrusted: it is only ever served from
 * *.devstack.bid (sites worker), never from the apex. These checks bound what the model can write.
 */
export interface SiteFileText { path: string; content: string }

export const MAX_FILES = 40;
export const MAX_FILE_BYTES = 200 * 1024;
export const MAX_TOTAL_BYTES = 800 * 1024; // stays well under the D1 2 MB row limit
/** Plain static output only: anything here is served as-is, no build step needed. */
export const ALLOWED_EXT = new Set(["html", "css", "js", "mjs", "json", "svg", "txt", "xml", "webmanifest", "md"]);

const SEG = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}$/;

export class FileError extends Error {
  constructor(message: string) { super(message); this.name = "FileError"; }
}

/** Normalised relative path, or null: no traversal, no hidden/absolute/backslash paths, allowed extension, depth <= 6. */
export function safePath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const p = raw.trim().replace(/^\.\/+/, "");
  if (!p || p.length > 200 || p.startsWith("/") || p.includes("\\") || p.includes("\0") || /%[0-9a-f]{2}/i.test(p)) return null;
  const parts = p.split("/");
  if (parts.length > 6 || parts.some((s) => s === "." || s === ".." || !SEG.test(s))) return null;
  const ext = parts[parts.length - 1].split(".").pop()!.toLowerCase();
  if (!parts[parts.length - 1].includes(".") || !ALLOWED_EXT.has(ext)) return null;
  return parts.join("/");
}

const bytes = (s: string) => new TextEncoder().encode(s).length;

/** Validate a complete snapshot. Throws FileError with a user-safe message. */
export function validateSnapshot(files: SiteFileText[]): { files: SiteFileText[]; bytes: number } {
  if (files.length > MAX_FILES) throw new FileError(`Too many files (max ${MAX_FILES}).`);
  const seen = new Set<string>();
  let total = 0;
  const out: SiteFileText[] = [];
  for (const f of files) {
    const p = safePath(f.path);
    if (!p) throw new FileError(`Invalid file path: ${String(f.path).slice(0, 80)}`);
    if (seen.has(p.toLowerCase())) throw new FileError(`Duplicate file: ${p}`);
    if (typeof f.content !== "string") throw new FileError(`Invalid content: ${p}`);
    const n = bytes(f.content);
    if (n > MAX_FILE_BYTES) throw new FileError(`File too large: ${p}`);
    total += n;
    if (total > MAX_TOTAL_BYTES) throw new FileError("Site too large.");
    seen.add(p.toLowerCase());
    out.push({ path: p, content: f.content });
  }
  if (!seen.has("index.html")) throw new FileError("The site needs an index.html.");
  out.sort((a, b) => a.path.localeCompare(b.path));
  return { files: out, bytes: total };
}

export interface FileEdit {
  /** Full-file replacement (create or overwrite). */
  write?: SiteFileText[];
  /** Search/replace edits on existing files; `find` must match exactly once. */
  replace?: { path: string; find: string; with: string }[];
  delete?: string[];
}

/** Apply model edits to the current snapshot. Unknown paths in replace/delete are errors (never silently ignored). */
export function applyEdits(current: SiteFileText[], edit: FileEdit): SiteFileText[] {
  const map = new Map(current.map((f) => [f.path, f.content]));
  for (const d of edit.delete ?? []) {
    const p = safePath(d);
    if (!p || !map.has(p)) throw new FileError(`Cannot delete missing file: ${String(d).slice(0, 80)}`);
    map.delete(p);
  }
  for (const w of edit.write ?? []) {
    const p = safePath(w.path);
    if (!p) throw new FileError(`Invalid file path: ${String(w.path).slice(0, 80)}`);
    map.set(p, String(w.content ?? ""));
  }
  for (const r of edit.replace ?? []) {
    const p = safePath(r.path);
    const cur = p ? map.get(p) : undefined;
    if (!p || cur === undefined) throw new FileError(`Cannot edit missing file: ${String(r.path).slice(0, 80)}`);
    if (!r.find) throw new FileError(`Empty search text in ${p}`);
    const i = cur.indexOf(r.find);
    if (i < 0 || cur.indexOf(r.find, i + 1) >= 0) throw new FileError(`Edit did not match exactly once in ${p}`);
    map.set(p, cur.slice(0, i) + String(r.with ?? "") + cur.slice(i + r.find.length));
  }
  return validateSnapshot([...map].map(([path, content]) => ({ path, content }))).files;
}

/**
 * Context for follow-up turns: the full file tree, plus file bodies up to a budget (index.html, css and js first,
 * then smaller files). Files beyond the budget are listed only, so the model must use full-file writes for them.
 */
export function editContext(files: SiteFileText[], budget = 60_000): string {
  const tree = files.map((f) => `- ${f.path} (${bytes(f.content)} bytes)`).join("\n");
  const rank = (p: string) => (p === "index.html" ? 0 : /\.(css|js)$/.test(p) ? 1 : 2);
  const ordered = [...files].sort((a, b) => rank(a.path) - rank(b.path) || a.content.length - b.content.length);
  let used = 0;
  const bodies: string[] = [];
  for (const f of ordered) {
    if (used + f.content.length > budget) continue;
    used += f.content.length;
    bodies.push(`<<<FILE ${f.path}\n${f.content}\n>>>END`);
  }
  return `FILE TREE:\n${tree}\n\nFILE CONTENTS:\n${bodies.join("\n")}`;
}
