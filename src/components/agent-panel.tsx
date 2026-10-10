"use client";

import { useEffect, useMemo, useState } from "react";
import { getTemplate } from "@/data/templates";
import type { AgentPlan } from "@/lib/ai/types";
import { applyEdits, composeSteps, configForTemplate, flattenCommands } from "@/lib/composer";
import { CodeBlock } from "./copy-button";
import { useLang } from "./prefs";

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
  const [loaded, setLoaded] = useState(false);
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
    setLoaded(false);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (mode === "auto" && useOwnKey && apiKey.trim()) headers["x-openai-key"] = apiKey.trim();
      const res = await fetch("/api/plan", { method: "POST", headers, body: JSON.stringify({ prompt, lang, mode }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t("agent.error"));
      setPlan(data as AgentPlan);
    } catch (e) {
      setError((e as Error).message || t("agent.error"));
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

  return (
    <section id="agent" aria-labelledby="agent-h" className="card scroll-mt-24 overflow-hidden">
      <div className="hero-glow border-b border-slate-200 p-5 dark:border-slate-800 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="agent-h" className="text-2xl font-bold">
            🤖 {t("agent.title")}
          </h2>
          {server && (
            <span className={`chip ${server.serverKeyConfigured ? "border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-300" : ""}`}>
              {t("agent.serverAi")}: {server.serverKeyConfigured ? `${t("agent.available")} · ${server.model}` : t("agent.notConfigured")}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{t("agent.subtitle")}</p>

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
          <textarea
            id="agent-prompt"
            className="input min-h-24 resize-y text-base"
            placeholder={t("agent.placeholder")}
            value={prompt}
            maxLength={2000}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit("auto");
            }}
          />
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-slate-500">{t("agent.examples")}</span>
            {EXAMPLES[lang].map((ex) => (
              <button key={ex} type="button" className="chip hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => setPrompt(ex)}>
                {ex}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={useOwnKey} onChange={(e) => setUseOwnKey(e.target.checked)} className="h-4 w-4 accent-indigo-600" />
              {t("agent.ownKey")}
            </label>
            {useOwnKey && (
              <div className="max-w-md">
                <label htmlFor="agent-key" className="sr-only">
                  {t("agent.keyLabel")}
                </label>
                <input
                  id="agent-key"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  className="input font-mono"
                  placeholder="sk-..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn-primary" disabled={busy || prompt.trim().length < 3}>
              {busy ? `⏳ ${t("agent.thinking")}` : `✨ ${t("agent.submit")}`}
            </button>
            <button type="button" className="btn-secondary" disabled={busy || prompt.trim().length < 3} onClick={() => submit("fallback")}>
              {t("agent.offline")}
            </button>
          </div>
        </form>
      </div>

      <div aria-live="polite" aria-busy={busy}>
        {error && <p className="m-5 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{error}</p>}
        {plan && (
          <div className="space-y-5 p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`chip ${
                  plan.source === "openai"
                    ? "border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-300"
                    : "border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300"
                }`}
              >
                {plan.source === "openai" ? `${t("agent.sourceAi")} · ${plan.model}` : t("agent.sourceFallback")}
              </span>
              <span className="chip">
                {t("agent.template")}: {template?.name[lang]}
              </span>
              <span className="chip font-mono">{plan.projectName}</span>
              {plan.addons.map((a) => (
                <span key={a} className="chip">
                  + {a}
                </span>
              ))}
            </div>
            {plan.fallbackReason && (
              <p className="text-xs text-slate-500">
                {t("agent.reason")}: {plan.fallbackReason}
              </p>
            )}
            <p className="whitespace-pre-line">{plan.summary}</p>

            {plan.warnings.length > 0 && (
              <div className="rounded-xl bg-amber-50 p-3 text-sm dark:bg-amber-500/10">
                <p className="font-semibold text-amber-800 dark:text-amber-300">{t("agent.warnings")}</p>
                <ul className="mt-1 list-disc pl-5">
                  {plan.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="grid gap-5 lg:grid-cols-2">
              <div>
                <h3 className="mb-2 font-semibold">{t("agent.commands")}</h3>
                <CodeBlock code={preview.join("\n")} />
                {plan.extraSteps.length > 0 && (
                  <>
                    <h3 className="mb-2 mt-4 font-semibold">{t("agent.extra")}</h3>
                    <ul className="space-y-2 text-sm">
                      {plan.extraSteps.map((s) => (
                        <li key={s.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                          <p className="font-medium">{s.title[lang]}</p>
                          <p className="text-slate-600 dark:text-slate-300">{s.explanation[lang]}</p>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
              <div className="space-y-4">
                <div>
                  <h3 className="mb-2 font-semibold">{t("template.fileTree")}</h3>
                  <pre className="code text-xs">{plan.fileTree.join("\n")}</pre>
                </div>
                {plan.starterFiles.length > 0 && (
                  <div>
                    <h3 className="mb-2 font-semibold">{t("agent.files")}</h3>
                    <div className="space-y-2">
                      {plan.starterFiles.map((f) => (
                        <details key={f.path} className="rounded-xl border border-slate-200 p-2 dark:border-slate-800">
                          <summary className="cursor-pointer font-mono text-sm">{f.path}</summary>
                          <div className="mt-2">
                            <CodeBlock code={f.content} />
                          </div>
                        </details>
                      ))}
                    </div>
                  </div>
                )}
                {plan.nextSteps.length > 0 && (
                  <div>
                    <h3 className="mb-2 font-semibold">{t("template.next")}</h3>
                    <ul className="list-disc space-y-1 pl-5 text-sm">
                      {plan.nextSteps.map((n) => (
                        <li key={n}>{n}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="btn-primary px-5 py-2.5"
                onClick={() => {
                  onLoad(plan);
                  setLoaded(true);
                }}
              >
                ⤵ {t("agent.load")}
              </button>
              {loaded && <span className="text-sm text-emerald-600 dark:text-emerald-400">{t("agent.loaded")}</span>}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
