import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { contentLength, envVarNames, runDocsCheck } from "../scripts/docs-check.mjs";

type Result = { ok: boolean; errors: string[]; pages: { file: string; chars: number }[] };
const check = runDocsCheck as (root: string) => Result;

const LONG = "เนื้อหาตัวอย่างสำหรับทดสอบ docs check ".repeat(30);
const tmpDirs: string[] = [];

function fixture(overrides: Record<string, string | null> = {}): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-check-"));
  tmpDirs.push(root);
  const files: Record<string, string | null> = {
    "package.json": JSON.stringify({ scripts: { dev: "next dev", test: "vitest run" } }),
    "src/data/template-ids.ts": 'export const KNOWN_TEMPLATE_IDS = ["alpha-app", "beta-api"] as const;\n',
    "src/lib/server/env.ts": "const schema = z.object({\n  OPENAI_API_KEY: z.string(),\n  OPENAI_MODEL: z.string(),\n});\n",
    ".env.example": "OPENAI_API_KEY=\n# EXTRA_FLAG=1\n",
    "docs/README.md": `# Index\n\n[Templates](./user-guide/templates.md) ${LONG}`,
    "docs/user-guide/templates.md": `# T\n\nalpha-app beta-api ${LONG}`,
    "docs/reference/template-schema.md": `# S\n\nalpha-app beta-api \`src/data/template-ids.ts\` ${LONG}`,
    "docs/reference/config-env.md": `# Env\n\nOPENAI_API_KEY OPENAI_MODEL EXTRA_FLAG ${LONG}`,
    "docs/reference/npm-scripts.md": `# Scripts\n\n\`dev\` \`test\` ${LONG}`,
    "docs/agents/platform-manifest.json": JSON.stringify({
      templateIds: ["beta-api", "alpha-app"],
      subsystems: [{ id: "templates", keyFiles: ["src/data/template-ids.ts"] }],
    }),
    ...overrides,
  };
  for (const [rel, content] of Object.entries(files)) {
    if (content === null) continue;
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  }
  return root;
}

afterEach(() => {
  while (tmpDirs.length) fs.rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

describe("docs:check", () => {
  it("passes on the real repository", () => {
    const result = check(path.resolve(__dirname, ".."));
    expect(result.errors).toEqual([]);
    expect(result.pages.length).toBeGreaterThan(30);
  });

  it("passes on a valid fixture", () => {
    expect(check(fixture()).errors).toEqual([]);
  });

  it("tolerates missing paths that are git-ignored build output, but not other missing paths", () => {
    const doc = `# Build\n\nOutput goes to \`public/studio/\` and \`public/studio/assets/app.js\`. ${LONG}`;
    expect(check(fixture({ ".gitignore": "# build\n/public/studio/\nnode_modules\n", "docs/build.md": doc })).errors).toEqual([]);
    const errors = check(fixture({ "docs/build.md": doc })).errors;
    expect(errors).toContain("docs/build.md: path `public/studio/` does not exist");
    const other = check(fixture({ ".gitignore": "/public/studio/\n", "docs/build.md": `# B\n\n\`public/other.js\` ${LONG}` })).errors;
    expect(other).toContain("docs/build.md: path `public/other.js` does not exist");
  });

  it("counts prose only, not code blocks or link targets", () => {
    const md = "# Title\n\n```bash\n" + "x".repeat(2000) + "\n```\n\n[ok](https://example.com/very/long/url)";
    expect(contentLength(md)).toBeLessThan(20);
  });

  it("flags pages shorter than 500 characters", () => {
    const { errors } = check(fixture({ "docs/user-guide/short.md": "# Short\n\nสั้นเกินไป" }));
    expect(errors.some((e) => e.includes("short.md") && e.includes("content characters"))).toBe(true);
  });

  it("flags broken relative links and missing backtick paths", () => {
    const { errors } = check(
      fixture({ "docs/user-guide/extra.md": `[gone](../nope.md) \`src/lib/missing.ts\` \`src/data/templates/<id>.ts\` ${LONG}` }),
    );
    expect(errors).toContain("docs/user-guide/extra.md: broken link -> ../nope.md");
    expect(errors).toContain("docs/user-guide/extra.md: path `src/lib/missing.ts` does not exist");
    expect(errors.some((e) => e.includes("<id>"))).toBe(false);
  });

  it("flags undocumented template ids", () => {
    const { errors } = check(fixture({ "docs/user-guide/templates.md": `# T\n\nalpha-app ${LONG}` }));
    expect(errors).toContain('docs/user-guide/templates.md: template id "beta-api" is not documented');
  });

  it("flags undocumented env vars, including commented example keys", () => {
    const root = fixture({ "docs/reference/config-env.md": `# Env\n\nOPENAI_API_KEY ${LONG}` });
    expect(envVarNames(root)).toEqual(["EXTRA_FLAG", "OPENAI_API_KEY", "OPENAI_MODEL"]);
    const { errors } = check(root);
    expect(errors).toContain('docs/reference/config-env.md: env var "OPENAI_MODEL" is not documented');
    expect(errors).toContain('docs/reference/config-env.md: env var "EXTRA_FLAG" is not documented');
  });

  it("flags undocumented npm scripts and manifest drift", () => {
    const { errors } = check(
      fixture({
        "docs/reference/npm-scripts.md": `# Scripts\n\n\`dev\` ${LONG}`,
        "docs/agents/platform-manifest.json": JSON.stringify({ templateIds: ["alpha-app"], subsystems: [{ id: "x", keyFiles: ["src/nope.ts"] }] }),
      }),
    );
    expect(errors).toContain('docs/reference/npm-scripts.md: script "test" is not documented');
    expect(errors.some((e) => e.includes("templateIds"))).toBe(true);
    expect(errors.some((e) => e.includes("keyFile src/nope.ts"))).toBe(true);
  });
});
