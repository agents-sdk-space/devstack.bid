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
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardTitle,
  Checkbox,
  cn,
  copyText,
  EmptyState,
  Field,
  Input,
  Segmented,
  Select,
  Stepper,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  Tooltip,
  useToast,
} from "@/components/ui";
import { AgentPanel } from "./agent-panel";
import { CodeBlock } from "./copy-button";
import { OsToggle } from "./os-toggle";
import { useLang } from "./prefs";
import { SortableSteps } from "./sortable-steps";

const EMPTY_EDITS: BuilderEdits = { order: [], removed: [], custom: [] };
const STORAGE_KEY = "nvx-builder-state";

interface State {
  config: BuilderConfig;
  edits: BuilderEdits;
  fromShare: boolean;
  stage: Stage;
  startTab: "ai" | "pick";
}

/** Wizard stages: 0 Start · 1 Configure · 2 Review & reorder · 3 Export. */
type Stage = 0 | 1 | 2 | 3;

/** Initial state from the URL hash (#s=share, #t=template) or the last session. */
function readInitialState(): State {
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const s = hash.get("s");
  if (s) {
    const decoded = decodeShare(s);
    if (decoded) return { ...decoded, fromShare: true, stage: 2, startTab: "ai" };
  }
  const t = hash.get("t");
  if (t && getTemplate(t)) return { config: configForTemplate(t), edits: EMPTY_EDITS, fromShare: false, stage: 1, startTab: "pick" };
  const startTab = hash.has("pick") ? "pick" : "ai";
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const decoded = saved ? decodeShare(saved) : null;
    if (decoded) return { ...decoded, fromShare: false, stage: 0, startTab };
  } catch {}
  return { config: DEFAULT_CONFIG, edits: EMPTY_EDITS, fromShare: false, stage: 0, startTab };
}

