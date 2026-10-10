import { describe, expect, it } from "vitest";
import { TEMPLATES } from "@/data/templates";
import { applyEdits, composeSteps, configForTemplate, dedupeSteps, flattenCommands, moveStep, normalizeConfig } from "@/lib/composer";
import { sanitizeProjectName } from "@/lib/placeholders";

describe("composeSteps", () => {
  it("starts Node templates with nvm and resolves every placeholder", () => {
    const steps = composeSteps(configForTemplate("nextjs-dashboard"));
    expect(steps[0].id).toBe("node-nvm");
    expect(steps[0].commands).toEqual(["nvm install --lts", "nvm use --lts"]);
    expect(steps[0].windows).toEqual(["nvm install lts", "nvm use lts"]);
    const all = JSON.stringify(steps);
    expect(all).not.toMatch(/\{\{[a-zA-Z]+\}\}/);
    expect(all).not.toContain("⟨");
  });

  it("builds create-next-app flags from add-ons and package manager", () => {
    const ts = composeSteps(configForTemplate("nextjs-dashboard", { jsPm: "pnpm", projectName: "my-dash" }));
    const create = ts.find((s) => s.id === "create-next-app")!;
    expect(create.commands[0]).toBe(
      'pnpm create next-app@latest my-dash --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-pnpm --yes'
    );
    expect(ts.some((s) => s.id === "pm-pnpm")).toBe(true);

    const js = composeSteps(configForTemplate("nextjs-dashboard", { addons: [], projectName: "x" }));
    expect(js.find((s) => s.id === "create-next-app")!.commands[0]).toBe(
      'npx create-next-app@latest x --js --no-tailwind --no-linter --app --src-dir --import-alias "@/*" --use-npm --yes'
    );
    expect(js.find((s) => s.id === "dashboard-page")!.files[0].path).toBe("src/app/page.js");
  });

  it("uses the npm `--` separator for create-vite only with npm", () => {
    const npm = composeSteps(configForTemplate("vite-react-game", { projectName: "g" }));
    expect(npm.find((s) => s.id === "create-vite")!.commands[0]).toBe("npm create vite@latest g -- --template react-ts --no-interactive");
    const yarn = composeSteps(configForTemplate("vite-react-game", { projectName: "g", jsPm: "yarn", addons: ["eslint"] }));
    expect(yarn.find((s) => s.id === "create-vite")!.commands[0]).toBe("yarn create vite g --template react --no-interactive --eslint");
  });

  it("strips TypeScript-only syntax for JavaScript projects", () => {
    const js = composeSteps(configForTemplate("vite-react-game", { addons: [] }));
    const file = js.find((s) => s.id === "game-code")!.files[0];
    expect(file.path).toBe("src/App.jsx");
    expect(file.content).toContain("useRef(null)");
    expect(file.content).not.toContain("HTMLCanvasElement");
    const ts = composeSteps(configForTemplate("vite-react-game"));
    expect(ts.find((s) => s.id === "game-code")!.files[0].content).toContain("useRef<HTMLCanvasElement>(null)");
  });

  it("uses pip or uv for Python templates", () => {
    const pip = composeSteps(configForTemplate("fastapi-ai", { python: "3.12" }));
    expect(pip.map((s) => s.id).slice(0, 3)).toEqual(["python-check", "mkdir-cd", "py-venv"]);
    expect(pip.find((s) => s.id === "py-venv")!.commands).toEqual(["python3 -m venv .venv", "source .venv/bin/activate"]);
    expect(pip.find((s) => s.id === "py-venv")!.windows).toEqual(["py -3.12 -m venv .venv", ".\\.venv\\Scripts\\Activate.ps1"]);
    expect(pip.find((s) => s.id === "fastapi-deps")!.commands[0]).toBe('python -m pip install "fastapi[standard]" openai python-dotenv');

    const uv = composeSteps(configForTemplate("fastapi-ai", { pyPm: "uv", python: "3.13" }));
    expect(uv.map((s) => s.id).slice(0, 2)).toEqual(["uv-install", "uv-python"]);
    expect(uv.find((s) => s.id === "py-venv")!.commands[0]).toBe("uv venv --python 3.13");
    expect(uv.find((s) => s.id === "fastapi-deps")!.commands[0]).toMatch(/^uv pip install /);
  });

  it("inserts add-on steps before long-running steps and ignores unsupported add-ons", () => {
    const steps = composeSteps(configForTemplate("express-api", { addons: ["testing", "docker", "ci", "tailwind"] }));
    const ids = steps.map((s) => s.id);
    expect(ids).toContain("addon-vitest");
    expect(ids).toContain("addon-docker");
    expect(ids).toContain("addon-ci");
    expect(ids).not.toContain("addon-tailwind-vite");
    expect(ids.indexOf("addon-ci")).toBeLessThan(ids.indexOf("dev-server"));
    const ci = steps.find((s) => s.id === "addon-ci")!.files[0].content;
    expect(ci).toContain("npm ci");
    expect(ci).toContain("npm run test");
  });

  it("produces a de-duplicated sequence for every template", () => {
    for (const t of TEMPLATES) {
      const steps = composeSteps(configForTemplate(t.id, { addons: [...t.supportedAddons] }));
      const ids = steps.map((s) => s.id);
      expect(new Set(ids).size, t.id).toBe(ids.length);
      expect(steps.every((s) => s.title.en && s.title.th && s.expected.en && s.expected.th), t.id).toBe(true);
    }
  });
});

describe("dedupe / edits", () => {
  it("drops steps with the same id or identical commands", () => {
    const base = composeSteps(configForTemplate("express-api"));
    const dup = { ...base[1], id: "another-id" };
    expect(dedupeSteps([...base, base[0], dup])).toHaveLength(base.length);
  });

  it("applies removal, manual order, and keeps new steps in natural position", () => {
    const steps = composeSteps(configForTemplate("express-api"));
    const ids = steps.map((s) => s.id);
    const order = moveStep(ids, "express-deps", -1);
    const edited = applyEdits(steps, { order, removed: ["dev-server"] });
    expect(edited.map((s) => s.id)).toEqual(order.filter((id) => id !== "dev-server"));

    const withTesting = composeSteps(configForTemplate("express-api", { addons: ["testing"] }));
    const merged = applyEdits(withTesting, { order, removed: [] }).map((s) => s.id);
    expect(merged.indexOf("addon-vitest")).toBe(merged.indexOf("express-server") + 1);
  });

  it("flattens commands for copy-all", () => {
    const cmds = flattenCommands(composeSteps(configForTemplate("node-cli-npx", { projectName: "hi" })));
    expect(cmds).toContain("npm publish --access public");
    expect(cmds.slice(0, 4)).toEqual(["nvm install --lts", "nvm use --lts", "mkdir hi", "cd hi"]);
  });
});

describe("normalization", () => {
  it("sanitizes project names and rejects unknown values", () => {
    expect(sanitizeProjectName("My Cool App!!")).toBe("my-cool-app");
    expect(sanitizeProjectName("../../etc")).toBe("etc");
    expect(sanitizeProjectName("แอปของฉัน")).toBe("my-app");
    const cfg = normalizeConfig({ templateId: "nope", jsPm: "bun" as never, addons: ["docker", "evil" as never] });
    expect(cfg.templateId).toBe("nextjs-dashboard");
    expect(cfg.jsPm).toBe("npm");
    expect(cfg.addons).toEqual(["docker"]);
  });
});
