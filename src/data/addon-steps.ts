import { addonOn } from "@/lib/placeholders";
import type { AddonId, BuilderConfig, L10n, StackTemplate, StepDef } from "@/lib/types";

export const ADDON_LABELS: Record<AddonId, L10n> = {
  typescript: { en: "TypeScript", th: "TypeScript" },
  tailwind: { en: "Tailwind CSS", th: "Tailwind CSS" },
  eslint: { en: "Linting (ESLint / Ruff)", th: "ตรวจโค้ด (ESLint / Ruff)" },
  testing: { en: "Testing (Vitest / pytest)", th: "ทดสอบ (Vitest / pytest)" },
  docker: { en: "Docker", th: "Docker" },
  ci: { en: "GitHub Actions CI", th: "GitHub Actions CI" },
};

const TAILWIND_PATCH = `// Added by NVX Stack Builder: enable Tailwind CSS v4 in a Vite project.
import { readFileSync, writeFileSync } from "node:fs";

const css = "src/index.css";
const current = readFileSync(css, "utf8");
if (!current.includes('@import "tailwindcss"')) {
  writeFileSync(css, '@import "tailwindcss";\\n' + current);
}
console.log("Tailwind import added to " + css);
`;

const VITE_CONFIG = `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
});
`;

const DOCKERIGNORE = `node_modules
.next
dist
.venv
__pycache__
.env
.env.local
.git
`;

function nodeImage(config: BuilderConfig): string {
  return config.node === "lts" ? "node:lts-alpine" : `node:${config.node}-alpine`;
}

function dockerfile(template: StackTemplate, config: BuilderConfig): string | null {
  const d = template.docker;
  if (!d) return null;
  if (d.kind === "python") {
    return `FROM python:${config.python}-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE ${d.port}
CMD ${JSON.stringify(d.cmd)}
`;
  }
  if (d.kind === "static") {
    return `# Build stage
FROM ${nodeImage(config)} AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Serve stage
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
`;
  }
  return `FROM ${nodeImage(config)}
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build --if-present
ENV NODE_ENV=production
EXPOSE ${d.port}
CMD ${JSON.stringify(d.cmd)}
`;
}

function ciWorkflow(template: StackTemplate, config: BuilderConfig): string {
  const isNode = template.runtimes.includes("node");
  const lines = [
    "name: CI",
    "",
    "on:",
    "  push:",
    "    branches: [main]",
    "  pull_request:",
    "",
    "jobs:",
    "  build:",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - uses: actions/checkout@v7",
  ];
  const extra = (template.ci ?? []).map((c) => `      - run: ${c}`);
  if (isNode) {
    if (config.jsPm === "pnpm") {
      lines.push("      - uses: pnpm/action-setup@v6", "        with:", "          version: 10");
    }
    lines.push(
      "      - uses: actions/setup-node@v7",
      "        with:",
      `          node-version: ${config.node === "lts" ? "lts/*" : `'${config.node}'`}`,
      `          cache: ${config.jsPm}`,
      "      - run: {{ciInstall}}"
    );
    if (addonOn(config, template, "eslint")) lines.push("      - run: {{run}} lint");
    if (addonOn(config, template, "testing")) lines.push("      - run: {{run}} test");
  } else {
    lines.push(
      "      - uses: actions/setup-python@v7",
      "        with:",
      `          python-version: '${config.python}'`,
      "      - name: Install dependencies",
      "        run: |",
      "          python -m pip install --upgrade pip",
      "          if [ -f requirements.txt ]; then pip install -r requirements.txt; fi",
      "          if [ -f pyproject.toml ]; then pip install -e .; fi"
    );
    if (addonOn(config, template, "eslint")) lines.push("      - run: pip install ruff && ruff check .");
    if (addonOn(config, template, "testing")) lines.push("      - run: pip install pytest && python -m pytest -q");
  }
  return [...lines, ...extra].join("\n") + "\n";
}

