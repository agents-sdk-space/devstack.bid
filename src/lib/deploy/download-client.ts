/** Browser helper: POST files to /api/projects/bundle (shared bundle.ts path) and save the returned zip. */
export async function downloadDeployZip(payload: { name: string; templateId?: string; files: ({ path: string; content: string } | { path: string; base64: string })[] }, base = ""): Promise<string> {
  const r = await fetch(`${base}/api/projects/bundle`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), credentials: "same-origin" });
  if (!r.ok) {
    const b = await r.json().catch(() => ({}));
    throw new Error(`${b.error ?? "Could not build zip"}${b.path ? ` (${b.path})` : ""}`);
  }
  const filename = /filename="([^"]+)"/.exec(r.headers.get("content-disposition") ?? "")?.[1] ?? "deploy.zip";
  const url = URL.createObjectURL(await r.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5_000);
  return filename;
}
