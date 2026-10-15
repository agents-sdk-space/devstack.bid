"use client";

import { GitBranch } from "lucide-react";
import { useState } from "react";
import { fencedFiles, githubHref, type FencedFile } from "@/lib/auth/github-policy";
import { Button, Dialog, DialogContent, Field, Input, cn } from "@/components/ui";
import { useLang } from "../prefs";

interface Repo {
  fullName: string;
  private: boolean;
  defaultBranch: string;
}

/** Push one fenced code block to a repository the signed-in user can write, or open a PR with all of them (PR-B). */
export function GithubPublish({ text, signedIn }: { text: string; signedIn: boolean }) {
  const files = fencedFiles(text);
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [repo, setRepo] = useState("");
  const [branch, setBranch] = useState("main");
  const [file, setFile] = useState<FencedFile | null>(files[0] ?? null);
  const [path, setPath] = useState(files[0]?.path ?? "");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const [asPr, setAsPr] = useState(false);

  if (files.length === 0) return null;

  const openDialog = () => {
    setFile(files[0]);
    setPath(files[0].path);
    setMessage("");
    setError("");
    setDone(null);
    setOpen(true);
    if (!signedIn) return;
    fetch("/api/github/repos", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<{ repos: Repo[] }>) : { repos: [] }))
      .then((data) => {
        setRepos(data.repos);
        const first = data.repos[0];
        if (first) {
          setRepo(first.fullName);
          setBranch(first.defaultBranch);
        }
      })
      .catch(() => undefined);
  };

  const submit = async () => {
    if (!file || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = asPr
        ? await fetch(`/api/github/pulls?repo=${encodeURIComponent(repo)}&base=${encodeURIComponent(branch)}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ title: message.trim() || `Add ${files.length} file(s) from DevStack`, body: "", files: files.map((f) => ({ path: f.path === file.path ? path : f.path, content: f.code })) }),
          })
        : await fetch("/api/github/contents", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ repo, path, branch, message: message.trim() || `Add ${path}`, content: file.code }),
          });
      const raw = (await res.json().catch(() => ({}))) as { error?: string; url?: string; pr?: { url?: string } };
      const data = { error: raw.error, url: raw.pr?.url ?? raw.url };
      if (!res.ok || !data.url) {
        setError(data.error || t("github.failed"));
        return;
      }
      setDone(githubHref(data.url) ?? data.url);
    } catch {
      setError(t("github.failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {signedIn ? (
        <Button type="button" variant="outline" size="sm" onClick={openDialog}>
          <GitBranch className="h-3.5 w-3.5" aria-hidden /> {t("github.commit")}
        </Button>
      ) : (
        <a href="/api/auth/github?next=/chat" className="focus-ring inline-flex items-center gap-1.5 text-[12.5px] text-link">
          <GitBranch className="h-3.5 w-3.5" aria-hidden /> {t("github.needLogin")}
        </a>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={t("github.commit")} description={t("github.note")} closeLabel={t("nav.close")}>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            {files.length > 1 && (
              <Field label={t("github.file")}>
                {(p) => (
                  <select
                    {...p}
                    className="focus-ring h-10 w-full rounded-md border border-border-strong bg-surface px-3 text-sm"
                    value={path}
                    onChange={(e) => {
                      const next = files.find((f) => f.path === e.target.value) ?? files[0];
                      setFile(next);
                      setPath(next.path);
                    }}
                  >
                    {files.map((f) => (
                      <option key={f.path} value={f.path}>
                        {f.path}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            )}
            <Field label={t("github.repo")} hint={t("github.repoHint")}>
              {(p) => (
                <>
                  <Input {...p} list="gh-repos" value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="owner/repo" required autoComplete="off" />
                  <datalist id="gh-repos">
                    {repos.map((r) => (
                      <option key={r.fullName} value={r.fullName} />
                    ))}
                  </datalist>
                </>
              )}
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("github.path")}>
                {(p) => <Input {...p} value={path} onChange={(e) => setPath(e.target.value)} required />}
              </Field>
              <Field label={t("github.branch")}>
                {(p) => <Input {...p} value={branch} onChange={(e) => setBranch(e.target.value)} required />}
              </Field>
            </div>
            <Field label={t("github.message")}>
              {(p) => <Input {...p} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={`Add ${path}`} />}
            </Field>
            <label className="flex items-center gap-2 text-[13px] text-fg">
              <input type="checkbox" checked={asPr} onChange={(e) => setAsPr(e.target.checked)} className="accent-current" />
              {files.length > 1 ? `Open a pull request with all ${files.length} files (base = branch above)` : "Open a pull request (base = branch above)"}
            </label>
            <pre className={cn("max-h-40 overflow-auto rounded-lg border border-border bg-bg p-3 font-mono text-[12px] leading-relaxed text-muted")}>
              {file?.code}
            </pre>
            {error && (
              <p role="alert" className="text-[13px] text-danger">
                {error}
              </p>
            )}
            {done && githubHref(done) && (
              <p className="text-[13px]">
                <a href={githubHref(done)!} className="link" target="_blank" rel="noopener noreferrer">
                  {t("github.done")}
                </a>
              </p>
            )}
            <div className="flex justify-end">
              <Button type="submit" disabled={busy || !signedIn}>
                {busy ? t("github.saving") : t("github.submit")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
