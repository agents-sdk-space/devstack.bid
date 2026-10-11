import { lazy, Suspense, useMemo } from "react";
import { useDevstack, useRuntime } from "@/context/hooks";

const MonacoEditor = lazy(() => import("./MonacoEditor"));

export function EditorPanel() {
  const rt = useRuntime();
  const files = useDevstack((s) => s.files);
  const binaryFiles = useDevstack((s) => s.binaryFiles);
  const assets = useDevstack((s) => s.assets);
  const activeFile = useDevstack((s) => s.activeFile);
  const paths = useMemo(
    () => [...Object.keys(files), ...binaryFiles].sort(),
    [files, binaryFiles],
  );
  const content = files[activeFile] ?? "";
  const activeImage = binaryFiles.includes(activeFile)
    ? assets.find((a) => a.path === activeFile)
    : undefined;

  return (
    <section
      className="panel flex min-h-0 flex-1 overflow-hidden"
      data-testid="editor-panel"
    >
      <nav className="flex w-48 shrink-0 flex-col border-r border-devstack-border">
        <p className="panel-header px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-devstack-muted">
          Files
        </p>
        <ul className="flex-1 overflow-y-auto py-1" data-testid="file-list">
          {paths.map((p) => (
            <li key={p}>
              <button
                type="button"
                data-path={p}
                onClick={() => rt.setActiveFile(p)}
                className={`block w-full truncate px-3 py-1 text-left font-mono text-[11px] ${
                  p === activeFile
                    ? "bg-devstack-secondary text-devstack-accent"
                    : "text-devstack-muted hover:text-white"
                }`}
                title={p}
              >
                {p}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="panel-header flex items-center justify-between px-3 py-2">
          <span
            className="font-mono text-xs text-devstack-accent"
            data-testid="active-file"
          >
            {activeFile}
          </span>
          <span className="text-[10px] text-devstack-muted">
            edits hot-reload in the sandbox
          </span>
        </div>
        <div className="min-h-0 flex-1">
          {binaryFiles.includes(activeFile) ? (
            <div
              className="flex h-full items-center justify-center overflow-auto bg-black p-4"
              data-testid="binary-preview"
            >
              {activeImage ? (
                <img
                  src={activeImage.dataUrl}
                  alt={activeFile}
                  className="max-h-full max-w-full rounded border border-devstack-border"
                />
              ) : (
                <p className="font-mono text-xs text-devstack-muted">
                  Binary file
                </p>
              )}
            </div>
          ) : (
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center font-mono text-sm text-devstack-muted">
                  Loading editor…
                </div>
              }
            >
              <MonacoEditor
                path={activeFile}
                value={content}
                onChange={(v) => void rt.updateFile(activeFile, v)}
              />
            </Suspense>
          )}
        </div>
      </div>
    </section>
  );
}
