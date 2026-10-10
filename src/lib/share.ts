import { z } from "zod";
import { normalizeConfig } from "./composer";
import { sanitizeStep } from "./sanitize";
import type { BuilderConfig, BuilderEdits, ResolvedStep } from "./types";

/** Shareable state encoded in the URL hash (#s=...). The hash never reaches the server. */
export interface ShareState {
  config: BuilderConfig;
  edits: BuilderEdits;
}

const shareSchema = z.object({
  v: z.literal(1),
  c: z.record(z.string(), z.unknown()),
  o: z.array(z.string().max(80)).max(100).optional(),
  r: z.array(z.string().max(80)).max(100).optional(),
  x: z.array(z.unknown()).max(20).optional(),
});

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): string {
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeShare(state: ShareState): string {
  const payload = {
    v: 1 as const,
    c: state.config,
    o: state.edits.order.length ? state.edits.order : undefined,
    r: state.edits.removed.length ? state.edits.removed : undefined,
    x: state.edits.custom.length ? state.edits.custom : undefined,
  };
  return toBase64Url(JSON.stringify(payload));
}

/** Decode and validate a share token. Returns null for anything invalid. */
export function decodeShare(token: string): ShareState | null {
  try {
    if (!token || token.length > 60_000) return null;
    const parsed = shareSchema.safeParse(JSON.parse(fromBase64Url(token)));
    if (!parsed.success) return null;
    const { c, o, r, x } = parsed.data;
    const custom = (x ?? [])
      .map((s, i) => sanitizeStep(s, `custom-share-${i + 1}`))
      .filter((s): s is ResolvedStep => s !== null);
    return {
      config: normalizeConfig(c as Partial<BuilderConfig>),
      edits: { order: o ?? [], removed: r ?? [], custom },
    };
  } catch {
    return null;
  }
}
