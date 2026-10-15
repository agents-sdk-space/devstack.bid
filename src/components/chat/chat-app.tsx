"use client";

import { AlertTriangle, ArrowUp, BookOpenText, Box, Code2, FlaskConical, History, ImageIcon, LogIn, MessageSquarePlus, Paperclip, Square, TerminalSquare, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { Badge, Button, buttonClasses, cn, Dialog, DialogContent, Kbd, Spinner, Tooltip } from "@/components/ui";
import type { Activity, UiEvent } from "@/lib/chat/events";
import type { DictKey } from "@/lib/i18n";
import { Mascot } from "../brand/mascot";
import { useLang } from "../prefs";
import { DeployCard } from "./deploy-card";
import { GithubPublish } from "./github-publish";
import { StreamText } from "./stream-text";
import { ThoughtChain } from "./thought-chain";
import { SandboxPanel, StatusDot } from "./sandbox-panel";
import type { ChatAccount, ChatInfo, ChatMessage, ChatMode, ChatModelOption, ConversationSummary, Quota, SandboxStatus } from "./types";

function viaKey(provider: ChatAccount["provider"]): DictKey {
  if (provider === "cursor") return "auth.via.cursor";
  if (provider === "google") return "auth.via.google";
  if (provider === "password") return "auth.via.password";
  return "auth.via.github";
}

const MODE_STORE = "nvx-chat-mode";

const DEV_STARTERS: { en: string; th: string; Icon: typeof ImageIcon; mode: ChatMode }[] = [
  {
    en: "Generate a dark, minimal hero image of a robot assembling code blocks for my DevStack landing page",
    th: "สร้างภาพ hero โทนมืดแบบมินิมอล เป็นหุ่นยนต์กำลังต่อบล็อกโค้ด สำหรับหน้า landing ของ DevStack",
    Icon: ImageIcon,
    mode: "agent",
  },
  {
    en: "Research how handoffs and guardrails work in the Agents SDK and summarise with sources",
    th: "ค้นคว้าเรื่อง handoff และ guardrail ใน Agents SDK แล้วสรุปพร้อมแหล่งอ้างอิง",
    Icon: Users,
    mode: "agent",
  },
  {
    en: "Plan an AI agents website called Pixel Lab for image generation, with an admin role and Stripe",
    th: "วางแผนเว็บไซต์ AI agent ชื่อ Pixel Lab สำหรับสร้างภาพ มีบทบาทแอดมินและเชื่อม Stripe",
    Icon: Box,
    mode: "agent",
  },
  {
    en: "In the sandbox, write a small Python script that prints the first 10 primes and run it",
    th: "เขียนสคริปต์ Python เล็กๆ ใน sandbox ที่พิมพ์จำนวนเฉพาะ 10 ตัวแรก แล้วรันให้ดู",
    Icon: TerminalSquare,
    mode: "agent",
  },
];

const DEFAULT_USER_MODELS: ChatModelOption[] = [
  { mode: "general", provider: "workers-ai", model: "@cf/google/gemma-4-26b-a4b-it", available: true },
  { mode: "thai", provider: "workers-ai", model: "@cf/aisingapore/gemma-sea-lion-v4-27b-it", available: true },
  { mode: "code", provider: "workers-ai", model: "@cf/qwen/qwen2.5-coder-32b-instruct", available: true },
  { mode: "strong", provider: "huggingface", model: "deepseek-ai/DeepSeek-V3", available: true },
  { mode: "image", provider: "workers-ai", model: "@cf/black-forest-labs/flux-1-schnell", available: true },
];

const USER_STARTERS: { en: string; th: string; Icon: typeof ImageIcon; mode: ChatMode }[] = [
  {
    en: "Explain how solar panels work, simply, with a short summary at the end",
    th: "อธิบายการทำงานของโซลาร์เซลล์แบบเข้าใจง่าย แล้วสรุปสั้นๆ ตอนท้าย",
    Icon: BookOpenText,
    mode: "thai",
  },
  {
    en: "A cozy Thai street-food stall at night, warm lights, watercolor style",
    th: "ร้านสตรีทฟู้ดไทยยามค่ำคืน ไฟสีอุ่น สไตล์สีน้ำ",
    Icon: ImageIcon,
    mode: "image",
  },
  {
    en: "Write a Python function that checks if a Thai ID number is valid, with tests",
    th: "เขียนฟังก์ชัน Python ตรวจสอบเลขบัตรประชาชนไทยว่าถูกต้องไหม พร้อมเทสต์",
    Icon: Code2,
    mode: "code",
  },
  {
    en: "Compare React and Vue for a beginner in 5 bullet points",
    th: "เปรียบเทียบ React กับ Vue สำหรับมือใหม่ 5 ข้อ",
    Icon: MessageSquarePlus,
    mode: "general",
  },
];

interface LimitNotice {
  title: string;
  message: string;
  retryAfter?: number;
}

function authQuery(): string | null {
  return new URLSearchParams(window.location.search).get("auth");
}

function providerMark(provider: string): string {
  if (provider === "vercel") return "Vercel";
  if (provider === "huggingface") return "HF";
  return "CF";
}

function modelLabel(m: ChatModelOption, lang: "en" | "th", t: (key: DictKey) => string): string {
  if (m.label) return m.label[lang];
  return t(`chat.mode.${m.mode}` as DictKey);
}

function fromStored(m: {
  id: string;
  role: string;
  content: string;
  tokensIn?: number | null;
  tokensOut?: number | null;
  meta?: { activities?: Activity[]; images?: ChatMessage["images"]; files?: ChatMessage["files"]; error?: string; outcome?: string } | null;
}): ChatMessage {
  const failed = m.meta?.outcome && m.meta.outcome !== "completed";
  return {
    id: m.id,
    role: m.role === "user" ? "user" : "assistant",
    content: m.content,
    activities: m.meta?.activities ?? [],
    images: m.meta?.images ?? [],
    files: m.meta?.files ?? [],
    usage: m.tokensIn != null ? { input: m.tokensIn ?? 0, output: m.tokensOut ?? 0 } : undefined,
    error: failed && !m.content ? { code: m.meta?.outcome ?? "failed", message: m.meta?.error ?? "" } : undefined,
  };
}

/** Read an SSE response body and yield parsed UiEvents. */
async function* readEvents(res: Response): AsyncGenerator<UiEvent> {
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const data = chunk
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trimStart())
        .join("\n");
      if (!data) continue;
      try {
        yield JSON.parse(data) as UiEvent;
      } catch {
        /* ignore malformed chunk */
      }
    }
  }
}

