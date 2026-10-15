"use client";

import {
  SandpackCodeEditor,
  SandpackLayout,
  SandpackPreview,
  SandpackProvider,
  UnstyledOpenInCodeSandboxButton,
  useSandpack,
  type SandpackTheme,
} from "@codesandbox/sandpack-react";
import { ExternalLink, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { sandboxFiles, themeCss } from "./sandbox-files";

/** Monochrome theme driven by the site's own tokens, so it follows light and dark without a remount. */
const THEME: SandpackTheme = {
  colors: {
    surface1: "var(--nvx-code-bg)",
    surface2: "var(--nvx-code-border)",
    surface3: "var(--nvx-code-border)",
    clickable: "var(--nvx-code-muted)",
    base: "var(--nvx-code-fg)",
    disabled: "var(--nvx-code-muted)",
    hover: "var(--nvx-code-fg)",
    accent: "var(--nvx-code-fg)",
    error: "var(--nvx-danger)",
    errorSurface: "var(--nvx-danger-soft)",
  },
  syntax: {
    plain: "var(--nvx-code-fg)",
    comment: { color: "var(--nvx-code-muted)", fontStyle: "italic" },
    keyword: { color: "var(--nvx-code-fg)", fontWeight: "600" },
    tag: "var(--nvx-code-fg)",
    punctuation: "var(--nvx-code-muted)",
    definition: "var(--nvx-code-fg)",
    property: "var(--nvx-code-fg)",
    static: "var(--nvx-code-muted)",
    string: "var(--nvx-code-muted)",
  },
  font: {
    body: "var(--font-sans), system-ui, sans-serif",
    mono: "var(--font-mono), ui-monospace, monospace",
    size: "13px",
    lineHeight: "20px",
  },
};

const btn =
  "focus-ring inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-code-muted transition-colors hover:bg-white/10 hover:text-code-fg motion-reduce:transition-none";

/** Keeps the hidden theme file in sync with the site theme, without touching the visitor's edits. */
function ThemeSync({ dark }: { dark: boolean }) {
  const { sandpack } = useSandpack();
  const current = sandpack.files["/theme.css"]?.code;
  const { updateFile } = sandpack;
  useEffect(() => {
    const want = themeCss(dark);
    if (current !== want) updateFile("/theme.css", want, true); // also re-applies after Reset; guarded, so no loop
  }, [dark, current, updateFile]);
  return null;
}

function Toolbar({ labels }: { labels: { reset: string; open: string } }) {
  const { sandpack } = useSandpack();
  return (
    <div className="flex items-center justify-end gap-1 border-b border-code-border bg-code-bg px-2 py-1.5">
      <button type="button" className={btn} onClick={() => sandpack.resetAllFiles()}>
        <RotateCcw className="h-3.5 w-3.5" aria-hidden /> {labels.reset}
      </button>
      <UnstyledOpenInCodeSandboxButton className={btn}>
        <ExternalLink className="h-3.5 w-3.5" aria-hidden /> {labels.open}
      </UnstyledOpenInCodeSandboxButton>
    </div>
  );
}

// Stable references: Sandpack re-initialises whenever files/customSetup/options change identity.
const CUSTOM_SETUP = { entry: "/index.js" };
const OPTIONS = { initMode: "user-visible" as const, visibleFiles: ["/src/App.tsx", "/styles.css"], activeFile: "/src/App.tsx" };

export default function LiveEditor({ dark, labels }: { dark: boolean; labels: { reset: string; open: string } }) {
  // Files are fixed at mount (a new object each render would reset the sandbox); ThemeSync handles theme changes.
  const [files] = useState(() => sandboxFiles(dark));
  return (
    <SandpackProvider
      template="react-ts"
      theme={THEME}
      files={files}
      customSetup={CUSTOM_SETUP}
      options={OPTIONS}
    >
      <ThemeSync dark={dark} />
      <Toolbar labels={labels} />
      <SandpackLayout className="nvx-sandpack grid! grid-cols-1! md:grid-cols-2!" style={{ border: 0, borderRadius: 0 }}>
        <SandpackCodeEditor className="h-72! min-w-0! md:h-[24rem]!" showTabs showLineNumbers />
        <SandpackPreview className="h-56! min-w-0! md:h-[24rem]!" showOpenInCodeSandbox={false} showRefreshButton />
      </SandpackLayout>
    </SandpackProvider>
  );
}
