"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ADDON_LABELS } from "@/data/addon-steps";
import { getTemplate, TEMPLATES } from "@/data/templates";
import type { AgentPlan } from "@/lib/ai/types";
import { applyEdits, composeSteps, configForTemplate, DEFAULT_CONFIG, flattenCommands, moveStep, normalizeConfig } from "@/lib/composer";
import { buildStarterZip, downloadBlob, downloadText, shareUrlFor } from "@/lib/download";
import { CATEGORY_LABELS } from "@/lib/i18n";
import { sanitizeStep } from "@/lib/sanitize";
import { toBash, toPowerShell, toReadme } from "@/lib/scripts";
import { decodeShare, encodeShare } from "@/lib/share";
import { ADDON_IDS, type BuilderConfig, type BuilderEdits, type ResolvedStep } from "@/lib/types";
import { AgentPanel } from "./agent-panel";
import { copyText } from "./copy-button";
import { OsToggle } from "./os-toggle";
import { useLang } from "./prefs";
import { StepCard } from "./step-card";

const EMPTY_EDITS: BuilderEdits = { order: [], removed: [], custom: [] };
const STORAGE_KEY = "nvx-builder-state";

interface State {
  config: BuilderConfig;
  edits: BuilderEdits;
  fromShare: boolean;
}

/** Initial state from the URL hash (#s=share, #t=template) or the last session. */
function readInitialState(): State {
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const s = hash.get("s");
  if (s) {
    const decoded = decodeShare(s);
    if (decoded) return { ...decoded, fromShare: true };
  }
  const t = hash.get("t");
  if (t && getTemplate(t)) return { config: configForTemplate(t), edits: EMPTY_EDITS, fromShare: false };
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const decoded = saved ? decodeShare(saved) : null;
    if (decoded) return { ...decoded, fromShare: false };
  } catch {}
  return { config: DEFAULT_CONFIG, edits: EMPTY_EDITS, fromShare: false };
}

