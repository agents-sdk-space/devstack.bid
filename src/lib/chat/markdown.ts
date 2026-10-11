/**
 * Tiny Markdown parser for chat replies. It produces a plain AST that the React renderer turns
 * into elements — no HTML strings, no dangerouslySetInnerHTML. Raw HTML in the source is shown
 * as text. Links are limited to http(s), site-relative paths and #anchors; images only render
 * from our own /api/chat/ routes (anything else becomes a link), so a reply can't load trackers.
 */

export type Inline =
  | { k: "text"; v: string }
  | { k: "code"; v: string }
  | { k: "strong"; c: Inline[] }
  | { k: "em"; c: Inline[] }
  | { k: "link"; href: string; c: Inline[] }
  | { k: "img"; src: string; alt: string };

export type Block =
  | { k: "p"; c: Inline[] }
  | { k: "h"; level: 1 | 2 | 3 | 4; c: Inline[] }
  | { k: "code"; lang: string; v: string }
  | { k: "ul" | "ol"; items: Inline[][] }
  | { k: "quote"; c: Block[] }
  | { k: "table"; head: Inline[][]; rows: Inline[][][] }
  | { k: "hr" };

export function safeHref(raw: string): string | null {
  const url = raw.trim().replace(/^<|>$/g, "");
  if (/^https?:\/\/[^\s]+$/i.test(url)) return url;
  if (/^\/(?!\/)[^\s]*$/.test(url)) return url;
  if (/^#[\w-]*$/.test(url)) return url;
  return null;
}

export function safeImageSrc(raw: string): string | null {
  const url = raw.trim();
  return /^\/api\/chat\/(images|files)\/[\w/-]+$/.test(url) ? url : null;
}

const INLINE =
  /(`+)([\s\S]*?[^`])\1(?!`)|!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|\*\*([\s\S]+?)\*\*|__([\s\S]+?)__|\*([^*\s][^*]*?)\*|(?<![\w])_([^_\s][^_]*?)_(?![\w])|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/;

export function parseInline(src: string, depth = 0): Inline[] {
  const out: Inline[] = [];
  let rest = src;
  const pushText = (v: string) => {
    if (!v) return;
    const last = out[out.length - 1];
    if (last && last.k === "text") last.v += v;
    else out.push({ k: "text", v });
  };
  while (rest) {
    const m = depth > 4 ? null : INLINE.exec(rest);
    if (!m) {
      pushText(rest);
      break;
    }
    pushText(rest.slice(0, m.index));
    rest = rest.slice(m.index + m[0].length);
    if (m[1]) out.push({ k: "code", v: m[2].replace(/^ (.*) $/, "$1") });
    else if (m[4] !== undefined) {
      const src2 = safeImageSrc(m[4]);
      if (src2) out.push({ k: "img", src: src2, alt: m[3] ?? "" });
      else {
        const href = safeHref(m[4]);
        if (href) out.push({ k: "link", href, c: [{ k: "text", v: m[3] || href }] });
        else pushText(m[3] ?? "");
      }
    } else if (m[5] !== undefined) {
      const href = safeHref(m[6]);
      if (href) out.push({ k: "link", href, c: parseInline(m[5], depth + 1) });
      else pushText(m[5]);
    } else if (m[7] !== undefined || m[8] !== undefined) out.push({ k: "strong", c: parseInline(m[7] ?? m[8], depth + 1) });
    else if (m[9] !== undefined || m[10] !== undefined) out.push({ k: "em", c: parseInline(m[9] ?? m[10], depth + 1) });
    else if (m[11]) out.push({ k: "link", href: m[11], c: [{ k: "text", v: m[11] }] });
  }
  return out;
}

const LIST = /^\s{0,3}([-*+]|\d{1,3}[.)])\s+(.*)$/;
const isTableSep = (l: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(l);
const cells = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => parseInline(c.trim()));

export function parseMarkdown(src: string, depth = 0): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const fence = /^\s{0,3}(```|~~~)\s*([\w+#.-]*)/.exec(line);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith(fence[1])) body.push(lines[i++]);
      i++;
      blocks.push({ k: "code", lang: fence[2] ?? "", v: body.join("\n") });
      continue;
    }
    const h = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (h) {
      blocks.push({ k: "h", level: Math.min(4, h[1].length) as 1 | 2 | 3 | 4, c: parseInline(h[2]) });
      i++;
      continue;
    }
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) {
      blocks.push({ k: "hr" });
      i++;
      continue;
    }
    if (/^\s{0,3}>/.test(line) && depth < 3) {
      const body: string[] = [];
      while (i < lines.length && /^\s{0,3}>/.test(lines[i])) body.push(lines[i++].replace(/^\s{0,3}>\s?/, ""));
      blocks.push({ k: "quote", c: parseMarkdown(body.join("\n"), depth + 1) });
      continue;
    }
    if (line.includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const head = cells(line);
      i += 2;
      const rows: Inline[][][] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) rows.push(cells(lines[i++]));
      blocks.push({ k: "table", head, rows });
      continue;
    }
    const li = LIST.exec(line);
    if (li) {
      const ordered = /\d/.test(li[1]);
      const items: string[] = [];
      while (i < lines.length) {
        const m = LIST.exec(lines[i]);
        if (m && /\d/.test(m[1]) === ordered) items.push(m[2]);
        else if (lines[i].trim() && /^\s{2,}/.test(lines[i]) && items.length) items[items.length - 1] += ` ${lines[i].trim()}`;
        else break;
        i++;
      }
      blocks.push({ k: ordered ? "ol" : "ul", items: items.map((t) => parseInline(t)) });
      continue;
    }
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^\s{0,3}(```|~~~|#{1,6}\s|>)/.test(lines[i]) &&
      !LIST.exec(lines[i]) &&
      !(lines[i].includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1]))
    )
      para.push(lines[i++].trim());
    if (para.length) blocks.push({ k: "p", c: parseInline(para.join("\n")) });
    else i++;
  }
  return blocks;
}
