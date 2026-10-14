/**
 * D1 persistence for /chat (tables from migrations 0002 + 0003). `D1Like` is the subset of the
 * D1Database API we use, so tests can pass a SQLite-backed fake.
 */

import { safeAvatar } from "@/lib/auth/oauth-flow";

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

export type AccountProvider = "github" | "google" | "cursor" | "password";

export interface AccountView {
  login: string;
  name: string | null;
  avatarUrl: string | null;
  provider: AccountProvider;
}

const ACCOUNT_PROVIDERS = new Set<AccountProvider>(["github", "google", "cursor", "password"]);

export async function findUserByAuth(db: D1Like, provider: string, subject: string): Promise<{ id: string } | null> {
  return db.prepare("SELECT id FROM users WHERE auth_provider = ?1 AND auth_subject = ?2").bind(provider, subject).first<{ id: string }>();
}

/** Anonymous cookie ids can be linked only while that row has no provider yet (or does not exist). */
export async function linkableAnonId(db: D1Like, anonId: string | null): Promise<string | null> {
  if (!anonId) return null;
  const row = await db.prepare("SELECT auth_provider FROM users WHERE id = ?1").bind(anonId).first<{ auth_provider: string | null }>();
  return !row || row.auth_provider == null ? anonId : null;
}

export async function getAccount(db: D1Like, id: string): Promise<AccountView | null> {
  const row = await db
    .prepare("SELECT login, display_name, avatar_url, auth_provider FROM users WHERE id = ?1")
    .bind(id)
    .first<{ login: string | null; display_name: string | null; avatar_url: string | null; auth_provider: string | null }>();
  if (!row?.login || !row.auth_provider || !ACCOUNT_PROVIDERS.has(row.auth_provider as AccountProvider)) return null;
  const provider = row.auth_provider as AccountProvider;
  return { login: row.login, name: row.display_name, avatarUrl: safeAvatar(provider, row.avatar_url), provider };
}

export interface OAuthProfileRow {
  provider: "github" | "google" | "cursor";
  subject: string;
  login: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
}

export interface AccountPlanRow {
  userId: string;
  promoteAnon: boolean;
  create: boolean;
  moveFrom: string | null;
}

/** Attach a Cursor, Google or GitHub identity. Moves anonymous chats when asked. Does not store an OAuth token. */
export async function saveOAuthAccount(db: D1Like, plan: AccountPlanRow, profile: OAuthProfileRow, credential?: { tokenEnc: string; scope: string }): Promise<void> {
  const email = profile.email?.slice(0, 200) ?? null;
  const avatar = profile.avatarUrl?.slice(0, 500) ?? null;
  const login = profile.login.slice(0, 200);
  const name = profile.name?.slice(0, 120) ?? null;
  const stmts: D1Stmt[] = [];
  if (plan.create || plan.promoteAnon) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO users (id, auth_provider, auth_subject, email, display_name, login, avatar_url)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
           ON CONFLICT (id) DO UPDATE SET
             auth_provider = excluded.auth_provider,
             auth_subject = excluded.auth_subject,
             email = excluded.email,
             display_name = excluded.display_name,
             login = excluded.login,
             avatar_url = excluded.avatar_url`
        )
        .bind(plan.userId, profile.provider, profile.subject, email, name, login, avatar)
    );
  } else {
    stmts.push(
      db
        .prepare("UPDATE users SET email = ?2, display_name = ?3, login = ?4, avatar_url = ?5 WHERE id = ?1 AND auth_provider = ?6")
        .bind(plan.userId, email, name, login, avatar, profile.provider)
    );
  }
  if (plan.moveFrom) stmts.push(db.prepare("UPDATE conversations SET user_id = ?2 WHERE user_id = ?1").bind(plan.moveFrom, plan.userId));
  if (credential && profile.provider === "github") {
    stmts.push(
      db
        .prepare(
          `INSERT INTO github_credentials (user_id, token_enc, scope) VALUES (?1, ?2, ?3)
           ON CONFLICT (user_id) DO UPDATE SET token_enc = excluded.token_enc, scope = excluded.scope, updated_at = unixepoch('subsec') * 1000`
        )
        .bind(plan.userId, credential.tokenEnc, credential.scope)
    );
  }
  await db.batch(stmts);
}

export interface PasswordRow {
  userId: string;
  hash: string;
  salt: string;
  iterations: number;
}

export async function findPasswordAccount(db: D1Like, email: string): Promise<PasswordRow | null> {
  const row = await db
    .prepare(
      `SELECT u.id AS user_id, p.password_hash AS hash, p.salt AS salt, p.iterations AS iterations
       FROM users u JOIN password_credentials p ON p.user_id = u.id
       WHERE u.auth_provider = 'password' AND u.auth_subject = ?1`
    )
    .bind(email)
    .first<{ user_id: string; hash: string; salt: string; iterations: number }>();
  if (!row) return null;
  return { userId: row.user_id, hash: row.hash, salt: row.salt, iterations: Number(row.iterations) };
}

/** Create a DevStack password account and, when asked, move anonymous chats onto it. */
export async function savePasswordAccount(
  db: D1Like,
  plan: AccountPlanRow,
  email: string,
  secret: { hash: string; salt: string; iterations: number }
): Promise<void> {
  const stmts: D1Stmt[] = [
    db
      .prepare(
        `INSERT INTO users (id, auth_provider, auth_subject, email, display_name, login, avatar_url)
         VALUES (?1, 'password', ?2, ?2, NULL, ?2, NULL)
         ON CONFLICT (id) DO UPDATE SET
           auth_provider = 'password',
           auth_subject = excluded.auth_subject,
           email = excluded.email,
           display_name = NULL,
           login = excluded.login,
           avatar_url = NULL`
      )
      .bind(plan.userId, email),
  ];
  if (plan.moveFrom) stmts.push(db.prepare("UPDATE conversations SET user_id = ?2 WHERE user_id = ?1").bind(plan.moveFrom, plan.userId));
  stmts.push(
    db
      .prepare(
        `INSERT INTO password_credentials (user_id, password_hash, salt, iterations) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT (user_id) DO UPDATE SET password_hash = excluded.password_hash, salt = excluded.salt, iterations = excluded.iterations, updated_at = unixepoch('subsec') * 1000`
      )
      .bind(plan.userId, secret.hash, secret.salt, secret.iterations)
  );
  await db.batch(stmts);
}

export async function githubTokenEnc(db: D1Like, userId: string): Promise<string | null> {
  const row = await db.prepare("SELECT token_enc FROM github_credentials WHERE user_id = ?1").bind(userId).first<{ token_enc: string }>();
  return row?.token_enc ?? null;
}

export async function deleteGithubCredential(db: D1Like, userId: string): Promise<void> {
  await db.prepare("DELETE FROM github_credentials WHERE user_id = ?1").bind(userId).run();
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
