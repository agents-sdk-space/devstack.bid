/**
 * Core types for NVX Stack Builder.
 * Templates are plain data (see src/data/templates). Commands may contain
 * placeholders such as {{name}}, {{install}}, {{run}} which are resolved by
 * the composer (src/lib/composer.ts) for the user's chosen package managers.
 */

export type Lang = "en" | "th";

/** A bilingual string. Always provide both languages. */
export interface L10n {
  en: string;
  th: string;
}

export type Runtime = "node" | "python";
export type JsPm = "npm" | "pnpm" | "yarn";
export type PyPm = "pip" | "uv";
export type NodeVersion = "lts" | "24" | "22" | "20";
export type PythonVersion = "3.13" | "3.12" | "3.11";

export const ADDON_IDS = ["typescript", "tailwind", "eslint", "testing", "docker", "ci"] as const;
export type AddonId = (typeof ADDON_IDS)[number];

export type Category =
  | "dashboard"
  | "game"
  | "api"
  | "ai"
  | "data"
  | "cli"
  | "package"
  | "collab"
  | "internal-tool"
  | "web-app"
  | "website";

/**
 * Step kinds:
 * - setup:        safe to run unattended in setup.sh / setup.ps1
 * - longRunning:  starts a dev server (commented out in scripts, run manually)
 * - publish:      publishes to a public registry (always commented out in scripts)
 * - manual:       needs a human decision / installer (commented out in scripts)
 */
export type StepKind = "setup" | "longRunning" | "publish" | "manual";

export interface StarterFile {
  path: string;
  content: string;
}

export interface StepDef {
  /** Stable id. Steps with the same id are de-duplicated. */
  id: string;
  title: L10n;
  explanation: L10n;
  /** POSIX shell commands (bash/zsh on Linux/macOS/WSL). Placeholders allowed. */
  commands: string[];
  /** PowerShell override. If omitted, commands are auto-adapted. */
  windows?: string[];
  /** Files this step writes (rendered as heredocs in setup.sh / here-strings in setup.ps1). */
  files?: StarterFile[];
  osNotes?: L10n;
  expected: L10n;
  /** Command that proves the step worked. */
  verify?: string;
  verifyWindows?: string;
  kind?: StepKind;
  /** A command/function that must exist (e.g. "nvm"); scripts skip the step with a warning otherwise. */
  requires?: string;
  /** Only include when add-ons match, e.g. { testing: true }. */
  when?: Partial<Record<AddonId, boolean>>;
}

export interface StackTemplate {
  id: string;
  name: L10n;
  summary: L10n;
  category: Category;
  runtimes: Runtime[];
  tags: string[];
  /** Add-ons that make sense for this template. */
  supportedAddons: AddonId[];
  defaultAddons: AddonId[];
  defaultName: string;
  /** Keywords (EN + TH) used by the rule-based fallback planner. */
  keywords: string[];
  /** Weak hints (business types like "coffee shop", "clinic"): together worth at most 1 point, so app-type keywords win. */
  weakKeywords?: string[];
  /** Approximate file tree after the steps run. */
  fileTree: string[];
  steps: StepDef[];
  nextSteps: L10n[];
  /** Official docs links shown on the template page. */
  docs: { label: string; url: string }[];
  /** Used by the Docker add-on. */
  docker?: {
    kind: "node" | "static" | "python";
    port: number;
    /** Container start command (exec form). */
    cmd: string[];
  };
  /** Commands the CI add-on runs after installing dependencies (placeholders allowed). */
  ci?: string[];
}

export interface BuilderConfig {
  templateId: string;
  projectName: string;
  node: NodeVersion;
  python: PythonVersion;
  jsPm: JsPm;
  pyPm: PyPm;
  addons: AddonId[];
}

export type StepSource = "runtime" | "template" | "addon" | "custom";

/** A step with all placeholders resolved, ready to display or export. */
export interface ResolvedStep {
  id: string;
  title: L10n;
  explanation: L10n;
  commands: string[];
  windows: string[];
  files: StarterFile[];
  osNotes?: L10n;
  expected: L10n;
  verify?: string;
  verifyWindows?: string;
  kind: StepKind;
  requires?: string;
  source: StepSource;
}

/** User edits applied on top of the composed steps. */
export interface BuilderEdits {
  order: string[];
  removed: string[];
  custom: ResolvedStep[];
}
