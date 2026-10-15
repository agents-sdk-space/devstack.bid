import type { UiEvent } from "./events";

/**
 * Chat stream persistence to R2 (binding CHAT_STREAMS). D1 keeps the existing messages exactly as before;
 * this adds the streamed reply and thinking steps of each turn as one JSON object:
 *   chat/<uid>/<conversationId>/<messageId>.json
 * Consecutive `delta` events are merged so the object stays small; `reasoning` activities are dropped
 * (same secret-free vocabulary the browser already receives). Archiving never breaks a turn.
 */

export interface R2Like {
  put(key: string, value: string, opts?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }): Promise<unknown>;
  get(key: string): Promise<{ text(): Promise<string> } | null>;
}

export interface ArchivedTurn {
  v: 1;
  conversationId: string;
  messageId: string;
  startedAt: number;
  finishedAt: number;
  events: (UiEvent & { at: number })[];
}

export const MAX_ARCHIVE_EVENTS = 2_000;
export const MAX_ARCHIVE_BYTES = 1_000_000;

export const archiveKey = (uid: string, conversationId: string, messageId: string) => `chat/${uid}/${conversationId}/${messageId}.json`;

export function createRecorder(now: () => number = Date.now) {
  const events: (UiEvent & { at: number })[] = [];
  const startedAt = now();
  let bytes = 0;
  return {
    record(e: UiEvent) {
      if (e.t === "quota") return;
      if (e.t === "activity" && e.a.kind === "reasoning") return;
      const last = events[events.length - 1];
      if (e.t === "delta" && last?.t === "delta" && last.item === e.item) {
        if (bytes + e.text.length > MAX_ARCHIVE_BYTES) return;
        last.text += e.text;
        bytes += e.text.length;
        return;
      }
      if (e.t === "activity") {
        const i = events.findIndex((x) => x.t === "activity" && x.a.id === e.a.id);
        if (i >= 0) {
          events[i] = { ...e, at: now() };
          return;
        }
      }
      if (events.length >= MAX_ARCHIVE_EVENTS) return;
      const size = JSON.stringify(e).length;
      if (bytes + size > MAX_ARCHIVE_BYTES) return;
      bytes += size;
      events.push({ ...e, at: now() });
    },
    snapshot(conversationId: string, messageId: string): ArchivedTurn {
      return { v: 1, conversationId, messageId, startedAt, finishedAt: now(), events: events.map((e) => ({ ...e })) };
    },
  };
}

export async function saveArchive(bucket: R2Like | null | undefined, uid: string, turn: ArchivedTurn): Promise<boolean> {
  if (!bucket) return false;
  try {
    await bucket.put(archiveKey(uid, turn.conversationId, turn.messageId), JSON.stringify(turn), {
      httpMetadata: { contentType: "application/json" },
      customMetadata: { v: "1", events: String(turn.events.length) },
    });
    return true;
  } catch (err) {
    console.warn(JSON.stringify({ at: "chat/archive", event: "put_failed", name: (err as Error)?.name }));
    return false;
  }
}

export async function loadArchive(bucket: R2Like | null | undefined, uid: string, conversationId: string, messageId: string): Promise<ArchivedTurn | null> {
  if (!bucket) return null;
  const obj = await bucket.get(archiveKey(uid, conversationId, messageId)).catch(() => null);
  if (!obj) return null;
  try {
    const t = JSON.parse(await obj.text()) as ArchivedTurn;
    return t?.v === 1 ? t : null;
  } catch {
    return null;
  }
}