export function Builder() {
  const { lang, t } = useLang();
  const toast = useToast();
  const [initial] = useState(readInitialState);
  const [config, setConfig] = useState<BuilderConfig>(initial.config);
  const [edits, setEdits] = useState<BuilderEdits>(initial.edits);
  const [stage, setStage] = useState<Stage>(initial.stage);
  const [startTab, setStartTab] = useState<"ai" | "pick">(initial.startTab);
  const [os, setOs] = useState<"posix" | "windows">("posix");
  const [customTitle, setCustomTitle] = useState("");
  const [customCmd, setCustomCmd] = useState("");
  const [customError, setCustomError] = useState("");
  const [nameDraft, setNameDraft] = useState(initial.config.projectName);
  const stageHeading = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  const template = getTemplate(config.templateId)!;
  const composed = useMemo(() => composeSteps(config), [config]);
  const steps = useMemo(() => applyEdits(composed, edits), [composed, edits]);
  const removedSteps = useMemo(() => {
    const all = applyEdits(composed, { custom: edits.custom });
    return all.filter((s) => edits.removed.includes(s.id));
  }, [composed, edits]);
  const hasEdits = edits.order.length > 0 || edits.removed.length > 0 || edits.custom.length > 0;

  // Announce a shared stack once on load.
  useEffect(() => {
    if (initial.fromShare) toast({ title: t("builder.loadedShare"), variant: "info" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once
  }, []);

  // Move focus to the stage heading when the stage changes (not on first render).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    stageHeading.current?.focus({ preventScroll: true });
    document.getElementById("builder")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [stage]);

  // Keep the URL hash + localStorage in sync so reloads and share links restore this exact stack.
  useEffect(() => {
    const token = encodeShare({ config, edits });
    window.history.replaceState(null, "", `/builder#s=${token}`);
    try {
      localStorage.setItem(STORAGE_KEY, token);
    } catch {}
  }, [config, edits]);

  // Pasting a different share link (or a #t= template link) into the address bar loads it.
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
          setStage(2);
          toast({ title: t("builder.loadedShare"), variant: "info" });
        }
      } else if (tpl && getTemplate(tpl)) {
        const next = configForTemplate(tpl, config);
        setConfig({ ...next, projectName: getTemplate(tpl)!.defaultName, addons: [...getTemplate(tpl)!.defaultAddons] });
        setNameDraft(getTemplate(tpl)!.defaultName);
        setEdits(EMPTY_EDITS);
        setStage(1);
      }
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [config, edits, t, toast]);

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
    setStage(1);
    toast({ title: t("agent.loaded"), description: getTemplate(plan.templateId)?.name[lang], variant: "success" });
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
    toast({ title: t("toast.added"), description: step.title[lang], variant: "success" });
  }

  async function copy(text: string, title: string, description?: string) {
    if (await copyText(text)) toast({ title, description, variant: "success" });
    else toast({ title: t("toast.copyFailed"), variant: "error" });
  }

  function download(filename: string, run: () => void | Promise<void>) {
    Promise.resolve(run())
      .then(() => toast({ title: t("toast.downloaded"), description: filename, variant: "success" }))
      .catch(() => toast({ title: t("agent.error"), variant: "error" }));
  }

  function removeStep(step: ResolvedStep) {
    setEdits((e) => ({ ...e, removed: [...e.removed, step.id] }));
    toast({ title: t("toast.removed"), description: `${step.title[lang]} · ${t("toast.undo")}` });
  }

  function resetEdits() {
    setEdits(EMPTY_EDITS);
    toast({ title: t("toast.reset") });
  }

  const usesNode = template.runtimes.includes("node");
  const usesPython = template.runtimes.includes("python");
  const groups = [...new Set(TEMPLATES.map((tpl) => tpl.category))];
  const allCommands = flattenCommands(steps, os);

  const stages = [
    { id: "start", label: t("stage.start"), description: t("stage.startDesc") },
    { id: "configure", label: t("stage.configure"), description: t("stage.configureDesc") },
    { id: "review", label: t("stage.review"), description: t("stage.reviewDesc") },
    { id: "export", label: t("stage.export"), description: t("stage.exportDesc") },
  ];

  const stageTitle = (
    <h2 id="stage-h" ref={stageHeading} tabIndex={-1} className="text-xl font-semibold text-fg outline-none">
      <span className="text-subtle">{stage + 1}/4 · </span>
      {stages[stage].label}
    </h2>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="term-prompt text-3xl font-bold tracking-tight text-fg">{t("builder.title")}</h1>
          <p className="mt-1 max-w-2xl text-muted">{t("builder.subtitle")}</p>
        </div>
      </div>

      <Card className="p-2">
        <Stepper items={stages} current={stage} onStepChange={(i) => setStage(i as Stage)} label={t("stage.progress")} />
      </Card>

      {/* Summary bar: always visible so users know what they're building. */}
      <section
        aria-label={t("summary.label")}
        className="z-20 -mx-4 md:sticky md:top-14 flex flex-wrap items-center gap-2 border-y border-border bg-bg px-4 py-2.5 sm:mx-0 sm:rounded-lg sm:border"
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-subtle">{t("summary.label")}</span>
        <Badge variant="primary">{template.name[lang]}</Badge>
        <Badge className="font-mono">{config.projectName}</Badge>
        {usesNode && <Badge variant="info">Node {config.node === "lts" ? "LTS" : config.node} · {config.jsPm}</Badge>}
        {usesPython && <Badge variant="info">Python {config.python} · {config.pyPm}</Badge>}
        {config.addons.map((a) => (
          <Badge key={a} variant="success" size="sm">
            + {ADDON_LABELS[a][lang]}
          </Badge>
        ))}
        <span className="ml-auto flex items-center gap-2 text-sm text-muted">
          {steps.length} {t("builder.stepCount")}
          <Tooltip content={t("builder.copyAll")}>
            <Button size="sm" variant="soft" onClick={() => copy(allCommands.join("\n"), t("toast.copied"), `${allCommands.length} commands`)} aria-label={t("builder.copyAll")}>
              📋 <span className="hidden sm:inline">{t("step.copy")}</span>
            </Button>
          </Tooltip>
        </span>
      </section>

      <section id="builder" aria-labelledby="stage-h" className="scroll-mt-32 space-y-4">
        {stage === 0 && (
          <>
            {stageTitle}
            <Tabs value={startTab} onValueChange={(v) => setStartTab(v as "ai" | "pick")}>
              <TabsList aria-label={t("stage.start")}>
                <TabsTrigger value="ai">🤖 {t("start.ai")}</TabsTrigger>
                <TabsTrigger value="pick">📚 {t("start.pick")}</TabsTrigger>
              </TabsList>
              <TabsContent value="ai" className="mt-4">
                <AgentPanel onLoad={loadPlan} />
              </TabsContent>
              <TabsContent value="pick" className="mt-4">
                <fieldset>
                  <legend className="sr-only">{t("start.pick")}</legend>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {TEMPLATES.map((tpl) => {
                      const selected = tpl.id === config.templateId;
                      return (
                        <label
                          key={tpl.id}
                          className={cn(
                            "motion-base relative flex cursor-pointer flex-col rounded-xl border bg-surface p-4 shadow-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                            selected ? "border-primary ring-1 ring-primary" : "border-border hover:border-border-strong"
                          )}
                        >
                          <input
                            type="radio"
                            name="start-template"
                            className="sr-only"
                            checked={selected}
                            onChange={() => {
                              changeTemplate(tpl.id);
                            }}
                          />
                          <span className="flex items-center justify-between gap-2">
                            <Badge size="sm" variant="primary">
                              {CATEGORY_LABELS[tpl.category][lang]}
                            </Badge>
                            {selected && <Badge size="sm" variant="success">✓ {t("start.current")}</Badge>}
                          </span>
                          <span className="mt-2 font-semibold text-fg">{tpl.name[lang]}</span>
                          <span className="mt-1 line-clamp-2 text-sm text-muted">{tpl.summary[lang]}</span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              </TabsContent>
            </Tabs>
          </>
        )}

        {stage === 1 && (
          <>
            {stageTitle}
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardContent className="space-y-4">
                  <CardTitle as="h3">{t("builder.config")}</CardTitle>
                  <Field label={t("builder.template")} hint={template.summary[lang]}>
                    {(p) => (
                      <Select {...p} value={config.templateId} onChange={(e) => changeTemplate(e.target.value)}>
                        {groups.map((g) => (
                          <optgroup key={g} label={CATEGORY_LABELS[g][lang]}>
                            {TEMPLATES.filter((tpl) => tpl.category === g).map((tpl) => (
                              <option key={tpl.id} value={tpl.id}>
                                {tpl.name[lang]}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </Select>
                    )}
                  </Field>
                  <Field label={t("builder.name")} hint="a-z 0-9 - _ .">
                    {(p) => (
                      <Input
                        {...p}
                        className="font-mono"
                        value={nameDraft}
                        maxLength={50}
                        onChange={(e) => setNameDraft(e.target.value)}
                        onBlur={() => {
                          update({ projectName: nameDraft });
                          setNameDraft(normalizeConfig({ ...config, projectName: nameDraft }).projectName);
                        }}
                        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                      />
                    )}
                  </Field>
                  <fieldset className="space-y-2">
                    <legend className="mb-1.5 text-sm font-medium text-fg">{t("builder.addons")}</legend>
                    {ADDON_IDS.map((id) => {
                      const supported = template.supportedAddons.includes(id);
                      return (
                        <Checkbox
                          key={id}
                          label={ADDON_LABELS[id][lang]}
                          description={supported ? undefined : t("builder.unsupported")}
                          disabled={!supported}
                          checked={supported && config.addons.includes(id)}
                          onCheckedChange={(checked) => update({ addons: checked ? [...config.addons, id] : config.addons.filter((a) => a !== id) })}
                        />
                      );
                    })}
                  </fieldset>
                </CardContent>
              </Card>
              <div className="space-y-4">
                <Card>
                  <CardContent className="space-y-4">
                    <CardTitle as="h3">
                      Node.js {!usesNode && <span className="text-xs font-normal text-subtle">{t("builder.notUsed")}</span>}
                    </CardTitle>
                    <Field label={t("builder.node")}>
                      {(p) => (
                        <Select {...p} disabled={!usesNode} value={config.node} onChange={(e) => update({ node: e.target.value as BuilderConfig["node"] })}>
                          <option value="lts">LTS (nvm install --lts)</option>
                          <option value="24">Node 24</option>
                          <option value="22">Node 22</option>
                          <option value="20">Node 20</option>
                        </Select>
                      )}
                    </Field>
                    <Segmented
                      legend={t("builder.jsPm")}
                      value={config.jsPm}
                      disabled={!usesNode}
                      options={[
                        { value: "npm", label: "npm" },
                        { value: "pnpm", label: "pnpm" },
                        { value: "yarn", label: "yarn" },
                      ]}
                      onChange={(v) => update({ jsPm: v })}
                    />
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="space-y-4">
                    <CardTitle as="h3">
                      Python {!usesPython && <span className="text-xs font-normal text-subtle">{t("builder.notUsed")}</span>}
                    </CardTitle>
                    <Field label={t("builder.python")}>
                      {(p) => (
                        <Select {...p} disabled={!usesPython} value={config.python} onChange={(e) => update({ python: e.target.value as BuilderConfig["python"] })}>
                          <option value="3.13">Python 3.13</option>
                          <option value="3.12">Python 3.12</option>
                          <option value="3.11">Python 3.11</option>
                        </Select>
                      )}
                    </Field>
                    <Segmented
                      legend={t("builder.pyPm")}
                      value={config.pyPm}
                      disabled={!usesPython}
                      options={[
                        { value: "pip", label: "pip + venv" },
                        { value: "uv", label: "uv" },
                      ]}
                      onChange={(v) => update({ pyPm: v })}
                    />
                  </CardContent>
                </Card>
              </div>
            </div>
          </>
        )}

        {stage === 2 && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              {stageTitle}
              <div className="flex flex-wrap items-center gap-2">
                <OsToggle os={os} onChange={setOs} />
                {hasEdits && (
                  <Button variant="ghost" size="sm" onClick={resetEdits}>
                    ↺ {t("builder.reset")}
                  </Button>
                )}
              </div>
            </div>
            <p className="text-sm text-subtle">{t("review.dragHint")}</p>

            {steps.length === 0 ? (
              <EmptyState
                icon="🗂️"
                title={t("review.emptyTitle")}
                description={t("review.emptyBody")}
                action={<Button onClick={resetEdits}>↺ {t("builder.reset")}</Button>}
              />
            ) : (
              <SortableSteps
                steps={steps}
                os={os}
                onReorder={(order) => setEdits((e) => ({ ...e, order }))}
                renderActions={(step, i) => (
                  <>
                    <Tooltip content={t("step.up")}>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={i === 0}
                        aria-label={`${t("step.up")}: ${step.title[lang]}`}
                        onClick={() => setEdits((e) => ({ ...e, order: moveStep(steps.map((s) => s.id), step.id, -1) }))}
                      >
                        ↑
                      </Button>
                    </Tooltip>
                    <Tooltip content={t("step.down")}>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={i === steps.length - 1}
                        aria-label={`${t("step.down")}: ${step.title[lang]}`}
                        onClick={() => setEdits((e) => ({ ...e, order: moveStep(steps.map((s) => s.id), step.id, 1) }))}
                      >
                        ↓
                      </Button>
                    </Tooltip>
                    <Tooltip content={t("step.remove")}>
                      <Button variant="ghost" size="icon" className="text-danger hover:bg-danger-soft hover:text-danger" aria-label={`${t("step.remove")}: ${step.title[lang]}`} onClick={() => removeStep(step)}>
                        ✕
                      </Button>
                    </Tooltip>
                  </>
                )}
              />
            )}

            {removedSteps.length > 0 && (
              <Card>
                <CardContent>
                  <CardTitle>{t("builder.removed")}</CardTitle>
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {removedSteps.map((s) => (
                      <li key={s.id}>
                        <Button variant="secondary" size="sm" onClick={() => setEdits((e) => ({ ...e, removed: e.removed.filter((id) => id !== s.id) }))}>
                          ↺ {t("builder.restore")}: {s.title[lang]}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardContent>
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    addCustom();
                  }}
                >
                  <CardTitle>{t("builder.addCustom")}</CardTitle>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label={t("builder.customTitle")}>
                      {(p) => <Input {...p} value={customTitle} maxLength={120} onChange={(e) => setCustomTitle(e.target.value)} />}
                    </Field>
                    <Field label={t("builder.customCommand")} error={customError || undefined}>
                      {(p) => (
                        <Textarea
                          {...p}
                          invalid={!!customError}
                          className="font-mono"
                          rows={2}
                          value={customCmd}
                          onChange={(e) => {
                            setCustomCmd(e.target.value);
                            if (customError) setCustomError("");
                          }}
                          placeholder={config.jsPm === "npm" ? "npm install zod" : `${config.jsPm} add zod`}
                        />
                      )}
                    </Field>
                  </div>
                  <Button type="submit" variant="secondary" disabled={!customCmd.trim()}>
                    + {t("builder.add")}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </>
        )}

        {stage === 3 && (
          <>
            {stageTitle}
            <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
              <Card>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle>
                      {t("export.commands")} <span className="font-normal text-subtle">· {allCommands.length}</span>
                    </CardTitle>
                    <OsToggle os={os} onChange={setOs} />
                  </div>
                  {allCommands.length > 0 ? (
                    <CodeBlock code={allCommands.join("\n")} prompt title={os === "windows" ? "setup.ps1" : "setup.sh"} maxHeight="28rem" />
                  ) : (
                    <EmptyState icon="🗂️" title={t("review.emptyTitle")} action={<Button onClick={() => setStage(2)}>{t("stage.review")}</Button>} />
                  )}
                  <p className="text-xs text-subtle">{t("builder.scriptNote")}</p>
                </CardContent>
              </Card>
              <div className="space-y-4">
                <Card>
                  <CardContent className="space-y-3">
                    <CardTitle>{t("export.files")}</CardTitle>
                    <div className="grid gap-2">
                      <Button className="justify-start" onClick={() => copy(allCommands.join("\n"), t("toast.copied"), `${allCommands.length} commands`)}>
                        📋 {t("builder.copyAll")}
                      </Button>
                      <Button variant="secondary" className="justify-start" onClick={() => download("setup.sh", () => downloadText("setup.sh", toBash(steps, config, lang), "text/x-shellscript"))}>
                        ⬇ setup.sh
                      </Button>
                      <Button variant="secondary" className="justify-start" onClick={() => download("setup.ps1", () => downloadText("setup.ps1", toPowerShell(steps, config, lang)))}>
                        ⬇ setup.ps1
                      </Button>
                      <Button
                        variant="secondary"
                        className="justify-start"
                        onClick={() => download("README.md", () => downloadText("README.md", toReadme(steps, config, lang, shareUrlFor(config, edits)), "text/markdown"))}
                      >
                        ⬇ README.md
                      </Button>
                      <Button
                        variant="secondary"
                        className="justify-start"
                        onClick={() =>
                          download(`${config.projectName}-starter.zip`, async () =>
                            downloadBlob(`${config.projectName}-starter.zip`, await buildStarterZip(steps, config, edits, lang))
                          )
                        }
                      >
                        📦 {t("builder.zip")}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="space-y-3">
                    <CardTitle>{t("export.shareTitle")}</CardTitle>
                    <CardDescription>{t("export.shareBody")}</CardDescription>
                    <Button variant="outline" className="w-full" onClick={() => copy(shareUrlFor(config, edits), t("builder.shareCopied"))}>
                      🔗 {t("builder.share")}
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          </>
        )}
      </section>

      <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
        <Button variant="ghost" disabled={stage === 0} onClick={() => setStage((s) => Math.max(0, s - 1) as Stage)}>
          ← {t("stage.back")}
        </Button>
        {stage < 3 && (
          <Button onClick={() => setStage((s) => Math.min(3, s + 1) as Stage)}>
            {t("stage.next")}: {stages[stage + 1].label} →
          </Button>
        )}
      </div>
    </div>
  );
}
