import { Parser } from 'acorn';
import jsx from 'acorn-jsx';

const JsxParser = Parser.extend(jsx());

/** Parse JS/JSX as an ES module. Returns an error string or null when valid. */
export function checkModuleSyntax(path: string, code: string): string | null {
  if (/\.(jsx|js|mjs)$/.test(path)) {
    try {
      JsxParser.parse(code, { ecmaVersion: 'latest', sourceType: 'module' });
      return null;
    } catch (err) {
      return `${path}: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  if (path.endsWith('.css')) {
    let depth = 0;
    for (const ch of code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(["'])(?:\\.|(?!\1).)*\1/g, '')) {
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      if (depth < 0) return `${path}: unbalanced "}"`;
    }
    return depth === 0 ? null : `${path}: unbalanced "{"`;
  }
  return null;
}

function dirname(p: string): string {
  const i = p.lastIndexOf('/');
  return i < 0 ? '' : p.slice(0, i);
}

function join(dir: string, rel: string): string {
  const parts = dir ? dir.split('/') : [];
  for (const seg of rel.split('/')) {
    if (seg === '.' || !seg) continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/');
}

/** Verify every relative import resolves to a file that will exist. */
export function checkRelativeImports(files: Record<string, string>, existing: Iterable<string>): string | null {
  const all = new Set([...existing, ...Object.keys(files)]);
  for (const [path, content] of Object.entries(files)) {
    for (const m of content.matchAll(/(?:^|\n)\s*import\s+(?:[^'"]+\s+from\s+)?['"](\.{1,2}\/[^'"]+)['"]/g)) {
      const target = join(dirname(path), m[1] as string);
      const candidates = [target, `${target}.jsx`, `${target}.js`, `${target}/index.jsx`, `${target}/index.js`];
      if (!candidates.some((c) => all.has(c))) return `${path} imports missing file "${m[1]}"`;
    }
  }
  return null;
}
