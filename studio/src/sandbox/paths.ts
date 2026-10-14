/** Normalize a project-relative path and reject traversal / absolute paths. */
export function normalizeProjectPath(path: string): string {
  const p = path.replace(/\\/g, '/').replace(/^\.?\/+/, '');
  const parts: string[] = [];
  for (const seg of p.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') throw new Error(`Path traversal not allowed: ${path}`);
    parts.push(seg);
  }
  if (!parts.length) throw new Error(`Empty path: ${path}`);
  return parts.join('/');
}

export function isBinaryPath(path: string): boolean {
  return /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|wasm|zip)$/i.test(path);
}

/** Files the static preview never bundles (configs, tests, manifests, build output). */
export const PREVIEW_SKIP_RE = /(^|\/)(node_modules|dist|\.git)\/|^vite\.config\.|\.(test|spec)\.[jt]sx?$|^package(-lock)?\.json$/;

/** Paths whose change should trigger a preview rebuild. */
export function affectsPreview(path: string): boolean {
  if (PREVIEW_SKIP_RE.test(path)) return false;
  return path === 'index.html' || path.startsWith('src/') || path.startsWith('public/');
}
