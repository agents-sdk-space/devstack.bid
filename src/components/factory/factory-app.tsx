"use client";

import { CreateTokenMenu } from "@/components/tokens/create-token-menu";
import { RememberToggle } from "@/components/tokens/remember-toggle";
import { rememberSecret } from "@/components/tokens/remember-secret";

import { AlertTriangle, ArrowLeft, Box, Check, Cloud, FlaskConical, KeyRound, Laptop, Plus, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge, Button, Card, cn, Field, Input, Spinner, Textarea } from "@/components/ui";
import { ChatApp } from "../chat/chat-app";
import type { ChatInfo } from "../chat/types";
import { CodeBlock } from "../copy-button";
import { useLang } from "../prefs";

type Template = "orchestrator" | "blank";
type EnvKind = "openai_hosted" | "self_hosted";
type EnvPhase = "idle" | "watching" | "pending" | "connected" | "disconnected" | "failed" | "expired" | "timeout";

interface FactoryInfo {
  enabled: boolean;
  unavailable?: { message: string };
  models: string[];
  scopes: string[];
  limits: { sessionsPerHour: number; turnsPerHour: number; maxInputChars: number };
  sessions: { id: string; title: string | null; model: string | null; environment: string | null; updatedAt: number }[];
}

interface Created {
  conversationId: string;
  agentId?: string;
  sessionId?: string;
  title: string;
  model: string;
  template: Template;
  environment: EnvKind;
  selfHosted?: { environmentId: string; remoteUrl: string; workspaceDirectory?: string; command: string };
}

const KEY_STORE = "nvx-factory-key";

function OptionCard({ selected, onClick, icon, title, body }: { selected: boolean; onClick: () => void; icon: React.ReactNode; title: string; body: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        "focus-ring motion-fast flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left",
        selected ? "border-primary bg-primary-soft/40" : "border-border bg-bg hover:border-border-strong"
      )}
    >
      <span className={cn("mt-0.5", selected ? "text-fg" : "text-subtle")}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-fg">{title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-muted">{body}</span>
      </span>
      {selected && <Check className="mt-0.5 h-4 w-4 text-fg" aria-hidden />}
    </button>
  );
}

