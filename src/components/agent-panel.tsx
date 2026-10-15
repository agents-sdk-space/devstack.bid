"use client";

import { useEffect, useMemo, useState } from "react";
import { getTemplate } from "@/data/templates";
import type { AgentPlan } from "@/lib/ai/types";
import { applyEdits, composeSteps, configForTemplate, flattenCommands } from "@/lib/composer";
import { CreateTokenMenu } from "@/components/tokens/create-token-menu";
import { RememberToggle } from "@/components/tokens/remember-toggle";
import { rememberSecret } from "@/components/tokens/remember-secret";
import { Badge, Button, Card, Checkbox, EmptyState, Input, Skeleton, Textarea } from "@/components/ui";
import { CodeBlock } from "./copy-button";
import { useLang } from "./prefs";
import { MessageSquareText, RotateCw, Sparkles, TriangleAlert } from "lucide-react";
import { ToolTile } from "./brand/tool-icon";

const EXAMPLES = {
  en: [
    "Realtime collaborative notes app for my team, with Docker",
    "Internal inventory admin tool for our warehouse",
    "Python AI chatbot API with tests and uv",
    "A 2D browser game with Tailwind",
    "Publish a Python CLI package to PyPI",
    "Sales analytics dashboard with CI and tests",
  ],
  th: [
    "แอปจดโน้ตที่ทีมแก้ไขพร้อมกันแบบเรียลไทม์ พร้อม Docker",
    "ระบบหลังบ้านจัดการสต็อกสินค้า",
    "แชทบอท AI ด้วย Python พร้อมเทสต์",
    "เกม 2D บนเบราว์เซอร์",
    "แดชบอร์ดข้อมูลจากไฟล์ CSV ด้วย Python",
    "เครื่องมือ CLI ที่รันผ่าน npx",
  ],
};

