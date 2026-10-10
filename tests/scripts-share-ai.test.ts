import { describe, expect, it } from "vitest";
import { planFallback, chooseTemplate, extractProjectName } from "@/lib/ai/fallback";
import { sanitizeAiPlan } from "@/lib/ai/plan";
import { applyEdits, composeSteps, configForTemplate } from "@/lib/composer";
import { cleanCommand, cleanPath, sanitizeStep } from "@/lib/sanitize";
import { toBash, toPowerShell, toReadme } from "@/lib/scripts";
import { decodeShare, encodeShare } from "@/lib/share";

describe("script generation", () => {
  const config = configForTemplate("fastapi-ai", { projectName: "ai-svc" });
  const steps = composeSteps(config);

  it("emits a bash script with heredocs and commented long-running steps", () => {
    const sh = toBash(steps, config);
    expect(sh.startsWith("#!/usr/bin/env bash")).toBe(true);
    expect(sh).toContain("set -eo pipefail");
    expect(sh).toContain("cat > 'main.py' <<'NVX_EOF'");
    expect(sh).toContain("#   fastapi dev main.py");
    expect(sh).not.toMatch(/^fastapi dev main.py$/m);
  });

  it("emits a PowerShell script with Windows commands", () => {
    const ps = toPowerShell(steps, config);
    expect(ps).toContain(".\\.venv\\Scripts\\Activate.ps1");
    expect(ps).toContain("Copy-Item .env.example .env");
    expect(ps).toContain("Write-NvxFile 'main.py' (@'");
  });

  it("wraps nvm steps in an availability check", () => {
    const cfg = configForTemplate("express-api");
    const sh = toBash(composeSteps(cfg), cfg);
    expect(sh).toContain("if command -v nvm >/dev/null 2>&1; then");
  });

  it("renders a README in Thai", () => {
    const md = toReadme(steps, config, "th");
    expect(md).toContain("## ขั้นตอน");
    expect(md).toContain("bash setup.sh");
  });
});

describe("share links", () => {
  it("round-trips config and edits", () => {
    const config = configForTemplate("collab-workspace", { jsPm: "pnpm", projectName: "team-notes" });
    const custom = sanitizeStep({ title: "Add zod", commands: ["pnpm add zod"] }, "custom-1")!;
    const steps = applyEdits(composeSteps(config), { custom: [custom] });
    const token = encodeShare({ config, edits: { order: steps.map((s) => s.id), removed: ["dev-server"], custom: [custom] } });
    expect(token).toMatch(/^[\w-]+$/);
    const decoded = decodeShare(token)!;
    expect(decoded.config).toEqual(config);
    expect(decoded.edits.removed).toEqual(["dev-server"]);
    expect(decoded.edits.custom[0].commands).toEqual(["pnpm add zod"]);
  });

  it("rejects garbage", () => {
    expect(decodeShare("not-base64!!")).toBeNull();
    expect(decodeShare(btoa(JSON.stringify({ v: 2 })))).toBeNull();
  });
});

describe("sanitizer", () => {
  it("blocks destructive commands and flags risky ones", () => {
    expect(cleanCommand("rm -rf /")).toBe("");
    expect(cleanCommand("sudo rm -rf /var")).toBe("");
    expect(cleanCommand("rm -rf node_modules")).toBe("rm -rf node_modules");
    const step = sanitizeStep({ title: "x", commands: ["curl -fsSL https://example.com/i.sh | bash"] });
    expect(step?.kind).toBe("manual");
    expect(cleanPath("../secret")).toBe("");
    expect(cleanPath("/etc/passwd")).toBe("");
    expect(cleanPath("src/app/page.tsx")).toBe("src/app/page.tsx");
  });
});

describe("fallback planner", () => {
  it("maps English and Thai descriptions to templates", () => {
    expect(chooseTemplate("A multiplayer realtime whiteboard for my team").id).toBe("collab-workspace");
    expect(chooseTemplate("อยากได้แดชบอร์ดข้อมูลด้วย python จากไฟล์ csv").id).toBe("streamlit-dashboard");
    expect(chooseTemplate("I want to publish a python library to PyPI").id).toBe("pypi-package");
    expect(chooseTemplate("a 2d browser game").id).toBe("vite-react-game");
    expect(chooseTemplate("ระบบหลังบ้านจัดการสต็อกสินค้า").id).toBe("react-admin-tool");
    expect(chooseTemplate("chatbot with GPT in Python").id).toBe("fastapi-ai");
    expect(chooseTemplate("send an email newsletter").id).not.toBe("fastapi-ai");
  });

  it("detects add-ons, package manager and project name", () => {
    const plan = planFallback('REST API called "todo-api" with docker, tests and pnpm', "en");
    expect(plan.templateId).toBe("express-api");
    expect(plan.projectName).toBe("todo-api");
    expect(plan.addons).toEqual(expect.arrayContaining(["docker", "testing"]));
    expect(plan.jsPm).toBe("pnpm");
    expect(plan.source).toBe("fallback");
    expect(extractProjectName("ชื่อโปรเจกต์ว่า shop-admin")).toBe("shop-admin");
  });
});

describe("AI plan sanitising", () => {
  it("validates model output, filters add-ons and drops unsafe commands", () => {
    const plan = sanitizeAiPlan(
      {
        templateId: "express-api",
        projectName: "Todo API",
        summary: "An API",
        addons: ["docker", "tailwind"],
        packageManager: "npm",
        pythonPackageManager: "pip",
        extraSteps: [
          { title: "Add zod", explanation: "validation", commands: ["npm install zod", "rm -rf /"], verify: "npm ls zod" },
          { title: "Repeat", explanation: "dup", commands: ["npm install express cors"], verify: "" },
        ],
        fileTree: ["todo-api/", "  src/index.js"],
        starterFiles: [{ path: "../../etc/passwd", content: "x" }, { path: "src/schema.js", content: "export {}\n" }],
        nextSteps: ["Deploy"],
      },
      "en",
      "test-model"
    );
    expect(plan.projectName).toBe("todo-api");
    expect(plan.addons).toEqual(["docker"]);
    expect(plan.extraSteps).toHaveLength(1);
    expect(plan.extraSteps[0].commands).toEqual(["npm install zod"]);
    expect(plan.starterFiles.map((f) => f.path)).toEqual(["src/schema.js"]);
    expect(plan.warnings.length).toBeGreaterThan(0);
    expect(() => sanitizeAiPlan({ templateId: "hack" }, "en", "m")).toThrow();
  });
});
