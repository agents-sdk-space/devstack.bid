import { Package, Sparkles, SquareTerminal, type LucideIcon } from "lucide-react";
import type { CSSProperties } from "react";
import { cn } from "@/components/ui/cn";
import type { AddonId, Runtime } from "@/lib/types";
import { BRAND_ICONS, type BrandId } from "./brand-icons.data";

/**
 * Recognisable tool marks (simple-icons data, CC0) rendered as inline SVG, plus "app icon" tiles
 * in the spirit of how Apple Developer presents Xcode / Swift. Logos are trademarks of their owners
 * and are used only to identify the tools (see NOTICE). Generic concepts use lucide line icons.
 */

export type GenericTool = "ai" | "terminal" | "package";
export type ToolId = BrandId | GenericTool;

const GENERIC: Record<GenericTool, { title: string; Icon: LucideIcon }> = {
  ai: { title: "AI", Icon: Sparkles },
  terminal: { title: "Terminal", Icon: SquareTerminal },
  package: { title: "Package", Icon: Package },
};

function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
/** Brands whose official colour is (near) black, e.g. Next.js, Express: drawn in the text colour instead. */
const MONO_BRANDS = new Set(Object.entries(BRAND_ICONS).filter(([, b]) => luminance(b.hex) < 0.03).map(([id]) => id));

export function isBrand(id: string): id is BrandId {
  return id in BRAND_ICONS;
}

export function toolTitle(id: ToolId): string {
  return isBrand(id) ? BRAND_ICONS[id].title : GENERIC[id].title;
}

/** A single mark. `colored` uses the official brand colour (near-black brands use the text colour). */
export function ToolIcon({ id, colored = false, className, title }: { id: ToolId; colored?: boolean; className?: string; title?: string }) {
  if (!isBrand(id)) {
    const { Icon } = GENERIC[id];
    return <Icon className={cn("h-[1em] w-[1em] shrink-0", className)} aria-hidden={title ? undefined : true} aria-label={title} strokeWidth={1.75} />;
  }
  const brand = BRAND_ICONS[id];
  const fill = colored && !MONO_BRANDS.has(id) ? brand.hex : "currentColor";
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("h-[1em] w-[1em] shrink-0", className)}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      fill={fill}
    >
      <path d={brand.path} />
    </svg>
  );
}

const TILE_SIZES = {
  sm: { box: "h-7 w-7 rounded-[8px]", icon: "text-[15px]" },
  md: { box: "h-10 w-10 rounded-[11px]", icon: "text-[21px]" },
  lg: { box: "h-14 w-14 rounded-[15px]", icon: "text-[30px]" },
} as const;

/**
 * App-icon style tile: a rounded square with a soft vertical sheen and a hairline edge, the mark in
 * its official colour. Decorative by default; pass `label` when the tile is the only way the tool
 * is named.
 */
export function ToolTile({ id, size = "md", label, className }: { id: ToolId; size?: keyof typeof TILE_SIZES; label?: string; className?: string }) {
  const s = TILE_SIZES[size];
  const style: CSSProperties | undefined = isBrand(id) ? undefined : { color: "var(--nvx-accent)" };
  return (
    <span
      className={cn("tool-tile inline-grid shrink-0 place-items-center", s.box, className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      title={label}
      style={style}
    >
      <ToolIcon id={id} colored className={s.icon} />
    </span>
  );
}

/* ───────────── Mapping from app data to tools ───────────── */

const TAG_TOOLS: Record<string, ToolId> = {
  "next.js": "next",
  react: "react",
  tailwind: "tailwind",
  "tailwind css": "tailwind",
  typescript: "typescript",
  javascript: "javascript",
  vite: "vite",
  express: "express",
  fastapi: "fastapi",
  streamlit: "streamlit",
  python: "python",
  "node.js": "node",
  npm: "npm",
  "npm publish": "npm",
  npx: "npm",
  pnpm: "pnpm",
  yarn: "yarn",
  nvm: "nvm",
  pypi: "pypi",
  uv: "uv",
  pip: "pypi",
  twine: "pypi",
  docker: "docker",
  "github actions": "githubactions",
  vitest: "vitest",
  eslint: "eslint",
  pytest: "pytest",
  ruff: "ruff",
  pandas: "pandas",
  plotly: "plotly",
  git: "git",
  pydantic: "pydantic",
  openai: "ai",
  ai: "ai",
  cli: "terminal",
};

export function tagTool(tag: string): ToolId | undefined {
  return TAG_TOOLS[tag.trim().toLowerCase()];
}

/** The headline tool for each template (its "app icon"). */
const TEMPLATE_TOOLS: Record<string, ToolId> = {
  "nextjs-dashboard": "next",
  "vite-react-game": "vite",
  "express-api": "express",
  "fastapi-ai": "fastapi",
  "streamlit-dashboard": "streamlit",
  "node-cli-npx": "node",
  "pypi-package": "pypi",
  "collab-workspace": "react",
  "react-admin-tool": "react",
  "nextjs-ai-chat": "ai",
};

export function templateTool(template: { id: string; tags: string[]; runtimes: Runtime[] }): ToolId {
  return TEMPLATE_TOOLS[template.id] ?? template.tags.map(tagTool).find(Boolean) ?? (template.runtimes[0] === "python" ? "python" : "node");
}

const COMMAND_TOOLS: Record<string, ToolId> = {
  npm: "npm",
  npx: "npm",
  pnpm: "pnpm",
  pnpx: "pnpm",
  yarn: "yarn",
  nvm: "nvm",
  node: "node",
  python: "python",
  python3: "python",
  py: "python",
  pip: "pypi",
  pip3: "pypi",
  twine: "pypi",
  uv: "uv",
  uvx: "uv",
  docker: "docker",
  git: "git",
  streamlit: "streamlit",
  uvicorn: "fastapi",
  fastapi: "fastapi",
  pytest: "pytest",
  ruff: "ruff",
  vitest: "vitest",
};

/** Tool behind a step, from the first command that names a known CLI (skips cd/mkdir/source …). */
export function commandTool(commands: string[]): ToolId {
  for (const line of commands) {
    for (const raw of line.split(/&&|\|\||;/)) {
      const words = raw.trim().replace(/^(sudo|env\s+\S+=\S+)\s+/, "").split(/\s+/);
      const bin = (words[0] ?? "").replace(/^\.\/?\S*\//, "").replace(/\.exe$/i, "").toLowerCase();
      if (bin === "python" || bin === "python3" || bin === "py") {
        const mod = words[1] === "-m" ? words[2] : undefined;
        if (mod && COMMAND_TOOLS[mod]) return COMMAND_TOOLS[mod];
      }
      if (COMMAND_TOOLS[bin]) return COMMAND_TOOLS[bin];
    }
  }
  return "terminal";
}

export function addonTool(id: AddonId, runtimes: Runtime[]): ToolId {
  const py = runtimes.length === 1 && runtimes[0] === "python";
  switch (id) {
    case "typescript":
      return "typescript";
    case "tailwind":
      return "tailwind";
    case "eslint":
      return py ? "ruff" : "eslint";
    case "testing":
      return py ? "pytest" : "vitest";
    case "docker":
      return "docker";
    case "ci":
      return "githubactions";
  }
}
