import type { RawEvent } from "./agents-api";

/**
 * Translate Agents API session events into the small, secret-free event vocabulary the /chat UI
 * understands (sent to the browser as SSE). Environment ids, agent ids, raw tool outputs and
 * reasoning are never forwarded; only labels, short details and the final reply text.
 */

export type ChatMode = "general" | "thai" | "code" | "strong" | "image" | "agent" | "gateway";

export type ActivityKind = "note" | "reasoning" | "tool" | "search" | "mcp" | "command" | "subagent" | "sandbox" | "image" | "file";

export interface Activity {
  id: string;
  kind: ActivityKind;
  label: string;
  detail?: string;
  status: "running" | "done" | "failed";
  agent?: string;
  at: number;
}

export type UiEvent =
  | { t: "meta"; conversationId: string; messageId: string; title: string; mode?: ChatMode; model?: string; provider?: string }
  | { t: "status"; s: "starting" | "provisioning" | "sandbox_ready" | "working" | "resuming" }
  | { t: "delta"; item: string; text: string }
  | { t: "text"; item: string; text: string }
  | { t: "activity"; a: Activity }
  | { t: "image"; id: string; url: string; caption: string }
  | { t: "file"; id: string; name: string; size: number; url: string }
  | { t: "usage"; input: number; output: number }
  | { t: "quota"; messagesLeft?: number; imagesLeft?: number; agentLeft?: number }
  | { t: "done"; messageId: string }
  | { t: "error"; code: string; message: string };

const clip = (s: unknown, n = 160) => {
  const v = typeof s === "string" ? s : s == null ? "" : JSON.stringify(s);
  return v.length > n ? `${v.slice(0, n - 1)}…` : v;
};

export const FUNCTION_LABELS: Record<string, { label: string; kind: ActivityKind }> = {
  generate_ai_agents_website: { label: "Stack Builder: site plan", kind: "tool" },
  get_agents_sdk_info: { label: "Docs lookup (devstack.bid)", kind: "tool" },
  generate_image: { label: "Image generation", kind: "image" },
};

export interface MapperState {
  sessionId?: string;
  rootTurnId?: string;
  /** item id -> phase ("commentary" | "final_answer" | null) for assistant messages */
  phases: Record<string, string | null>;
  /** final reply text per item, in arrival order */
  finalText: Map<string, string>;
  activities: Map<string, Activity>;
  usage?: { input: number; output: number };
  outcome?: "completed" | "failed" | "cancelled";
  error?: string;
  outputChars: number;
}

export function newMapperState(): MapperState {
  return { phases: {}, finalText: new Map(), activities: new Map(), outputChars: 0 };
}

export function replyText(s: MapperState): string {
  return [...s.finalText.values()].filter(Boolean).join("\n\n");
}

function activity(s: MapperState, a: Omit<Activity, "at"> & { at?: number }): UiEvent {
  const prev = s.activities.get(a.id);
  const next: Activity = { ...prev, ...a, at: prev?.at ?? a.at ?? Date.now() } as Activity;
  if (prev && !a.detail && prev.detail) next.detail = prev.detail;
  s.activities.set(a.id, next);
  return { t: "activity", a: next };
}

function usageOf(u: unknown): { input: number; output: number } | undefined {
  if (!u || typeof u !== "object") return undefined;
  const o = u as { input_tokens?: number; output_tokens?: number };
  if (typeof o.input_tokens !== "number" && typeof o.output_tokens !== "number") return undefined;
  return { input: o.input_tokens ?? 0, output: o.output_tokens ?? 0 };
}

/**
 * Map one raw event. `isCurrentTurn` filters turn-scoped events from earlier turns (a follow-up
 * stream may include history). Returns the UI events to forward.
 */
