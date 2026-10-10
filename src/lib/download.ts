import JSZip from "jszip";
import { encodeShare } from "./share";
import { toBash, toPowerShell, toReadme } from "./scripts";
import type { BuilderConfig, BuilderEdits, Lang, ResolvedStep } from "./types";

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(filename: string, text: string, type = "text/plain") {
  downloadBlob(filename, new Blob([text], { type: `${type};charset=utf-8` }));
}

export function shareUrlFor(config: BuilderConfig, edits: BuilderEdits): string {
  return `${window.location.origin}/builder#s=${encodeShare({ config, edits })}`;
}

/** Starter zip: scripts + README + machine-readable stack + every starter file at its path. */
export async function buildStarterZip(steps: ResolvedStep[], config: BuilderConfig, edits: BuilderEdits, lang: Lang): Promise<Blob> {
  const zip = new JSZip();
  const root = zip.folder(`${config.projectName}-starter`)!;
  const shareUrl = shareUrlFor(config, edits);
  root.file("setup.sh", toBash(steps, config, lang), { unixPermissions: 0o755 });
  root.file("setup.ps1", toPowerShell(steps, config, lang));
  root.file("README.md", toReadme(steps, config, lang, shareUrl));
  root.file(
    "nvx-stack.json",
    JSON.stringify({ generator: "NVX Stack Builder", shareUrl, config, steps: steps.map((s) => ({ id: s.id, title: s.title, commands: s.commands, windows: s.windows, verify: s.verify, kind: s.kind })) }, null, 2)
  );
  const files = root.folder("starter-files")!;
  for (const step of steps) for (const f of step.files) files.file(f.path, f.content);
  return zip.generateAsync({ type: "blob", platform: "UNIX" });
}
