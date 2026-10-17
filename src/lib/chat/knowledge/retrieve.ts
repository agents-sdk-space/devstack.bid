/**
 * Tiny keyword retrieval over the bundled Cloudflare Agents chat client SDK notes
 * (agents-chat-sdk.json, our own summary of developers.cloudflare.com docs).
 * No embeddings, no network: score chunks by keyword hits and return the best few, capped in size,
 * only when the question is about that SDK. Keeps the extra prompt cost small.
 */
import kb from "./agents-chat-sdk.json";

export interface Chunk {
  id: string;
  title: string;
  keywords: string[];
  text: string;
}

export const KNOWLEDGE = kb as { id: string; version: string; source: string; checked: string; chunks: Chunk[] };

// Strong signals that the question is about the Cloudflare Agents chat/client SDK.
const TOPIC =
  /\b(use-?agent(-?chat)?|agent-?client|agent-?fetch|ai-?chat-?agent|@cloudflare\/ai-chat|agents\/(react|client|chat)|agents[ -]sdk|client[ -]sdk|chat[ -]agents?|onchatmessage|needsapproval|addtool(output|approvalresponse)|websocketchattransport|persistmessages|savemessages|maxpersistedmessages|@callable|callable\(|human[- ]in[- ]the[- ]loop|resumable stream)/i;
const SOFT = /(cloudflare|durable object|เอเจนต์|agent)/i;
const SOFT2 = /(chat|แชท|websocket|stream|tool|state|sdk|react|hook|client)/i;

export function isSdkQuestion(text: string): boolean {
  return TOPIC.test(text) || (SOFT.test(text) && SOFT2.test(text));
}

const norm = (s: string) => s.toLowerCase().replace(/[-_]/g, "");

export function retrieve(text: string, limit = 3): Chunk[] {
  const q = norm(text);
  const scored = KNOWLEDGE.chunks
    .map((c, i) => {
      let score = 0;
      for (const k of c.keywords) if (q.includes(norm(k))) score += k.length > 6 ? 2 : 1;
      if (q.includes(norm(c.title))) score += 2;
      return { c, score, i };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, limit)
    .map((s) => s.c);
  return scored.length ? scored : [KNOWLEDGE.chunks[0]];
}

/** Compact reference block for an SDK question, at most `maxChars`; "" when not relevant or no room. */
export function sdkContext(text: string, maxChars = 1200): string {
  if (maxChars < 200 || !isSdkQuestion(text)) return "";
  const head = `Reference notes (Cloudflare Agents chat client SDK, source ${KNOWLEDGE.source}):`;
  let out = head;
  for (const c of retrieve(text)) {
    const line = `\n- ${c.title}: ${c.text}`;
    if (out.length + line.length > maxChars) {
      const room = maxChars - out.length - 1;
      if (room > 120) out += line.slice(0, room) + "…";
      break;
    }
    out += line;
  }
  return out === head ? "" : out;
}

/** Marker the implemented.stream proxy (v10.5.0) puts before its own appended SDK notes. */
export const PROXY_CONTEXT_MARK = "\n\n[[implemented.stream reference]]\n";

/** Drop notes appended by the implemented.stream proxy; this engine does its own retrieval. */
export function stripProxyContext(message: string): string {
  const i = message.indexOf(PROXY_CONTEXT_MARK);
  return i >= 0 ? message.slice(0, i).trim() : message;
}
