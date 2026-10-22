import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TEMPLATES } from "@/data/templates";
import type { AgentPlan } from "@/lib/ai/types";
import { customStepsForPlan } from "@/lib/ai/steps";
import { applyEdits, composeSteps, configForTemplate, flattenCommands } from "@/lib/composer";
import { generateSitePlan } from "@/lib/chat/site-plan";
import { toBash, toPowerShell } from "@/lib/scripts";

/**
 * Regression: the Builder's script panel and every "Copy" button, and the AI planner preview, used
 * flattenCommands(), which skips step.files and keeps dev-server steps. Pasting that gave the bare scaffold
 * (for example the purple Vite page) and the dev server blocked the rest. They now use toBash()/toPowerShell(),
 * the same functions as the setup.sh / setup.ps1 downloads.
 */
describe("copied script equals the downloadable script", () => {
  for (const template of TEMPLATES) {
    const config = configForTemplate(template.id, { projectName: "demo-app" });
    const steps = composeSteps(config);
    const files = steps.flatMap((s) => s.files);

    it(`${template.id}: the bash script writes every starter file`, () => {
      const sh = toBash(steps, config);
      for (const f of files) expect(sh, `missing ${f.path}`).toContain(`cat > '${f.path}' <<`);
    });

    it(`${template.id}: the PowerShell script writes every starter file`, () => {
      const ps = toPowerShell(steps, config);
      for (const f of files) expect(ps, `missing ${f.path}`).toContain(`Write-NvxFile '${f.path}'`);
    });

    it(`${template.id}: dev-server, manual and publish commands are not active lines`, () => {
      const sh = toBash(steps, config);
      const skipped = steps.filter((s) => s.kind === "longRunning" || s.kind === "manual" || s.kind === "publish");
      for (const s of skipped) {
        for (const cmd of s.commands) {
          for (const line of cmd.split("\n")) if (line.trim()) expect(sh.split("\n")).not.toContain(line);
        }
      }
    });
  }

  it("flattenCommands alone cannot be the copy source: it drops the starter files", () => {
    const withFiles = TEMPLATES.filter((t) => composeSteps(configForTemplate(t.id, { projectName: "x" })).some((s) => s.files.length > 0));
    expect(withFiles.length).toBeGreaterThan(0);
    for (const t of withFiles) {
      const config = configForTemplate(t.id, { projectName: "x" });
      const steps = composeSteps(config);
      const first = steps.flatMap((s) => s.files)[0];
      expect(flattenCommands(steps).join("\n")).not.toContain(first.path + " <<");
      expect(toBash(steps, config)).toContain(first.path);
    }
  });
});

describe("UI components use the full script", () => {
  const read = (p: string) => readFileSync(new URL(`../src/components/${p}`, import.meta.url), "utf8");

  it("Builder shows and copies the script, not the flat command list", () => {
    const src = read("builder.tsx");
    expect(src).toMatch(/const script = os === "windows" \? toPowerShell\(steps, config, lang\) : toBash\(steps, config, lang\)/);
    expect(src).not.toMatch(/copy\(allCommands\.join/);
    expect(src).not.toMatch(/code=\{allCommands\.join/);
    expect(src.match(/copy\(script/g)?.length).toBe(2);
    expect(src).toContain("<CodeBlock code={script}");
  });

  it("AI planner preview uses toBash", () => {
    const src = read("agent-panel.tsx");
    expect(src).toContain('import { toBash } from "@/lib/scripts"');
    expect(src).toContain("customStepsForPlan(plan)");
    expect(src).not.toContain("flattenCommands");
    expect(src).toContain("<CodeBlock code={preview}");
  });

  it("Builder and preview use the same plan steps", () => {
    expect(read("builder.tsx")).toContain("customStepsForPlan(plan)");
  });

  it("offers external links to alternative app platforms", () => {
    const src = read("agent-panel.tsx");
    for (const url of [
      "https://expo.dev",
      "https://developer.android.com/studio",
      "https://replit.com",
      "https://github.com/features/codespaces",
    ]) {
      expect(src).toContain(url);
    }
    expect(src).toContain('"แพลตฟอร์มพัฒนาแอป"');
  });
});

describe("AI plan starter files", () => {
  const plan: AgentPlan = {
    source: "openai",
    model: "test-model",
    lang: "en",
    templateId: "nextjs-dashboard",
    projectName: "demo-app",
    summary: "A test app",
    addons: [],
    jsPm: "npm",
    pyPm: "pip",
    extraSteps: [],
    fileTree: [],
    starterFiles: [{ path: "src/generated.ts", content: "export const generated = true;" }],
    nextSteps: [],
    warnings: [],
  };

  it("appear in both full setup scripts used by the preview and Builder", () => {
    const config = configForTemplate(plan.templateId, { projectName: plan.projectName });
    const steps = applyEdits(composeSteps(config), { custom: customStepsForPlan(plan) });
    const bash = toBash(steps, config);
    const powershell = toPowerShell(steps, config);

    expect(bash).toContain("cat > 'src/generated.ts' <<'NVX_EOF'");
    expect(bash).toContain("export const generated = true;");
    expect(powershell).toContain("Write-NvxFile 'src/generated.ts'");
    expect(powershell).toContain("export const generated = true;");
  });

  it("does not add starter files from fallback plans", () => {
    expect(customStepsForPlan({ ...plan, source: "fallback" })).toEqual([]);
  });
});

describe("chat site plan", () => {
  it("setup_commands never lists a dev server, manual or publish step", () => {
    const plan = generateSitePlan({ site_name: "Acme Agents", primary_functions: ["support chat"], integration_services: ["OpenAI"], design_theme: "dark", user_roles: [] });
    expect(plan.setup_commands.length).toBeGreaterThan(0);
    const blocked = /(\bnpm run dev\b|\bnext dev\b|\bvite\b$|fastapi dev|streamlit run|npm publish|twine upload|npm link)/;
    for (const c of plan.setup_commands) expect(c, c).not.toMatch(blocked);
    expect(plan.notes.length).toBe(2);
  });
});
