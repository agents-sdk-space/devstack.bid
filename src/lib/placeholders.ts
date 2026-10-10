import type { AddonId, BuilderConfig, StackTemplate } from "./types";

/**
 * Placeholder reference (use inside template commands, files and texts):
 *
 * {{name}}        project folder / package name     {{pkg}}        Python import name (dashes -> _)
 * {{nvm}}         nvm arg: --lts or 22                {{nvmWin}}     nvm-windows arg: lts or 22
 * {{py}}          Python version, e.g. 3.12          {{pm}}         npm | pnpm | yarn
 * {{install}}     install all deps                   {{add}}        add a dependency
 * {{addDev}}      add a dev dependency               {{run}}        run a package.json script
 * {{list}}        show an installed package          {{init}}       create package.json
 * {{dlx}}         run a one-off package              {{createNext}} create-next-app launcher
 * {{createVite}}  create-vite launcher               {{sep}}        " --" for npm, "" otherwise
 * {{nextFlags}}   create-next-app flags from add-ons {{viteTemplate}} react-ts | react
 * {{viteLint}}    " --eslint" when ESLint is on      {{ext}} ts|js  {{jsx}} tsx|jsx  {{nextPage}} tsx|js
 * {{venv}} / {{venvWin}}           create .venv      {{activate}} / {{activateWin}} activate .venv
 * {{pip}}         install Python packages            {{freeze}}     write requirements.txt
 * {{ciInstall}}   lockfile install for CI
 *
 * TypeScript-only syntax in starter files is wrapped in ⟨ ⟩ and removed for JS projects.
 */

export type PlaceholderContext = Record<string, string>;

const NAME_FALLBACK = "my-app";

/** Make a safe, npm/PyPI-compatible project name (lowercase, a-z 0-9 - _ .). */
export function sanitizeProjectName(input: string | undefined, fallback = NAME_FALLBACK): string {
  const cleaned = (input ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[-._]+|[-._]+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 50)
    .replace(/[-._]+$/g, "");
  return cleaned || fallback;
}

/** Whether an add-on is both selected and supported by the template. */
export function addonOn(config: BuilderConfig, template: StackTemplate, id: AddonId): boolean {
  return config.addons.includes(id) && template.supportedAddons.includes(id);
}

const PM = {
  npm: {
    install: "npm install",
    add: "npm install",
    addDev: "npm install -D",
    run: "npm run",
    list: "npm ls",
    init: "npm init -y",
    dlx: "npx",
    createNext: "npx create-next-app@latest",
    createVite: "npm create vite@latest",
    sep: " --",
    ciInstall: "npm ci",
  },
  pnpm: {
    install: "pnpm install",
    add: "pnpm add",
    addDev: "pnpm add -D",
    run: "pnpm",
    list: "pnpm list",
    init: "pnpm init",
    dlx: "pnpm dlx",
    createNext: "pnpm create next-app@latest",
    createVite: "pnpm create vite@latest",
    sep: "",
    ciInstall: "pnpm install --frozen-lockfile",
  },
  yarn: {
    install: "yarn install",
    add: "yarn add",
    addDev: "yarn add -D",
    run: "yarn",
    list: "yarn why",
    init: "yarn init -y",
    dlx: "npx",
    createNext: "yarn create next-app",
    createVite: "yarn create vite",
    sep: "",
    ciInstall: "yarn install --frozen-lockfile",
  },
} as const;

export function buildContext(config: BuilderConfig, template: StackTemplate): PlaceholderContext {
  const name = sanitizeProjectName(config.projectName, template.defaultName);
  const ts = addonOn(config, template, "typescript");
  const tailwind = addonOn(config, template, "tailwind");
  const eslint = addonOn(config, template, "eslint");
  const py = config.python;
  const pip = config.pyPm === "pip";
  const nextFlags = [
    ts ? "--ts" : "--js",
    tailwind ? "--tailwind" : "--no-tailwind",
    eslint ? "--eslint" : "--no-linter",
    "--app",
    "--src-dir",
    '--import-alias "@/*"',
    `--use-${config.jsPm}`,
    "--yes",
  ].join(" ");

  return {
    name,
    pkg: name.replace(/[-.]/g, "_"),
    nvm: config.node === "lts" ? "--lts" : config.node,
    nvmWin: config.node === "lts" ? "lts" : config.node,
    py,
    pm: config.jsPm,
    ...PM[config.jsPm],
    nextFlags,
    viteTemplate: ts ? "react-ts" : "react",
    viteLint: eslint ? " --eslint" : "",
    ext: ts ? "ts" : "js",
    jsx: ts ? "tsx" : "jsx",
    nextPage: ts ? "tsx" : "js",
    ts: ts ? "1" : "",
    venv: pip ? "python3 -m venv .venv" : `uv venv --python ${py}`,
    venvWin: pip ? `py -${py} -m venv .venv` : `uv venv --python ${py}`,
    activate: "source .venv/bin/activate",
    activateWin: ".\\.venv\\Scripts\\Activate.ps1",
    pip: pip ? "python -m pip install" : "uv pip install",
    freeze: pip ? "python -m pip freeze > requirements.txt" : "uv pip freeze > requirements.txt",
  };
}

/** Resolve {{placeholders}} and ⟨TypeScript-only⟩ markers. Unknown placeholders are left untouched. */
export function resolveText(text: string, ctx: PlaceholderContext): string {
  const withTs = text.replace(/⟨([^⟩]*)⟩/g, (_m, inner: string) => (ctx.ts ? inner : ""));
  return withTs.replace(/\{\{([a-zA-Z]+)\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(ctx, key) ? ctx[key] : match
  );
}
