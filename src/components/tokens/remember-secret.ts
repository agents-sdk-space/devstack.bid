/** Saves a token the user ticked "Remember" for into /settings/environment. Requires sign-in. */
export async function rememberSecret(name: string, value: string, provider?: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch("/api/environment", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, value, provider }) });
    if (r.ok) return { ok: true };
    const b = (await r.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: b.error ?? "Could not remember the key" };
  } catch {
    return { ok: false, error: "Network error" };
  }
}