export function mapEvent(s: MapperState, ev: RawEvent): UiEvent[] {
  const out: UiEvent[] = [];
  const turnId: string | undefined = ev.turn_id ?? ev.turn?.id;
  const t = ev.type;

  if (t === "agent.session.created") {
    s.sessionId = ev.session?.id;
    return [{ t: "status", s: "starting" }];
  }
  if (t === "agent.session.turn.created") {
    if (!ev.turn?.subagent_id && !s.rootTurnId) s.rootTurnId = ev.turn?.id;
    return [{ t: "status", s: "working" }];
  }
  // Ignore turn-scoped events that belong to another root turn (history replay on follow-ups).
  if (turnId && s.rootTurnId && turnId !== s.rootTurnId && !ev.turn?.subagent_id && t.startsWith("agent.session.turn.")) return out;

  if (t.startsWith("agent.session.environment.")) {
    const phase = t.slice("agent.session.environment.".length);
    if (phase === "pending") out.push({ t: "status", s: "provisioning" });
    if (phase === "connected") out.push({ t: "status", s: "sandbox_ready" });
    if (["pending", "connected", "failed", "expired", "reset", "suspended"].includes(phase)) {
      out.push(
        activity(s, {
          id: `env:${phase === "connected" || phase === "pending" ? "main" : phase}`,
          kind: "sandbox",
          label: phase === "pending" ? "Provisioning sandbox" : phase === "connected" ? "Sandbox connected" : `Sandbox ${phase}`,
          detail:
            ev.environment?.type === "openai_hosted" ? "OpenAI-hosted Linux sandbox" : ev.environment?.type === "self_hosted" ? "Self-hosted executor (codex exec-server)" : undefined,
          status: phase === "failed" ? "failed" : phase === "pending" ? "running" : "done",
        })
      );
    }
    return out;
  }

  if (t === "agent.session.subagent.created" || t === "agent.session.subagent.closed" || t === "agent.session.subagent.active") {
    const sub = ev.subagent ?? {};
    const id = String(sub.id ?? "sub");
    return [
      activity(s, {
        id: `sub:${id}`,
        kind: "subagent",
        label: sub.name ? `Subagent ${sub.name}` : "Subagent",
        status: t.endsWith("closed") ? "done" : "running",
        agent: sub.name ?? undefined,
      }),
    ];
  }

  if (t === "agent.session.turn.item.added" || t === "agent.session.turn.item.done") {
    const item = ev.item ?? {};
    const done = t.endsWith("done");
    const st: Activity["status"] = item.status === "failed" || item.error ? "failed" : done ? "done" : "running";
    switch (item.type) {
      case "message":
        if (item.role === "assistant") s.phases[item.id] = item.phase ?? null;
        if (done && item.role === "assistant" && item.phase === "commentary") {
          const text = (item.content ?? []).map((c: { text?: string }) => c.text ?? "").join("");
          if (text) out.push(activity(s, { id: `note:${item.id}`, kind: "note", label: "Agent note", detail: clip(text, 400), status: "done" }));
        }
        break;
      case "function_call": {
        const meta = FUNCTION_LABELS[item.name] ?? { label: `Function ${item.name}`, kind: "tool" as ActivityKind };
        const args = typeof item.arguments === "string" ? safeJson(item.arguments) : item.arguments;
        const detail = item.name === "generate_image" ? clip(args?.caption ?? args?.prompt) : item.name === "get_agents_sdk_info" ? clip(args?.query) : clip(args?.site_name);
        out.push(activity(s, { id: `fn:${item.call_id ?? item.id}`, kind: meta.kind, label: meta.label, detail, status: st === "done" ? "running" : st }));
        break;
      }
      case "function_call_output": {
        const prev = s.activities.get(`fn:${item.call_id}`);
        if (prev) out.push(activity(s, { ...prev, status: item.error ? "failed" : "done" }));
        break;
      }
      case "web_search_call": {
        const action = item.action ?? {};
        out.push(activity(s, { id: `ws:${item.id}`, kind: "search", label: "Web search", detail: clip(action.query ?? action.url ?? (action.queries ?? []).join(" · ")), status: st }));
        break;
      }
      case "mcp_call":
        out.push(activity(s, { id: `mcp:${item.id}`, kind: "mcp", label: `MCP ${item.server_label ?? ""} · ${item.name ?? ""}`.trim(), detail: clip(item.arguments?.query ?? item.arguments?.url ?? item.arguments), status: st }));
        break;
      case "command_execution":
        out.push(activity(s, { id: `cmd:${item.id}`, kind: "command", label: "Sandbox command", detail: clip(item.command, 200), status: st }));
        break;
      case "create_subagent_call":
        out.push(activity(s, { id: `call:${item.id}`, kind: "subagent", label: "Delegating to a subagent", status: st }));
        break;
      case "wait_for_subagents_call":
        out.push(activity(s, { id: `call:${item.id}`, kind: "subagent", label: "Waiting for subagents", status: st }));
        break;
      case "send_subagent_input_call":
        out.push(activity(s, { id: `call:${item.id}`, kind: "subagent", label: "Message to subagent", status: st }));
        break;
      case "close_subagent_call":
      case "interrupt_subagent_call":
        out.push(activity(s, { id: `call:${item.id}`, kind: "subagent", label: item.type === "close_subagent_call" ? "Closing subagent" : "Interrupting subagent", status: st }));
        break;
      default:
        break;
    }
    return out;
  }

  if (t === "agent.session.turn.reasoning_summary_text.done" && ev.text) {
    return [activity(s, { id: `rs:${ev.item_id}:${ev.summary_index ?? 0}`, kind: "reasoning", label: "Plan (summary)", detail: clip(ev.text, 400), status: "done" })];
  }

  if (t === "agent.session.turn.output_text.delta") {
    const phase = s.phases[ev.item_id];
    if (phase === "commentary") return out;
    s.outputChars += String(ev.delta ?? "").length;
    return [{ t: "delta", item: ev.item_id, text: String(ev.delta ?? "") }];
  }
  if (t === "agent.session.turn.output_text.done") {
    if (s.phases[ev.item_id] === "commentary") return out;
    s.finalText.set(ev.item_id, String(ev.text ?? ""));
    return [{ t: "text", item: ev.item_id, text: String(ev.text ?? "") }];
  }

  if (t === "agent.session.turn.completed" || t === "agent.session.turn.failed" || t === "agent.session.turn.cancelled") {
    if (ev.turn?.subagent_id) return out;
    s.outcome = t === "agent.session.turn.completed" ? "completed" : t.endsWith("failed") ? "failed" : "cancelled";
    s.usage = usageOf(ev.usage) ?? usageOf(ev.turn?.usage) ?? s.usage;
    if (s.outcome === "failed") s.error = ev.turn?.error?.message ?? "The agent turn failed";
    return out;
  }
  if (t === "agent.session.failed" || t === "error") {
    s.outcome = "failed";
    s.error = ev.error?.message ?? ev.session?.error?.message ?? "Agent session failed";
  }
  return out;
}

function safeJson(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

/** Pending function calls for the current root turn from a requires_action event. */
export function pendingCalls(ev: RawEvent, rootTurnId?: string): { turn_id: string; call_id: string; name: string; arguments: unknown }[] {
  const actions = ev.session?.required_actions ?? [];
  return actions
    .filter((a: RawEvent) => a?.type === "function_call" && (!rootTurnId || a.turn_id === rootTurnId))
    .map((a: RawEvent) => ({ turn_id: a.turn_id, call_id: a.call_id, name: a.name, arguments: typeof a.arguments === "string" ? safeJson(a.arguments) : a.arguments ?? {} }));
}