/** BYOK mode (Sandbox Factory): one fixed conversation in the user's own session. */
export interface ByokMode {
  conversationId: string;
  info: ChatInfo;
  getKey: () => string;
  starters: boolean;
  onBack?: () => void;
}

export function ChatApp({ byok, className, channel = "user" }: { byok?: ByokMode; className?: string; channel?: "user" | "dev" } = {}) {
  const dev = channel === "dev" || Boolean(byok);
  const STARTERS = dev ? DEV_STARTERS : USER_STARTERS;
  const { t, lang } = useLang();
  const [info, setInfo] = useState<ChatInfo | null>(byok?.info ?? null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(byok?.conversationId ?? null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<SandboxStatus>("idle");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<LimitNotice | null>(null);
  const [dropAuthNotice, setDropAuthNotice] = useState(false);
  const authFlag = useSyncExternalStore(() => () => undefined, authQuery, () => null);
  const [remaining, setRemaining] = useState<Quota | undefined>();
  const [mode, setModeState] = useState<ChatMode>(dev ? "agent" : "general");
  const [gatewayModel, setGatewayModel] = useState<string | null>(null);
  const setMode = useCallback((m: ChatMode) => {
    setModeState(m);
    if (m === "image" || m === "agent" || m === "gateway") return;
    try {
      localStorage.setItem(MODE_STORE, m);
    } catch {}
  }, []);
  const selectModel = useCallback(
    (m: ChatModelOption) => {
      setModeState(m.mode);
      if (m.mode === "gateway") {
        setGatewayModel(m.model);
        try {
          localStorage.setItem(MODE_STORE, `gateway:${m.model}`);
        } catch {}
        return;
      }
      setMode(m.mode);
    },
    [setMode]
  );
  const [historyOpen, setHistoryOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<"chat" | "sandbox">("chat");
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const [showJumpLatest, setShowJumpLatest] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollNearBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 96;
  }, []);

  const scrollToLatest = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    atBottomRef.current = true;
    setShowJumpLatest(false);
  }, []);

  const onTranscriptScroll = useCallback(() => {
    const near = scrollNearBottom();
    atBottomRef.current = near;
    setShowJumpLatest(!near);
  }, [scrollNearBottom]);

  useEffect(() => {
    if (!byok) return;
    let live = true;
    fetch(`/api/chat/conversations/${byok.conversationId}`, { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<{ messages: Parameters<typeof fromStored>[0][] }>) : { messages: [] }))
      .then((data) => {
        if (live) setMessages(data.messages.map(fromStored));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [byok]);

  useEffect(() => {
    if (byok) return;
    let live = true;
    fetch(`/api/chat?channel=${channel}`, { cache: "no-store" })
      .then((res) => res.json() as Promise<ChatInfo>)
      .then((data) => {
        if (!live) return;
        setInfo(data);
        setConversations(data.conversations ?? []);
        setRemaining(data.quota);
        try {
          const saved = localStorage.getItem(MODE_STORE);
          if (!dev && saved?.startsWith("gateway:")) {
            const id = saved.slice("gateway:".length);
            if (data.models?.some((m) => m.mode === "gateway" && m.model === id && m.available)) {
              setModeState("gateway");
              setGatewayModel(id);
            }
          } else if (!dev && saved && saved !== "image" && data.models?.some((m) => m.mode === saved && m.available)) {
            setModeState(saved as ChatMode);
          }
        } catch {}
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [byok, channel, dev]);

  useEffect(() => {
    if (atBottomRef.current) scrollToLatest();
  }, [messages, scrollToLatest]);

  const openConversation = useCallback(async (id: string) => {
    if (abortRef.current) return;
    setHistoryOpen(false);
    setNotice(null);
    setActiveId(id);
    setFocusId(null);
    const res = await fetch(`/api/chat/conversations/${id}`, { cache: "no-store" });
    if (!res.ok) {
      setMessages([]);
      return;
    }
    const data = (await res.json()) as { messages: Parameters<typeof fromStored>[0][] };
    setMessages(data.messages.map(fromStored));
    setStatus("idle");
  }, []);

  const newChat = useCallback(() => {
    if (abortRef.current) return;
    setActiveId(null);
    setMessages([]);
    setFocusId(null);
    setNotice(null);
    setStatus("idle");
    setHistoryOpen(false);
    setMobileTab("chat");
    inputRef.current?.focus();
  }, []);

  const archive = useCallback(
    async (id: string) => {
      await fetch(`/api/chat/conversations/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ archived: true }) });
      setConversations((cs) => cs.filter((c) => c.id !== id));
      if (id === activeId) newChat();
    },
    [activeId, newChat]
  );

  const patchAssistant = (id: string, fn: (m: ChatMessage) => ChatMessage) => setMessages((ms) => ms.map((m) => (m.id === id ? fn(m) : m)));

  const send = useCallback(
    async (text: string, modeOverride?: ChatMode) => {
      const useMode = dev ? "agent" : (modeOverride ?? mode);
      if (modeOverride && !dev && modeOverride !== "image") setMode(modeOverride);
      const message = text.trim();
      if (!message || busy || !info?.enabled) return;
      setDropAuthNotice(true);
      if (message.length > info.limits.maxInputChars) return;
      setNotice(null);
      setInput("");
      setBusy(true);
      setStatus("starting");
      const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: "user", content: message, activities: [], images: [], files: [] };
      let assistantId = `a-${Date.now()}`;
      setMessages((ms) => [...ms, userMsg, { id: assistantId, role: "assistant", content: "", activities: [], images: [], files: [], pending: true }]);
      setFocusId(assistantId);

      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const drafts = new Map<string, string>();
      const finals = new Map<string, string>();
      const render = () => [...new Map([...drafts, ...finals]).values()].filter(Boolean).join("\n\n");
      try {
        const res = await fetch(byok ? "/api/factory/turn" : dev ? "/api/chat/dev/turn" : "/api/chat/turn", {
          method: "POST",
          headers: { "content-type": "application/json", ...(byok ? { "x-openai-key": byok.getKey() } : {}) },
          body: JSON.stringify({
            message,
            conversationId: activeId ?? undefined,
            mode: useMode,
            ...(useMode === "gateway" && gatewayModel ? { model: gatewayModel } : {}),
          }),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.headers.get("content-type")?.includes("text/event-stream")) {
          const err = (await res.json().catch(() => ({}))) as { error?: string; code?: string; retryAfter?: number };
          setMessages((ms) => ms.filter((m) => m.id !== assistantId && m.id !== userMsg.id));
          setInput(message);
          setNotice({
            title: res.status === 429 ? t("chat.limitTitle") : t("chat.errorTitle"),
            message: err.error ?? t("agent.error"),
            retryAfter: err.retryAfter,
          });
          setStatus("idle");
          return;
        }
        for await (const ev of readEvents(res)) {
          switch (ev.t) {
            case "meta": {
              const old = assistantId;
              assistantId = ev.messageId;
              setMessages((ms) => ms.map((m) => (m.id === old ? { ...m, id: ev.messageId } : m)));
              setFocusId(ev.messageId);
              if (!activeId) {
                setActiveId(ev.conversationId);
                setConversations((cs) => [{ id: ev.conversationId, title: ev.title, updatedAt: Date.now() }, ...cs.filter((c) => c.id !== ev.conversationId)]);
              }
              break;
            }
            case "status":
              setStatus(ev.s);
              break;
            case "delta":
              drafts.set(ev.item, (drafts.get(ev.item) ?? "") + ev.text);
              patchAssistant(assistantId, (m) => ({ ...m, content: render() }));
              break;
            case "text":
              finals.set(ev.item, ev.text);
              patchAssistant(assistantId, (m) => ({ ...m, content: render() }));
              break;
            case "activity":
              patchAssistant(assistantId, (m) => {
                const i = m.activities.findIndex((a) => a.id === ev.a.id);
                const activities = i >= 0 ? m.activities.map((a, j) => (j === i ? ev.a : a)) : [...m.activities, ev.a];
                return { ...m, activities };
              });
              break;
            case "image":
              patchAssistant(assistantId, (m) => ({ ...m, images: [...m.images.filter((x) => x.id !== ev.id), { id: ev.id, url: ev.url, caption: ev.caption }] }));
              break;
            case "file":
              patchAssistant(assistantId, (m) => ({ ...m, files: [...m.files.filter((x) => x.id !== ev.id), { id: ev.id, name: ev.name, size: ev.size, url: ev.url }] }));
              break;
            case "deploy":
              patchAssistant(assistantId, (m) => ({ ...m, deploys: [...(m.deploys ?? []).filter((x) => x.id !== ev.d.id), ev.d] }));
              break;
            case "quota":
              setRemaining((q) => ({ ...q, ...Object.fromEntries(Object.entries(ev).filter(([k, v]) => k !== "t" && v !== undefined)) }));
              break;
            case "usage":
              patchAssistant(assistantId, (m) => ({ ...m, usage: { input: ev.input, output: ev.output } }));
              break;
            case "error":
              patchAssistant(assistantId, (m) => ({ ...m, error: { code: ev.code, message: ev.message } }));
              break;
            case "done":
              break;
          }
        }
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") patchAssistant(assistantId, (m) => ({ ...m, error: { code: "network", message: t("agent.error") } }));
      } finally {
        patchAssistant(assistantId, (m) => ({ ...m, pending: false }));
        abortRef.current = null;
        setBusy(false);
        setStatus("idle");
      }
    },
    [busy, info, activeId, t, byok, dev, mode, setMode, gatewayModel]
  );

  const stop = () => abortRef.current?.abort();

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send(input);
    }
  };

  const focused = messages.find((m) => m.id === focusId) ?? [...messages].reverse().find((m) => m.role === "assistant");
  const maxChars = info?.limits.maxInputChars ?? 2000;
  const tooLong = input.length > maxChars;
  const disabled = info !== null && !info.enabled;

  const sandbox = (cls?: string) => (
    <SandboxPanel
      info={info}
      status={status}
      activities={focused?.activities ?? []}
      images={focused?.images ?? []}
      files={focused?.files ?? []}
      usage={focused?.usage}
      remaining={remaining}
      byok={Boolean(byok)}
      mode={mode}
      className={cls}
    />
  );

  const logout = () => {
    void fetch("/api/auth/logout", { method: "POST" }).finally(() => window.location.reload());
  };

  const authNotice: LimitNotice | null = dropAuthNotice
    ? null
    : authFlag === "missing"
      ? { title: t("auth.missingTitle"), message: t("auth.missing") }
      : authFlag === "error"
        ? { title: t("auth.errorTitle"), message: t("auth.error") }
        : authFlag === "denied"
          ? { title: t("auth.deniedTitle"), message: t("auth.denied") }
          : null;
  const banner = notice ?? authNotice;

  const history = (
    <nav aria-label={t("chat.history")} className="flex min-h-0 flex-1 flex-col">
      {info?.account ? (
        <div className="mb-3 flex items-center gap-2">
          {info.account.avatarUrl ? (
            // Profile image from GitHub or Google. The login text next to it is the accessible name.
            <img src={info.account.avatarUrl} alt="" width={28} height={28} className="h-7 w-7 rounded-full" />
          ) : (
            <LogIn className="h-4 w-4 shrink-0" aria-hidden />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-fg">{info.account.login}</p>
            <p className="truncate text-[11px] text-subtle">{t(viaKey(info.account.provider))}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={logout}>
            {t("auth.logout")}
          </Button>
        </div>
      ) : (
        <a href="/login?next=/chat" className={buttonClasses("secondary", "sm", "mb-3 w-full justify-start")}>
          <LogIn className="h-3.5 w-3.5" aria-hidden /> {t("auth.signIn")}
        </a>
      )}
      <Button variant="secondary" size="sm" className="mb-3 w-full justify-start" onClick={newChat} disabled={busy}>
        <MessageSquarePlus className="h-4 w-4" aria-hidden /> {t("chat.new")}
      </Button>
      <h2 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-subtle">{t("chat.history")}</h2>
      {conversations.length === 0 ? (
        <p className="px-1 text-xs leading-relaxed text-muted">{info?.account ? t("auth.historyEmpty") : t("chat.historyEmpty")}</p>
      ) : (
        <ul className="-mx-1 min-h-0 flex-1 space-y-0.5 overflow-y-auto">
          {conversations.map((c) => (
            <li key={c.id} className="group flex items-center">
              <button
                type="button"
                onClick={() => void openConversation(c.id)}
                aria-current={c.id === activeId ? "page" : undefined}
                className={cn(
                  "focus-ring motion-fast min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-left text-[13px]",
                  c.id === activeId ? "bg-surface-2 font-medium text-fg" : "text-muted hover:bg-surface-2 hover:text-fg"
                )}
              >
                {c.title || "…"}
              </button>
              <Tooltip content={t("chat.archive")}>
                <button
                  type="button"
                  onClick={() => void archive(c.id)}
                  aria-label={`${t("chat.archive")}: ${c.title ?? ""}`}
                  className="focus-ring ml-0.5 rounded-md p-1.5 text-subtle opacity-0 hover:text-danger focus:opacity-100 group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              </Tooltip>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 border-t border-border px-1 pt-3 text-[11px] leading-relaxed text-subtle">{info?.account ? t("auth.privacy") : t("chat.privacy")}</p>
    </nav>
  );

  return (
    <div
      className={cn(
        "mx-auto grid max-w-[1500px] grid-cols-1 gap-4",
        byok
          ? "lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]"
          : dev
            ? "h-[calc(100dvh-3.5rem-1px)] px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4 lg:grid-cols-[240px_minmax(0,1fr)_340px] xl:grid-cols-[260px_minmax(0,1fr)_380px]"
            : "h-[calc(100dvh-3.5rem-1px)] max-w-[1240px] px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-4 sm:pt-3 lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)]",
        className
      )}
    >
      {!byok && <aside className="hidden min-h-0 flex-col rounded-2xl border border-border bg-surface p-3 lg:flex">{history}</aside>}

      <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface" aria-label={t("chat.title")}>
        <div className="flex items-center gap-2 border-b border-border px-3 py-2 lg:hidden">
          {!byok && (
            <Button variant="ghost" size="sm" onClick={() => setHistoryOpen(true)} aria-label={t("chat.history")}>
              <History className="h-4 w-4" aria-hidden /> <span className="sr-only sm:not-sr-only">{t("chat.history")}</span>
            </Button>
          )}
          {!dev && <span className="ml-auto" />}
          {dev && (
          <div role="tablist" aria-label={t("chat.sandbox")} className="ml-auto flex rounded-lg bg-surface-2 p-0.5 text-[13px]">
            {(["chat", "sandbox"] as const).map((tab) => (
              <button
                key={tab}
                role="tab"
                type="button"
                aria-selected={mobileTab === tab}
                onClick={() => setMobileTab(tab)}
                className={cn("focus-ring flex items-center gap-1.5 rounded-md px-3 py-1", mobileTab === tab ? "bg-surface font-medium text-fg shadow-sm" : "text-muted")}
              >
                {tab === "sandbox" && <StatusDot status={status} />}
                {tab === "chat" ? t("chat.tabChat") : t("chat.sandbox")}
              </button>
            ))}
          </div>
          )}
          {!byok && (
            <Button variant="ghost" size="icon" onClick={newChat} aria-label={t("chat.new")} disabled={busy}>
              <MessageSquarePlus className="h-4 w-4" aria-hidden />
            </Button>
          )}
        </div>

        {dev && mobileTab === "sandbox" && <div className="flex min-h-0 flex-1 p-2 lg:hidden">{sandbox("flex-1 rounded-xl")}</div>}

        <div className={cn("flex min-h-0 flex-1 flex-col", mobileTab === "sandbox" && "hidden lg:flex")}>
          <div className="relative min-h-0 flex-1">
          <div ref={scrollRef} onScroll={onTranscriptScroll} className="h-full overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">
            {!dev && (
              <div role="radiogroup" aria-label={t("chat.modelPicker")} className="mx-auto mb-4 flex max-w-3xl flex-wrap items-center justify-center gap-1.5">
                {(info?.models ?? DEFAULT_USER_MODELS).map((m) => {
                  const selected = m.mode === "gateway" ? mode === "gateway" && gatewayModel === m.model : mode === m.mode;
                  const vendor = m.provider === "vercel" ? "Vercel AI Gateway" : m.provider === "huggingface" ? "Hugging Face" : "Cloudflare Workers AI";
                  return (
                    <Tooltip key={`${m.mode}:${m.model}`} content={`${vendor} · ${m.model}`}>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        disabled={!m.available || busy}
                        onClick={() => selectModel(m)}
                        className={cn(
                          "focus-ring motion-fast inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] disabled:opacity-40",
                          selected ? "border-primary bg-primary-soft/40 text-fg" : "border-border text-muted hover:text-fg"
                        )}
                      >
                        {m.mode === "image" && <ImageIcon className="h-3.5 w-3.5" aria-hidden />}
                        {modelLabel(m, lang, t)}
                        <span className="font-mono text-[10.5px] text-subtle">{providerMark(m.provider)}</span>
                      </button>
                    </Tooltip>
                  );
                })}
              </div>
            )}
            {messages.length === 0 ? (
              <div className="mx-auto flex max-w-2xl flex-col items-center pt-6 text-center sm:pt-12">
                <Mascot size={56} />
                {byok ? (
                  <p className="mt-4 text-lg font-semibold tracking-tight">{info?.agent}</p>
                ) : (
                  <h1 className="mt-4 text-xl font-semibold tracking-tight sm:text-2xl">{t(dev ? "chat.devTitle" : "chat.title")}</h1>
                )}
                <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">{byok ? t("factory.chatIntro") : t(dev ? "chat.devSubtitle" : "chat.subtitle")}</p>
                {!byok && dev && (
                  <Link href="/factory" className="focus-ring mt-3 inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-[12.5px] text-muted hover:text-fg">
                    <FlaskConical className="h-3.5 w-3.5" aria-hidden /> {t("chat.factoryLink")}
                  </Link>
                )}
                <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                  {byok && <Badge size="sm" variant="outline">{info?.limits.model ?? "gpt-6.1-sol"}</Badge>}
                  {byok?.starters && <Badge size="sm" variant="outline">multi-agent · 5</Badge>}
                  {byok && <Badge size="sm" variant="info">BYOK</Badge>}
                  {byok && <Badge size="sm" variant="outline">{(info?.limits.environment ?? "openai_hosted").replace("_", "-")}</Badge>}
                </div>
                {(!byok || byok.starters) && <h2 className="mb-2 mt-8 text-[11px] font-semibold uppercase tracking-wide text-subtle">{t("chat.try")}</h2>}
                <ul className={cn("grid w-full gap-2 sm:grid-cols-2", byok && !byok.starters && "hidden")}>
                  {STARTERS.map((s) => (
                    <li key={s.en}>
                      <button
                        type="button"
                        disabled={busy || disabled}
                        onClick={() => void send(s[lang], s.mode)}
                        className="focus-ring motion-fast flex h-full w-full items-start gap-2.5 rounded-xl border border-border bg-bg px-3 py-2.5 text-left text-[13px] leading-snug text-muted hover:border-border-strong hover:text-fg disabled:opacity-50"
                      >
                        <s.Icon className="mt-0.5 h-4 w-4 shrink-0 text-subtle" aria-hidden />
                        {s[lang]}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <ol className="mx-auto max-w-3xl space-y-6">
                {messages.map((m) =>
                  m.role === "user" ? (
                    <li key={m.id} className="flex justify-end">
                      <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-surface-3 px-4 py-2.5 text-[14px] leading-relaxed">
                        <span className="sr-only">{t("chat.you")}: </span>
                        {m.content}
                      </div>
                    </li>
                  ) : (
                    <li key={m.id} className="flex gap-3">
                      <div className="mt-0.5 shrink-0">
                        <Mascot size={26} />
                      </div>
                      <div className="min-w-0 flex-1 space-y-3">
                        <span className="sr-only">{t("chat.agent")}: </span>
                        <ThoughtChain
                          key={`${m.id}-${m.activities.filter((a) => a.kind !== "reasoning").length}`}
                          activities={m.activities}
                          pending={m.pending}
                        />
                        {m.content ? (
                          <StreamText text={m.content} streaming={Boolean(m.pending)} />
                        ) : m.pending ? (
                          <p className="flex items-center gap-2 text-sm text-muted">
                            <Spinner variant="dots" /> {t(`chat.status.${status}` as const)}…
                          </p>
                        ) : null}
                        {m.images.length > 0 && !m.images.every((im) => m.content.includes(im.url)) && (
                          <div className="flex flex-wrap gap-2">
                            {m.images
                              .filter((im) => !m.content.includes(im.url))
                              .map((im) => (
                                <a key={im.id} href={im.url} target="_blank" rel="noopener noreferrer" className="block">
                                  <img src={im.url} alt={im.caption} className="max-h-72 rounded-xl border border-border" />
                                </a>
                              ))}
                          </div>
                        )}
                        {m.error && (
                          <div role="alert" className="flex gap-2 rounded-xl border border-danger/40 bg-danger-soft px-3 py-2 text-[13px] text-danger-fg">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                            <span>{m.error.message || t("agent.error")}</span>
                          </div>
                        )}
                        {m.deploys?.map((d) => <DeployCard key={d.id} card={d} />)}
                        {!dev && !byok && m.content && !m.pending && <GithubPublish text={m.content} signedIn={info?.account?.provider === "github"} />}
                        {dev && m.activities.filter((a) => a.kind !== "reasoning").length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setFocusId(m.id);
                              setMobileTab("sandbox");
                            }}
                            className={cn(
                              "focus-ring inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11.5px]",
                              focused?.id === m.id ? "border-border-strong text-fg" : "border-border text-subtle hover:text-fg"
                            )}
                          >
                            <Box className="h-3.5 w-3.5" aria-hidden />
                            {m.activities.filter((a) => a.kind !== "reasoning").length} {t("chat.steps")} · {t("chat.showSteps")}
                          </button>
                        )}
                      </div>
                    </li>
                  )
                )}
              </ol>
            )}
          </div>
          {showJumpLatest && messages.length > 0 && (
            <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-4">
              <button
                type="button"
                onClick={scrollToLatest}
                className="focus-ring pointer-events-auto rounded-full border border-border-strong bg-bg px-3 py-1.5 text-[12px] font-medium text-fg shadow-sm"
              >
                {t("chat.jumpToLatest")}
              </button>
            </div>
          )}
          </div>

          <div className="border-t border-border bg-surface px-3 py-3 sm:px-4">
            {banner && (
              <div role="alert" className="mx-auto mb-2 flex max-w-3xl gap-2 rounded-xl border border-warning/40 bg-warning-soft px-3 py-2 text-[13px] text-warning-fg">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <div>
                  <p className="font-semibold">{banner.title}</p>
                  <p>{banner.message}</p>
                  {banner.retryAfter ? <p className="text-xs opacity-80">{t("chat.retryIn").replace("{m}", String(Math.max(1, Math.ceil(banner.retryAfter / 60))))}</p> : null}
                </div>
              </div>
            )}
            {disabled && (
              <p role="status" className="mx-auto mb-2 max-w-3xl rounded-xl border border-border bg-surface-2 px-3 py-2 text-[13px] text-muted">
                {info?.unavailable?.message ?? t("chat.unavailable")}
              </p>
            )}
            <form
              className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-border-strong bg-bg p-2 focus-within:ring-2 focus-within:ring-ring"
              onSubmit={(e) => {
                e.preventDefault();
                void send(input);
              }}
            >
              {!byok && (
                <Tooltip content={t("chat.attachOff").replace("{mb}", String(Math.round((info?.limits.maxAttachmentBytes ?? 10485760) / 1048576)))}>
                  <span tabIndex={0} className="focus-ring rounded-md">
                    <Button type="button" variant="ghost" size="icon" disabled aria-label={t("chat.attach")}>
                      <Paperclip className="h-4 w-4" aria-hidden />
                    </Button>
                  </span>
                </Tooltip>
              )}
              <label htmlFor="chat-input" className="sr-only">
                {t("chat.placeholder")}
              </label>
              <textarea
                id="chat-input"
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                rows={1}
                placeholder={t(dev ? "chat.placeholderDev" : mode === "image" ? "chat.placeholderImage" : "chat.placeholder")}
                disabled={disabled}
                aria-invalid={tooLong || undefined}
                className="max-h-48 min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-[14px] text-fg outline-none [field-sizing:content] placeholder:text-subtle"
              />
              {busy ? (
                <Button type="button" variant="secondary" size="icon" onClick={stop} aria-label={t("chat.stop")}>
                  <Square className="h-4 w-4" aria-hidden />
                </Button>
              ) : (
                <Button type="submit" size="icon" disabled={!input.trim() || tooLong || disabled} aria-label={t("chat.send")}>
                  <ArrowUp className="h-4 w-4" aria-hidden />
                </Button>
              )}
            </form>
            <p className="mx-auto mt-1.5 flex max-w-3xl items-center justify-between gap-2 px-1 text-[11px] text-subtle">
              <span className="hidden sm:inline">
                <Kbd>Enter</Kbd> · <Kbd>Shift</Kbd> + <Kbd>Enter</Kbd> — {t("chat.hint")}
              </span>
              {!byok && !dev && info?.enabled && (
                <span className="ml-auto">
                  {t("chat.messagesLeft").replace("{n}", String(remaining?.messagesLeft ?? info.quota?.messagesLeft ?? info.limits.messagesPerDay)).replace("{N}", String(info.limits.messagesPerDay))}
                  {" · "}
                  {t("chat.imagesLeft").replace("{n}", String(remaining?.imagesLeft ?? info.quota?.imagesLeft ?? info.limits.imagesPerDay)).replace("{N}", String(info.limits.imagesPerDay))}
                </span>
              )}
              {!byok && dev && info?.enabled && (
                <span className="ml-auto">
                  {t("chat.agentLeft").replace("{n}", String(remaining?.agentLeft ?? info.quota?.agentLeft ?? info.limits.agentPerDay))}
                </span>
              )}
              <span className={cn(byok || !info?.enabled ? "ml-auto" : "", "font-mono", tooLong && "text-danger")}>
                {input.length}/{maxChars}
              </span>
            </p>
          </div>
        </div>
      </section>

      {dev && <div className="hidden min-h-0 lg:flex">{sandbox("flex-1")}</div>}

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent side="left" title={t("chat.history")} closeLabel={t("nav.close")}>
          <div className="flex h-full flex-col">{history}</div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
