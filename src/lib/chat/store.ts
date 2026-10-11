/**
 * D1 persistence for /chat (tables from migrations 0002 + 0003). `D1Like` is the subset of the
 * D1Database API we use, so tests can pass a SQLite-backed fake.
 */

export interface D1Result<T = unknown> {
  results?: T[];
  meta?: unknown;
}
export interface D1Stmt {
  bind(...values: unknown[]): D1Stmt;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}
export interface D1Like {
  prepare(sql: string): D1Stmt;
  batch(stmts: D1Stmt[]): Promise<D1Result[]>;
}

export interface ConversationRow {
  id: string;
  title: string | null;
  model: string | null;
  created_at: number;
  updated_at: number;
  archived: number;
  agent_session_id: string | null;
  source: "chat" | "factory";
  environment: string | null;
  channel: "user" | "dev";
}
export interface MessageRow {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  tokens_in: number | null;
  tokens_out: number | null;
  model: string | null;
  created_at: number;
  meta: string | null;
}

/** Time-ordered id (UUIDv7-style: 48-bit ms timestamp + random) so ids sort by creation. */
export function newId(now = Date.now()): string {
  const hex = now.toString(16).padStart(12, "0");
  const rand = crypto.getRandomValues(new Uint8Array(10));
  const r = Array.from(rand, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-7${r.slice(0, 3)}-${((parseInt(r.slice(3, 4), 16) & 0x3) | 0x8).toString(16)}${r.slice(4, 7)}-${r.slice(7, 19)}`;
}

export async function ensureUser(db: D1Like, uid: string): Promise<void> {
  await db.prepare("INSERT INTO users (id) VALUES (?1) ON CONFLICT (id) DO NOTHING").bind(uid).run();
}

export async function listConversations(
  db: D1Like,
  uid: string,
  limit = 50,
  source: "chat" | "factory" = "chat",
  channel: "user" | "dev" = source === "factory" ? "dev" : "user"
): Promise<ConversationRow[]> {
  const r = await db
    .prepare(
      "SELECT id, title, model, created_at, updated_at, archived, agent_session_id, source, environment, channel FROM conversations WHERE user_id = ?1 AND archived = 0 AND source = ?3 AND channel = ?4 ORDER BY updated_at DESC LIMIT ?2"
    )
    .bind(uid, limit, source, channel)
    .all<ConversationRow>();
  return r.results ?? [];
}

export async function getConversation(db: D1Like, uid: string, id: string): Promise<ConversationRow | null> {
  return db
    .prepare("SELECT id, title, model, created_at, updated_at, archived, agent_session_id, source, environment, channel FROM conversations WHERE id = ?1 AND user_id = ?2")
    .bind(id, uid)
    .first<ConversationRow>();
}

export async function createConversation(
  db: D1Like,
  uid: string,
  title: string,
  model: string,
  opts: { source?: "chat" | "factory"; environment?: string; agentSessionId?: string; channel?: "user" | "dev" } = {}
): Promise<string> {
  const id = newId();
  const channel = opts.channel ?? (opts.source === "factory" ? "dev" : "user");
  await db
    .prepare("INSERT INTO conversations (id, user_id, title, model, source, environment, agent_session_id, channel) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)")
    .bind(id, uid, title, model, opts.source ?? "chat", opts.environment ?? null, opts.agentSessionId ?? null, channel)
    .run();
  return id;
}

export async function setAgentSession(db: D1Like, conversationId: string, sessionId: string | null): Promise<void> {
  await db.prepare("UPDATE conversations SET agent_session_id = ?2 WHERE id = ?1").bind(conversationId, sessionId).run();
}

export async function archiveConversation(db: D1Like, uid: string, id: string): Promise<boolean> {
  const r = await db.prepare("UPDATE conversations SET archived = 1 WHERE id = ?1 AND user_id = ?2").bind(id, uid).run();
  return Number((r.meta as { changes?: number } | undefined)?.changes ?? 0) > 0;
}

export async function renameConversation(db: D1Like, uid: string, id: string, title: string): Promise<boolean> {
  const r = await db.prepare("UPDATE conversations SET title = ?3 WHERE id = ?1 AND user_id = ?2").bind(id, uid, title).run();
  return Number((r.meta as { changes?: number } | undefined)?.changes ?? 0) > 0;
}

export async function listMessages(db: D1Like, conversationId: string, limit = 200): Promise<MessageRow[]> {
  const r = await db
    .prepare(
      "SELECT id, role, content, tokens_in, tokens_out, model, created_at, meta FROM messages WHERE conversation_id = ?1 ORDER BY created_at ASC, id ASC LIMIT ?2"
    )
    .bind(conversationId, limit)
    .all<MessageRow>();
  return r.results ?? [];
}

export async function addMessage(
  db: D1Like,
  m: { conversationId: string; role: MessageRow["role"]; content: string; model?: string | null; createdAt?: number }
): Promise<string> {
  const id = newId(m.createdAt);
  await db
    .prepare("INSERT INTO messages (id, conversation_id, role, content, model, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
    .bind(id, m.conversationId, m.role, m.content, m.model ?? null, m.createdAt ?? Date.now())
    .run();
  return id;
}

export async function finishMessage(
  db: D1Like,
  m: { id: string; conversationId: string; content: string; tokensIn: number | null; tokensOut: number | null; meta: unknown }
): Promise<void> {
  await db.batch([
    db
      .prepare("UPDATE messages SET content = ?2, tokens_in = ?3, tokens_out = ?4, meta = ?5 WHERE id = ?1")
      .bind(m.id, m.content, m.tokensIn, m.tokensOut, JSON.stringify(m.meta)),
    db.prepare("UPDATE conversations SET updated_at = unixepoch('subsec') * 1000 WHERE id = ?1").bind(m.conversationId),
  ]);
}

/** Store a generated image inline (R2 is not enabled yet). Returns the attachment id. */
export async function saveInlineImage(db: D1Like, messageId: string, bytes: Uint8Array, mime: string): Promise<string> {
  const id = newId();
  await db.batch([
    db.prepare("INSERT INTO attachments (id, message_id, r2_key, mime, size) VALUES (?1, ?2, ?3, ?4, ?5)").bind(id, messageId, `inline/${id}`, mime, bytes.byteLength),
    db.prepare("INSERT INTO attachment_blobs (attachment_id, data) VALUES (?1, ?2)").bind(id, bytes),
  ]);
  return id;
}

/** Load an inline image only if it belongs to one of the caller's conversations. */
export async function loadInlineImage(db: D1Like, uid: string, attachmentId: string): Promise<{ data: ArrayBuffer | Uint8Array | number[]; mime: string } | null> {
  return db
    .prepare(
      `SELECT b.data AS data, a.mime AS mime FROM attachments a
       JOIN attachment_blobs b ON b.attachment_id = a.id
       JOIN messages m ON m.id = a.message_id
       JOIN conversations c ON c.id = m.conversation_id
       WHERE a.id = ?1 AND c.user_id = ?2`
    )
    .bind(attachmentId, uid)
    .first<{ data: ArrayBuffer | Uint8Array | number[]; mime: string }>();
}