function Segmented<T extends string>({
  name,
  legend,
  value,
  options,
  onChange,
  disabled,
  hint,
}: {
  name: string;
  legend: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <fieldset className={disabled ? "opacity-50" : ""}>
      <legend className="label">
        {legend} {hint && <span className="text-xs font-normal text-slate-500">{hint}</span>}
      </legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <label
            key={o.value}
            className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-indigo-500 ${
              value === o.value
                ? "border-indigo-600 bg-indigo-600 text-white"
                : "border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            }`}
          >
            <input type="radio" className="sr-only" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function Builder() {
  const { lang, t } = useLang();
  const [initial] = useState(readInitialState);
  const [config, setConfig] = useState<BuilderConfig>(initial.config);
  const [edits, setEdits] = useState<BuilderEdits>(initial.edits);
  const [os, setOs] = useState<"posix" | "windows">("posix");
  const [status, setStatus] = useState(initial.fromShare ? t("builder.loadedShare") : "");
  const [customTitle, setCustomTitle] = useState("");
  const [customCmd, setCustomCmd] = useState("");
  const [customError, setCustomError] = useState("");
  const [nameDraft, setNameDraft] = useState(initial.config.projectName);
  const builderHeading = useRef<HTMLHeadingElement>(null);

  const template = getTemplate(config.templateId)!;
  const composed = useMemo(() => composeSteps(config), [config]);
  const steps = useMemo(() => applyEdits(composed, edits), [composed, edits]);
  const removedSteps = useMemo(() => {
    const all = applyEdits(composed, { custom: edits.custom });
    return all.filter((s) => edits.removed.includes(s.id));
  }, [composed, edits]);

  // Keep the URL hash + localStorage in sync so reloads and share links restore this exact stack.
  useEffect(() => {
    const token = encodeShare({ config, edits });
    window.history.replaceState(null, "", `/builder#s=${token}`);
    try {
      localStorage.setItem(STORAGE_KEY, token);
    } catch {}
  }, [config, edits]);

  // Pasting a different share link into the address bar loads it.
  useEffect(() => {
    const onHash = () => {
      const params = new URLSearchParams(window.location.hash.slice(1));
      const s = params.get("s");
      const tpl = params.get("t");
      if (s && s !== encodeShare({ config, edits })) {
        const decoded = decodeShare(s);
        if (decoded) {
          setConfig(decoded.config);
          setEdits(decoded.edits);
          setNameDraft(decoded.config.projectName);
        }
      } else if (tpl && getTemplate(tpl)) {
        const next = configForTemplate(tpl, config);
        setConfig({ ...next, projectName: getTemplate(tpl)!.defaultName, addons: [...getTemplate(tpl)!.defaultAddons] });
        setNameDraft(getTemplate(tpl)!.defaultName);
        setEdits(EMPTY_EDITS);
      }
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [config, edits]);

  const update = useCallback((patch: Partial<BuilderConfig>) => setConfig((c) => normalizeConfig({ ...c, ...patch })), []);

  function changeTemplate(id: string) {
    const tpl = getTemplate(id)!;
    setConfig(configForTemplate(id, { node: config.node, python: config.python, jsPm: config.jsPm, pyPm: config.pyPm }));
    setNameDraft(tpl.defaultName);
    setEdits(EMPTY_EDITS);
  }

  function loadPlan(plan: AgentPlan) {
    const next = configForTemplate(plan.templateId, {
      node: config.node,
      python: config.python,
      projectName: plan.projectName,
      addons: plan.addons,
      jsPm: plan.jsPm,
      pyPm: plan.pyPm,
    });
    const custom: ResolvedStep[] = [...plan.extraSteps];
    if (plan.source === "openai" && plan.starterFiles.length) {
      const filesStep = sanitizeStep(
        {
          id: "custom-ai-files",
          title: { en: "Add AI-generated starter files", th: "เพิ่มไฟล์เริ่มต้นที่ AI สร้าง" },
          explanation: {
            en: "Key files proposed by the AI agent. Review them — they may overwrite files created by earlier steps.",
            th: "ไฟล์สำคัญที่ AI agent เสนอ ควรตรวจสอบก่อน เพราะอาจเขียนทับไฟล์จากขั้นตอนก่อนหน้า",
          },
          commands: [],
          files: plan.starterFiles,
          expected: { en: "Starter files are in place.", th: "มีไฟล์เริ่มต้นครบแล้ว" },
        },
        "custom-ai-files"
      );
      if (filesStep) custom.push(filesStep);
    }
    setConfig(next);
    setNameDraft(next.projectName);
    setEdits({ order: [], removed: [], custom });
    setStatus(t("agent.loaded"));
    requestAnimationFrame(() => {
      document.getElementById("builder")?.scrollIntoView({ behavior: "smooth", block: "start" });
      builderHeading.current?.focus();
    });
  }

  function addCustom() {
    const commands = customCmd.split("\n").map((c) => c.trim()).filter(Boolean);
    const step = sanitizeStep(
      { title: customTitle.trim() || "Custom step", explanation: "", commands, expected: "" },
      `custom-u-${Date.now().toString(36)}`
    );
    if (!step || step.commands.length !== commands.length) {
      setCustomError(t("builder.customBlocked"));
      return;
    }
    setEdits((e) => ({ ...e, custom: [...e.custom, step] }));
    setCustomTitle("");
    setCustomCmd("");
    setCustomError("");
  }

  async function copyAll() {
    const text = flattenCommands(steps, os).join("\n");
    if (await copyText(text)) setStatus(`${t("step.copied")} (${flattenCommands(steps, os).length})`);
  }

  async function share() {
    if (await copyText(shareUrlFor(config, edits))) setStatus(t("builder.shareCopied"));
  }

  const usesNode = template.runtimes.includes("node");
  const usesPython = template.runtimes.includes("python");
  const groups = [...new Set(TEMPLATES.map((tpl) => tpl.category))];

  return (
    <div className="space-y-8">
      <AgentPanel onLoad={loadPlan} />

      <section id="builder" aria-labelledby="builder-h" className="scroll-mt-24">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 id="builder-h" ref={builderHeading} tabIndex={-1} className="text-3xl font-bold outline-none">
              🧩 {t("builder.title")}
            </h1>
            <p className="mt-1 text-slate-600 dark:text-slate-300">{t("builder.subtitle")}</p>
          </div>
          <p role="status" aria-live="polite" className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
            {status}
          </p>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[340px_1fr]">
          <aside aria-labelledby="config-h" className="card h-fit space-y-5 p-5 lg:sticky lg:top-20">
            <h2 id="config-h" className="text-lg font-semibold">
              {t("builder.config")}
            </h2>
            <div>
              <label htmlFor="tpl" className="label">
                {t("builder.template")}
              </label>
              <select id="tpl" className="input" value={config.templateId} onChange={(e) => changeTemplate(e.target.value)}>
                {groups.map((g) => (
                  <optgroup key={g} label={CATEGORY_LABELS[g][lang]}>
                    {TEMPLATES.filter((tpl) => tpl.category === g).map((tpl) => (
                      <option key={tpl.id} value={tpl.id}>
                        {tpl.name[lang]}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500">{template.summary[lang]}</p>
            </div>
            <div>
              <label htmlFor="pname" className="label">
                {t("builder.name")}
              </label>
              <input
                id="pname"
                className="input font-mono"
                value={nameDraft}
                maxLength={50}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={() => {
                  update({ projectName: nameDraft });
                  setNameDraft(normalizeConfig({ ...config, projectName: nameDraft }).projectName);
                }}
                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                aria-describedby="pname-hint"
              />
              <p id="pname-hint" className="mt-1 text-xs text-slate-500">
                a-z 0-9 - _ .
              </p>
            </div>

            <div className="space-y-4">
              <div className={usesNode ? "" : "opacity-50"}>
                <label htmlFor="node" className="label">
                  {t("builder.node")} {!usesNode && <span className="text-xs font-normal text-slate-500">{t("builder.notUsed")}</span>}
                </label>
                <select id="node" className="input" value={config.node} onChange={(e) => update({ node: e.target.value as BuilderConfig["node"] })}>
                  <option value="lts">LTS (nvm install --lts)</option>
                  <option value="24">Node 24</option>
                  <option value="22">Node 22</option>
                  <option value="20">Node 20</option>
                </select>
              </div>
              <Segmented
                name="jsPm"
                legend={t("builder.jsPm")}
                value={config.jsPm}
                disabled={!usesNode}
                hint={!usesNode ? t("builder.notUsed") : undefined}
                options={[
                  { value: "npm", label: "npm" },
                  { value: "pnpm", label: "pnpm" },
                  { value: "yarn", label: "yarn" },
                ]}
                onChange={(v) => update({ jsPm: v })}
              />
              <div className={usesPython ? "" : "opacity-50"}>
                <label htmlFor="py" className="label">
                  {t("builder.python")} {!usesPython && <span className="text-xs font-normal text-slate-500">{t("builder.notUsed")}</span>}
                </label>
                <select id="py" className="input" value={config.python} onChange={(e) => update({ python: e.target.value as BuilderConfig["python"] })}>
                  <option value="3.13">Python 3.13</option>
                  <option value="3.12">Python 3.12</option>
                  <option value="3.11">Python 3.11</option>
                </select>
              </div>
              <Segmented
                name="pyPm"
                legend={t("builder.pyPm")}
                value={config.pyPm}
                disabled={!usesPython}
                hint={!usesPython ? t("builder.notUsed") : undefined}
                options={[
                  { value: "pip", label: "pip + venv" },
                  { value: "uv", label: "uv" },
                ]}
                onChange={(v) => update({ pyPm: v })}
              />
            </div>

            <fieldset>
              <legend className="label">{t("builder.addons")}</legend>
              <div className="space-y-1.5">
                {ADDON_IDS.map((id) => {
                  const supported = template.supportedAddons.includes(id);
                  return (
                    <label key={id} className={`flex items-center gap-2 text-sm ${supported ? "cursor-pointer" : "opacity-50"}`}>
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-indigo-600"
                        disabled={!supported}
                        checked={supported && config.addons.includes(id)}
                        onChange={(e) =>
                          update({ addons: e.target.checked ? [...config.addons, id] : config.addons.filter((a) => a !== id) })
                        }
                        aria-describedby={supported ? undefined : `addon-${id}-hint`}
                      />
                      {ADDON_LABELS[id][lang]}
                      {!supported && (
                        <span id={`addon-${id}-hint`} className="text-xs text-slate-500">
                          · {t("builder.unsupported")}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </aside>

          <div className="min-w-0 space-y-4">
            <div className="card flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">
                  {t("builder.steps")} <span className="text-slate-400">· {steps.length} {t("builder.stepCount")}</span>
                </h2>
                <OsToggle os={os} onChange={setOs} />
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-primary" onClick={copyAll}>
                  📋 {t("builder.copyAll")}
                </button>
                <button type="button" className="btn-secondary" onClick={share}>
                  🔗 {t("builder.share")}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => downloadText("setup.sh", toBash(steps, config, lang), "text/x-shellscript")}
                >
                  ⬇ setup.sh
                </button>
                <button type="button" className="btn-secondary" onClick={() => downloadText("setup.ps1", toPowerShell(steps, config, lang))}>
                  ⬇ setup.ps1
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => downloadText("README.md", toReadme(steps, config, lang, shareUrlFor(config, edits)), "text/markdown")}
                >
                  ⬇ README.md
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={async () => downloadBlob(`${config.projectName}-starter.zip`, await buildStarterZip(steps, config, edits, lang))}
                >
                  📦 {t("builder.zip")}
                </button>
                {(edits.order.length > 0 || edits.removed.length > 0 || edits.custom.length > 0) && (
                  <button type="button" className="btn-ghost" onClick={() => setEdits(EMPTY_EDITS)}>
                    ↺ {t("builder.reset")}
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-500">{t("builder.scriptNote")}</p>
            </div>

            <ol className="space-y-4" aria-label={t("builder.steps")}>
              {steps.map((step, i) => (
                <StepCard
                  key={step.id}
                  step={step}
                  index={i}
                  os={os}
                  actions={
                    <>
                      <button
                        type="button"
                        className="btn-ghost"
                        disabled={i === 0}
                        aria-label={`${t("step.up")}: ${step.title[lang]}`}
                        onClick={() => setEdits((e) => ({ ...e, order: moveStep(steps.map((s) => s.id), step.id, -1) }))}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="btn-ghost"
                        disabled={i === steps.length - 1}
                        aria-label={`${t("step.down")}: ${step.title[lang]}`}
                        onClick={() => setEdits((e) => ({ ...e, order: moveStep(steps.map((s) => s.id), step.id, 1) }))}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="btn-ghost text-red-600 dark:text-red-400"
                        aria-label={`${t("step.remove")}: ${step.title[lang]}`}
                        onClick={() => setEdits((e) => ({ ...e, removed: [...e.removed, step.id] }))}
                      >
                        ✕
                      </button>
                    </>
                  }
                />
              ))}
            </ol>

            {removedSteps.length > 0 && (
              <div className="card p-4">
                <h3 className="font-semibold">{t("builder.removed")}</h3>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {removedSteps.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        className="btn-secondary px-3 py-1"
                        onClick={() => setEdits((e) => ({ ...e, removed: e.removed.filter((id) => id !== s.id) }))}
                      >
                        ↺ {t("builder.restore")}: {s.title[lang]}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <form
              className="card space-y-3 p-4"
              onSubmit={(e) => {
                e.preventDefault();
                addCustom();
              }}
            >
              <h3 className="font-semibold">{t("builder.addCustom")}</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="ctitle" className="label">
                    {t("builder.customTitle")}
                  </label>
                  <input id="ctitle" className="input" value={customTitle} maxLength={120} onChange={(e) => setCustomTitle(e.target.value)} />
                </div>
                <div>
                  <label htmlFor="ccmd" className="label">
                    {t("builder.customCommand")}
                  </label>
                  <textarea
                    id="ccmd"
                    className="input font-mono"
                    rows={2}
                    value={customCmd}
                    onChange={(e) => setCustomCmd(e.target.value)}
                    placeholder={config.jsPm === "npm" ? "npm install zod" : `${config.jsPm} add zod`}
                  />
                </div>
              </div>
              {customError && (
                <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                  {customError}
                </p>
              )}
              <button type="submit" className="btn-secondary" disabled={!customCmd.trim()}>
                + {t("builder.add")}
              </button>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}