/** Returns the add-on steps for the given template + config (unresolved placeholders). */
export function addonSteps(template: StackTemplate, config: BuilderConfig): StepDef[] {
  const steps: StepDef[] = [];
  const isNode = template.runtimes.includes("node");
  const usesVite = template.steps.some((s) => s.id === "create-vite");

  if (addonOn(config, template, "tailwind") && usesVite) {
    steps.push({
      id: "addon-tailwind-vite",
      title: { en: "Add Tailwind CSS v4 (Vite plugin)", th: "เพิ่ม Tailwind CSS v4 (ปลั๊กอิน Vite)" },
      explanation: {
        en: "Install tailwindcss + @tailwindcss/vite, register the plugin in vite.config and import Tailwind at the top of src/index.css.",
        th: "ติดตั้ง tailwindcss + @tailwindcss/vite ลงทะเบียนปลั๊กอินใน vite.config และ import Tailwind ที่ต้นไฟล์ src/index.css",
      },
      commands: ["{{add}} tailwindcss @tailwindcss/vite", "node scripts/nvx-add-tailwind.mjs"],
      files: [
        { path: "vite.config.{{ext}}", content: VITE_CONFIG },
        { path: "scripts/nvx-add-tailwind.mjs", content: TAILWIND_PATCH },
      ],
      expected: { en: "Tailwind utility classes work in your components.", th: "ใช้คลาสของ Tailwind ใน component ได้" },
      verify: "{{list}} tailwindcss",
    });
  }

  if (addonOn(config, template, "eslint") && !isNode) {
    steps.push({
      id: "addon-ruff",
      title: { en: "Lint and format with Ruff", th: "ตรวจและจัดรูปแบบโค้ดด้วย Ruff" },
      explanation: { en: "Ruff is an extremely fast Python linter and formatter.", th: "Ruff เป็น linter และ formatter สำหรับ Python ที่เร็วมาก" },
      commands: ["{{pip}} ruff", "ruff check . --fix", "ruff format ."],
      expected: { en: "`ruff check .` reports All checks passed!", th: "`ruff check .` แสดง All checks passed!" },
      verify: "ruff check .",
    });
  }

  if (addonOn(config, template, "testing")) {
    if (isNode) {
      steps.push({
        id: "addon-vitest",
        title: { en: "Add unit tests with Vitest", th: "เพิ่ม unit test ด้วย Vitest" },
        explanation: { en: "Vitest is a fast, Jest-compatible test runner.", th: "Vitest เป็นตัวรันเทสต์ที่เร็วและเข้ากันได้กับ Jest" },
        commands: ["{{addDev}} vitest", "npm pkg set 'scripts.test=vitest run'"],
        files: [
          {
            path: "tests/sanity.test.{{ext}}",
            content: `import { describe, expect, it } from "vitest";\n\ndescribe("{{name}}", () => {\n  it("runs tests", () => {\n    expect(1 + 1).toBe(2);\n  });\n});\n`,
          },
        ],
        expected: { en: "1 test passed.", th: "เทสต์ผ่าน 1 รายการ" },
        verify: "{{run}} test",
      });
    } else {
      steps.push({
        id: "addon-pytest",
        title: { en: "Add tests with pytest", th: "เพิ่มเทสต์ด้วย pytest" },
        explanation: { en: "pytest discovers test_*.py files automatically.", th: "pytest ค้นหาไฟล์ test_*.py ให้อัตโนมัติ" },
        commands: ["{{pip}} pytest"],
        files: [{ path: "tests/test_sanity.py", content: "def test_sanity():\n    assert 1 + 1 == 2\n" }],
        expected: { en: "1 passed.", th: "ผ่าน 1 รายการ" },
        verify: "python -m pytest -q",
      });
    }
  }

  if (addonOn(config, template, "docker")) {
    const content = dockerfile(template, config);
    if (content) {
      steps.push({
        id: "addon-docker",
        title: { en: "Containerise with Docker", th: "ทำเป็น container ด้วย Docker" },
        explanation: {
          en: `Dockerfile + .dockerignore. Build the image, then run: docker run -p ${template.docker?.port}:${template.docker?.port} {{name}}`,
          th: `สร้าง Dockerfile + .dockerignore จากนั้น build image แล้วรัน: docker run -p ${template.docker?.port}:${template.docker?.port} {{name}}`,
        },
        commands: [],
        files: [
          { path: "Dockerfile", content },
          { path: ".dockerignore", content: DOCKERIGNORE },
        ],
        osNotes: { en: "Requires Docker Desktop (macOS/Windows) or Docker Engine (Linux).", th: "ต้องติดตั้ง Docker Desktop (macOS/Windows) หรือ Docker Engine (Linux)" },
        expected: { en: "`docker build` finishes and creates the image.", th: "`docker build` สำเร็จและได้ image" },
        verify: "docker build -t {{name}} .",
      });
    }
  }

  if (addonOn(config, template, "ci")) {
    steps.push({
      id: "addon-ci",
      title: { en: "Add GitHub Actions CI", th: "เพิ่ม GitHub Actions CI" },
      explanation: {
        en: "Runs install, lint/test (if enabled) and build on every push and pull request.",
        th: "รันการติดตั้ง, lint/test (ถ้าเปิดใช้) และ build ทุกครั้งที่ push หรือเปิด pull request",
      },
      commands: [],
      files: [{ path: ".github/workflows/ci.yml", content: ciWorkflow(template, config) }],
      expected: { en: "A CI run appears in the Actions tab after you push.", th: "หลัง push จะเห็นการรัน CI ในแท็บ Actions" },
      verify: "cat .github/workflows/ci.yml",
      verifyWindows: "Get-Content .github/workflows/ci.yml",
    });
  }

  return steps;
}