export function FactoryApp() {
  const { t } = useLang();
  const [info, setInfo] = useState<FactoryInfo | null>(null);
  const [key, setKey] = useState("");
  const [remember, setRemember] = useState(false);
  const [template, setTemplate] = useState<Template>("orchestrator");
  const [model, setModel] = useState("gpt-6.1-sol");
  const [envKind, setEnvKind] = useState<EnvKind>("openai_hosted");
  const [workspace, setWorkspace] = useState("/tmp/devstack-sandbox");
  const [instructions, setInstructions] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  const [phase, setPhase] = useState<EnvPhase>("idle");
  const keyRef = useRef("");
  keyRef.current = key;

  useEffect(() => {
    let live = true;
    try {
      sessionStorage.removeItem(KEY_STORE); // legacy: keys are no longer kept in the browser
    } catch {}
    fetch("/api/factory", { cache: "no-store" })
      .then((r) => r.json() as Promise<FactoryInfo>)
      .then((d) => live && setInfo(d))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);


  const keyValid = /^sk-[A-Za-z0-9_-]{20,400}$/.test(key.trim());

  async function watch(conversationId: string) {
    setPhase("watching");
    try {
      const res = await fetch("/api/factory/watch", {
        method: "POST",
        headers: { "content-type": "application/json", "x-openai-key": keyRef.current.trim() },
        body: JSON.stringify({ conversationId }),
      });
      if (!res.ok || !res.body) {
        setPhase("failed");
        return;
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        let i: number;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const line = buf.slice(0, i).replace(/^data:\s*/, "");
          buf = buf.slice(i + 2);
          try {
            const ev = JSON.parse(line) as { phase: EnvPhase };
            setPhase(ev.phase);
          } catch {}
        }
      }
    } catch {
      setPhase("timeout");
    }
  }

  async function create() {
    if (!keyValid || creating) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/factory/session", {
        method: "POST",
        headers: { "content-type": "application/json", "x-openai-key": key.trim() },
        body: JSON.stringify({ template, model, environment: envKind, instructions: template === "blank" ? instructions : undefined, workspaceDirectory: envKind === "self_hosted" ? workspace : undefined }),
      });
      const data = (await res.json()) as Created & { error?: string };
      if (!res.ok) {
        setError(data.error ?? t("agent.error"));
        return;
      }
      setCreated(data);
      if (remember) {
        const saved = await rememberSecret("OPENAI_API_KEY", key.trim(), "openai");
        if (!saved.ok) setError(saved.error ?? null);
      }
      setInfo((i) => (i ? { ...i, sessions: [{ id: data.conversationId, title: data.title, model: data.model, environment: data.environment, updatedAt: Date.now() }, ...i.sessions] } : i));
      if (data.environment === "self_hosted") void watch(data.conversationId);
    } catch {
      setError(t("agent.error"));
    } finally {
      setCreating(false);
    }
  }

  function openExisting(s: FactoryInfo["sessions"][number]) {
    const env = (s.environment as EnvKind) ?? "openai_hosted";
    setCreated({ conversationId: s.id, title: s.title ?? "", model: s.model ?? "gpt-6.1-sol", template: s.title?.startsWith("Blank") ? "blank" : "orchestrator", environment: env });
    setPhase("idle");
  }

  const chatInfo: ChatInfo | null = created
    ? {
        enabled: keyValid,
        agent: created.template === "orchestrator" ? "Image and Research Orchestrator" : "DevStack Factory agent",
        template: created.template,
        limits: { maxInputChars: info?.limits.maxInputChars ?? 2000, messagesPerDay: 0, imagesPerDay: 0, agentPerDay: 0, maxAttachmentBytes: 0, model: created.model, environment: created.environment },
        conversations: [],
        ...(keyValid ? {} : { unavailable: { code: "missing_key", message: t("factory.needKey") } }),
      }
    : null;

  const keyCard = (
    <Card className="p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <KeyRound className="h-4 w-4 text-subtle" aria-hidden /> 1 · {t("factory.step.key")}
      </h2>
      <Field label={t("factory.keyLabel")} hint={t("factory.keyHint")}>
        {(p) => <Input {...p} type="password" autoComplete="off" spellCheck={false} placeholder="sk-…" value={key} onChange={(e) => setKey(e.target.value)} invalid={key.length > 0 && !keyValid} />}
      </Field>
      <div className="mt-3">
        <div className="flex flex-wrap items-center gap-3">
          <RememberToggle checked={remember} onCheckedChange={setRemember} />
          <CreateTokenMenu primary="openai" />
        </div>
      </div>
    </Card>
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <p className="mb-2 flex items-center gap-2 text-xs font-medium text-subtle">
            <FlaskConical className="h-4 w-4" aria-hidden /> BYOK · Agents API
          </p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("factory.title")}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">{t("factory.subtitle")}</p>
        </div>
        {created && (
          <Button variant="secondary" size="sm" onClick={() => { setCreated(null); setPhase("idle"); }}>
            <ArrowLeft className="h-4 w-4" aria-hidden /> {t("factory.newSession")}
          </Button>
        )}
      </header>

      {info && !info.enabled && (
        <p role="status" className="mb-4 rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-muted">{info.unavailable?.message}</p>
      )}

      {!created ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-5">
            {keyCard}

            <Card className="p-5">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <FlaskConical className="h-4 w-4 text-subtle" aria-hidden /> 2 · {t("factory.step.agent")}
              </h2>
              <p className="mb-2 text-sm font-medium">{t("factory.template")}</p>
              <div role="radiogroup" aria-label={t("factory.template")} className="grid gap-2 sm:grid-cols-2">
                <OptionCard selected={template === "orchestrator"} onClick={() => setTemplate("orchestrator")} icon={<Box className="h-4 w-4" />} title={t("factory.tplOrchestrator")} body={t("factory.tplOrchestratorBody")} />
                <OptionCard selected={template === "blank"} onClick={() => setTemplate("blank")} icon={<Plus className="h-4 w-4" />} title={t("factory.tplBlank")} body={t("factory.tplBlankBody")} />
              </div>
              {template === "blank" && (
                <Field label={t("factory.instructions")} className="mt-3">
                  {(p) => <Textarea {...p} rows={4} maxLength={8000} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="You are…" />}
                </Field>
              )}
              <p className="mb-2 mt-4 text-sm font-medium">{t("factory.model")}</p>
              <div role="radiogroup" aria-label={t("factory.model")} className="flex flex-wrap gap-2">
                {(info?.models ?? ["gpt-6.1-sol", "gpt-6-astra", "gpt-6-luna"]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={model === m}
                    onClick={() => setModel(m)}
                    className={cn("focus-ring rounded-lg border px-3 py-1.5 font-mono text-[12.5px]", model === m ? "border-primary bg-primary-soft/40 text-fg" : "border-border text-muted hover:text-fg")}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-subtle">{t("factory.modelHint")}</p>
            </Card>

            <Card className="p-5">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Box className="h-4 w-4 text-subtle" aria-hidden /> 3 · {t("factory.step.env")}
              </h2>
              <div role="radiogroup" aria-label={t("factory.step.env")} className="grid gap-2 sm:grid-cols-2">
                <OptionCard selected={envKind === "openai_hosted"} onClick={() => setEnvKind("openai_hosted")} icon={<Cloud className="h-4 w-4" />} title={t("factory.envHosted")} body={t("factory.envHostedBody")} />
                <OptionCard selected={envKind === "self_hosted"} onClick={() => setEnvKind("self_hosted")} icon={<Laptop className="h-4 w-4" />} title={t("factory.envSelf")} body={t("factory.envSelfBody")} />
              </div>
              {envKind === "self_hosted" && (
                <Field label={t("factory.workspace")} className="mt-3">
                  {(p) => <Input {...p} className="font-mono" value={workspace} onChange={(e) => setWorkspace(e.target.value)} />}
                </Field>
              )}
            </Card>

            {error && (
              <div role="alert" className="flex gap-2 rounded-xl border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-danger-fg">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {error}
              </div>
            )}
            <Button size="lg" onClick={() => void create()} disabled={!keyValid || creating || (info !== null && !info.enabled)}>
              {creating ? <Spinner className="h-4 w-4" /> : <FlaskConical className="h-4 w-4" aria-hidden />} {creating ? t("factory.creating") : t("factory.create")}
            </Button>
          </div>

          <aside className="space-y-5">
            <Card className="p-5">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <ShieldCheck className="h-4 w-4 text-subtle" aria-hidden /> {t("factory.scopes")}
              </h2>
              <ul className="space-y-1.5">
                {(info?.scopes ?? ["api.agents.read", "api.agents.write", "api.responses.write"]).map((s) => (
                  <li key={s}>
                    <Badge size="sm" variant="neutral">{s}</Badge>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs leading-relaxed text-muted">{t("factory.envKeyNote")}</p>
              {info && (
                <p className="mt-3 text-xs leading-relaxed text-subtle">
                  {t("factory.limits").replace("{s}", String(info.limits.sessionsPerHour)).replace("{t}", String(info.limits.turnsPerHour))}
                </p>
              )}
            </Card>
            {info && info.sessions.length > 0 && (
              <Card className="p-5">
                <h2 className="mb-3 text-sm font-semibold">{t("factory.recent")}</h2>
                <ul className="space-y-1">
                  {info.sessions.map((s) => (
                    <li key={s.id}>
                      <button type="button" onClick={() => openExisting(s)} className="focus-ring w-full truncate rounded-md px-2 py-1.5 text-left text-[13px] text-muted hover:bg-surface-2 hover:text-fg">
                        {s.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </aside>
        </div>
      ) : (
        <div className="space-y-5">
          {!keyValid && keyCard}
          <Card className="p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Check className="h-4 w-4 text-success" aria-hidden />
              <h2 className="text-sm font-semibold">{t("factory.ready")}</h2>
              <Badge size="sm" variant="outline">{created.model}</Badge>
              <Badge size="sm" variant="outline">{created.environment === "self_hosted" ? "self-hosted" : "openai-hosted"}</Badge>
              {created.environment === "self_hosted" && phase !== "idle" && (
                <span role="status" aria-live="polite" className={cn("ml-auto flex items-center gap-2 text-xs", phase === "connected" ? "text-success" : phase === "failed" || phase === "expired" ? "text-danger" : "text-muted")}>
                  {phase === "watching" || phase === "pending" ? <Spinner className="h-3.5 w-3.5" /> : null}
                  {t(`factory.env.${phase}` as const)}
                </span>
              )}
            </div>
            {(created.agentId || created.sessionId) && (
              <p className="mt-2 font-mono text-[11.5px] text-subtle">
                {t("factory.ids")}: {created.agentId} · {created.sessionId}
              </p>
            )}
            {created.selfHosted && (
              <div className="mt-4">
                <p className="mb-1 text-sm font-medium">{t("factory.runThis")}</p>
                <p className="mb-2 text-xs leading-relaxed text-muted">{t("factory.runThisHint")}</p>
                <CodeBlock code={`mkdir -p ${created.selfHosted.workspaceDirectory ?? workspace}\n${created.selfHosted.command}`} title="your machine" prompt />
                {(phase === "timeout" || phase === "failed" || phase === "disconnected") && (
                  <Button variant="secondary" size="sm" className="mt-2" onClick={() => void watch(created.conversationId)}>
                    {t("factory.watchAgain")}
                  </Button>
                )}
              </div>
            )}
          </Card>
          {chatInfo && (
            <ChatApp
              key={created.conversationId}
              className="h-[78vh] min-h-[560px]"
              byok={{ conversationId: created.conversationId, info: chatInfo, getKey: () => keyRef.current.trim(), starters: created.template === "orchestrator" }}
            />
          )}
        </div>
      )}
    </div>
  );
}
