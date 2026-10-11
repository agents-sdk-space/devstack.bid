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