export function AgentPanel({ onLoad }: { onLoad: (plan: AgentPlan) => void }) {
  const { lang, t } = useLang();
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<AgentPlan | null>(null);
  const [error, setError] = useState("");
  const [useOwnKey, setUseOwnKey] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [rememberKey, setRememberKey] = useState(false);
  const [lastMode, setLastMode] = useState<"auto" | "fallback">("auto");
  const [server, setServer] = useState<{ serverKeyConfigured: boolean; model: string } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/plan")
      .then((r) => r.json())
      .then((d) => alive && setServer(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  async function submit(mode: "auto" | "fallback") {
    if (prompt.trim().length < 3 || busy) return;
    setBusy(true);
    setError("");
    setLastMode(mode);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (mode === "auto" && useOwnKey && apiKey.trim()) headers["x-openai-key"] = apiKey.trim();
      const res = await fetch("/api/plan", { method: "POST", headers, body: JSON.stringify({ prompt, lang, mode }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t("agent.error"));
      setPlan(data as AgentPlan);
      if (mode === "auto" && useOwnKey && rememberKey && apiKey.trim()) {
        const saved = await rememberSecret("OPENAI_API_KEY", apiKey.trim(), "openai");
        if (!saved.ok) setError(saved.error ?? "");
      }
      requestAnimationFrame(() => document.getElementById("agent-result")?.focus({ preventScroll: false }));
    } catch (e) {
      setError((e as Error).message || t("agent.error"));
      setPlan(null);
    } finally {
      setBusy(false);
    }
  }

  const preview = useMemo(() => {
    if (!plan) return [];
    const config = configForTemplate(plan.templateId, { projectName: plan.projectName, addons: plan.addons, jsPm: plan.jsPm, pyPm: plan.pyPm });
    return flattenCommands(applyEdits(composeSteps(config), { custom: plan.extraSteps }));
  }, [plan]);

  const template = plan ? getTemplate(plan.templateId) : undefined;
  const canSubmit = !busy && prompt.trim().length >= 3;

  return (
    <section id="agent" aria-labelledby="agent-h" className="scroll-mt-32 space-y-4">
      <Card className="hero-glow overflow-hidden p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="agent-h" className="flex items-center gap-3 text-xl font-semibold tracking-tight text-fg">
            <ToolTile id="ai" size="md" />
            {t("agent.title")}
          </h3>
          {server ? (
            <Badge variant={server.serverKeyConfigured ? "success" : "neutral"}>
              {t("agent.serverAi")}: {server.serverKeyConfigured ? `${t("agent.available")} · ${server.model}` : t("agent.notConfigured")}
            </Badge>
          ) : (
            <Skeleton className="h-5 w-48 rounded-sm" />
          )}
        </div>
        <p className="mt-1 text-sm text-muted">{t("agent.subtitle")}</p>

        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit("auto");
          }}
        >
          <label htmlFor="agent-prompt" className="sr-only">
            {t("agent.label")}
          </label>
          <Textarea
            id="agent-prompt"
            className="min-h-24 resize-y text-base"
            placeholder={t("agent.placeholder")}
            value={prompt}
            maxLength={2000}
            aria-keyshortcuts="Control+Enter Meta+Enter"
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit("auto");
            }}
          />
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className="mr-1 text-subtle">{t("agent.examples")}</span>
            {EXAMPLES[lang].map((ex) => (
              <button
                key={ex}
                type="button"
                className="focus-ring motion-fast rounded-full border border-border bg-surface-2 px-3 py-1 text-xs text-muted hover:border-border-strong hover:text-fg"
                onClick={() => setPrompt(ex)}
              >
                {ex}
              </button>
            ))}
          </div>
          <Checkbox label={t("agent.ownKey")} checked={useOwnKey} onCheckedChange={setUseOwnKey} />
          {useOwnKey && (
            <div className="max-w-md">
              <label htmlFor="agent-key" className="sr-only">
                {t("agent.keyLabel")}
              </label>
              <Input
                id="agent-key"
                type="password"
                autoComplete="off"
                spellCheck={false}
                className="font-mono"
                placeholder="sk-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <RememberToggle checked={rememberKey} onCheckedChange={setRememberKey} />
                <CreateTokenMenu primary="openai" />
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={busy && lastMode === "auto"} disabled={!canSubmit}>
              {busy && lastMode === "auto" ? (
                t("agent.thinking")
              ) : (
                <>
                  <Sparkles className="h-4 w-4" aria-hidden /> {t("agent.submit")}
                </>
              )}
            </Button>
            <Button variant="secondary" loading={busy && lastMode === "fallback"} disabled={!canSubmit} onClick={() => submit("fallback")}>
              {t("agent.offline")}
            </Button>
          </div>
        </form>
      </Card>

      <div aria-live="polite" aria-busy={busy}>
        {busy ? (
          <Card className="space-y-4 p-5 sm:p-6" role="status">
            <span className="sr-only">{t("agent.thinking")}</span>
            <div className="flex gap-2">
              <Skeleton className="h-6 w-32 rounded-sm" />
              <Skeleton className="h-6 w-40 rounded-sm" />
              <Skeleton className="h-6 w-24 rounded-sm" />
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <div className="grid gap-4 lg:grid-cols-2">
              <Skeleton className="h-40" />
              <Skeleton className="h-40" />
            </div>
          </Card>
        ) : error ? (
          <EmptyState
            tone="danger"
            icon={<TriangleAlert className="h-6 w-6" strokeWidth={1.75} />}
            title={t("agent.errorTitle")}
            description={error}
            action={
              <>
                <Button onClick={() => submit(lastMode)} disabled={!canSubmit}>
                  <RotateCw className="h-4 w-4" aria-hidden /> {t("agent.retry")}
                </Button>
                {lastMode === "auto" && (
                  <Button variant="secondary" onClick={() => submit("fallback")} disabled={!canSubmit}>
                    {t("agent.retryOffline")}
                  </Button>
                )}
              </>
            }
          />
        ) : !plan ? (
          <EmptyState icon={<MessageSquareText className="h-6 w-6" strokeWidth={1.75} />} title={t("agent.emptyTitle")} description={t("agent.emptyBody")} />
        ) : (
          <Card id="agent-result" tabIndex={-1} aria-label={t("agent.planReady")} className="space-y-5 p-5 outline-none sm:p-6 animate-fade-in">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant={plan.source === "openai" ? "success" : "warning"}>
                {plan.source === "openai" ? `${t("agent.sourceAi")} · ${plan.model}` : t("agent.sourceFallback")}
              </Badge>
              <Badge variant="primary">
                {t("agent.template")}: {template?.name[lang]}
              </Badge>
              <Badge className="font-mono">{plan.projectName}</Badge>
              {plan.addons.map((a) => (
                <Badge key={a} variant="outline">
                  + {a}
                </Badge>
              ))}
            </div>
            {plan.fallbackReason && (
              <p className="text-xs text-subtle">
                {t("agent.reason")}: {plan.fallbackReason}
              </p>
            )}
            <p className="whitespace-pre-line text-fg">{plan.summary}</p>

            {plan.warnings.length > 0 && (
              <div className="rounded-lg bg-warning-soft p-3 text-sm">
                <p className="font-semibold text-warning-fg">{t("agent.warnings")}</p>
                <ul className="mt-1 list-disc pl-5 text-fg">
                  {plan.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="grid gap-5 lg:grid-cols-2">
              <div className="min-w-0">
                <h4 className="mb-2 font-semibold text-fg">{t("agent.commands")}</h4>
                <CodeBlock code={preview.join("\n")} prompt maxHeight="22rem" />
                {plan.extraSteps.length > 0 && (
                  <>
                    <h4 className="mb-2 mt-4 font-semibold text-fg">{t("agent.extra")}</h4>
                    <ul className="space-y-2 text-sm">
                      {plan.extraSteps.map((s) => (
                        <li key={s.id} className="rounded-lg border border-border p-3">
                          <p className="font-medium text-fg">{s.title[lang]}</p>
                          <p className="text-muted">{s.explanation[lang]}</p>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
              <div className="min-w-0 space-y-4">
                <div>
                  <h4 className="mb-2 font-semibold text-fg">{t("template.fileTree")}</h4>
                  <pre className="overflow-x-auto rounded-lg bg-surface-2 p-3 font-mono text-xs leading-6 text-muted">{plan.fileTree.join("\n")}</pre>
                </div>
                {plan.starterFiles.length > 0 && (
                  <div>
                    <h4 className="mb-2 font-semibold text-fg">{t("agent.files")}</h4>
                    <div className="space-y-2">
                      {plan.starterFiles.map((f) => (
                        <details key={f.path} className="rounded-lg border border-border p-2">
                          <summary className="focus-ring cursor-pointer rounded font-mono text-sm">{f.path}</summary>
                          <div className="mt-2">
                            <CodeBlock code={f.content} title={f.path} maxHeight="20rem" />
                          </div>
                        </details>
                      ))}
                    </div>
                  </div>
                )}
                {plan.nextSteps.length > 0 && (
                  <div>
                    <h4 className="mb-2 font-semibold text-fg">{t("template.next")}</h4>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-fg">
                      {plan.nextSteps.map((n) => (
                        <li key={n}>{n}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
              <Button size="lg" onClick={() => onLoad(plan)}>
                ⤵ {t("agent.load")}
              </Button>
            </div>
          </Card>
        )}
      </div>
    </section>
  );
}
