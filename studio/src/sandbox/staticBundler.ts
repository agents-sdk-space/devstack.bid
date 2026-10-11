import { transform } from 'sucrase';
import { isBinaryPath, normalizeProjectPath, PREVIEW_SKIP_RE as SKIP_RE } from './paths';
import type { FileContent } from './types';

/**
 * Static preview bundler (replaces the WebContainers Node runtime).
 *
 * Every JS/JSX/TS/TSX file is compiled in the browser with Sucrase (MIT) into a CommonJS module.
 * The sandboxed preview iframe (public/preview/index.html) gets the module map and runs it with a
 * tiny require() loader. Bare imports resolve only to the vendored runtime (react, react-dom):
 * there is no npm install and no Node process.
 */
export interface PreviewBundle {
  entry: string;
  title: string;
  /** project path -> CommonJS code */
  modules: Record<string, string>;
  /** project path -> CSS text (injected as <style> when imported) */
  css: Record<string, string>;
  /** project path or public URL (e.g. "/assets/x.png") -> data URL */
  assets: Record<string, string>;
}

export interface BundleResult {
  bundle: PreviewBundle | null;
  errors: string[];
  moduleCount: number;
}

/** Bare module ids the preview runtime provides (see src/preview/vendor.ts). */
export const PREVIEW_PACKAGES = ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime'] as const;

const CODE_RE = /\.(m?jsx?|tsx?)$/i;

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  ico: 'image/x-icon',
  svg: 'image/svg+xml',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
};

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function toDataUrl(path: string, content: FileContent): string | null {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const mime = MIME[ext];
  if (!mime) return null;
  if (typeof content === 'string') {
    if (ext === 'svg') return `data:${mime};charset=utf-8,${encodeURIComponent(content)}`;
    return null;
  }
  return `data:${mime};base64,${toBase64(content)}`;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Replace quoted public URLs ("/assets/x.png") and CSS url(/assets/x.png) with data URLs. */
export function inlinePublicUrls(code: string, publicUrls: Record<string, string>): string {
  let out = code;
  for (const [url, dataUrl] of Object.entries(publicUrls)) {
    const u = escapeRe(url);
    out = out
      .replace(new RegExp(`(["'\`])\\.?${u}\\1`, 'g'), (_m, q: string) => `${q}${dataUrl}${q}`)
      .replace(new RegExp(`url\\((["']?)\\.?${u}\\1\\)`, 'g'), () => `url("${dataUrl}")`);
  }
  return out;
}

function findEntry(files: Record<string, FileContent>): string {
  const html = files['index.html'];
  if (typeof html === 'string') {
    const m = /<script[^>]*type=["']module["'][^>]*src=["']\/?([^"']+)["']/i.exec(html);
    if (m?.[1]) {
      const p = normalizeProjectPath(m[1]);
      if (p in files) return p;
    }
  }
  for (const p of ['src/main.jsx', 'src/main.tsx', 'src/main.js', 'src/index.jsx', 'src/index.js']) if (p in files) return p;
  return 'src/main.jsx';
}

function findTitle(files: Record<string, FileContent>): string {
  const html = files['index.html'];
  const m = typeof html === 'string' ? /<title>([^<]{0,120})<\/title>/i.exec(html) : null;
  return m?.[1]?.trim() || 'Preview';
}

export function buildPreviewBundle(input: Record<string, FileContent>): BundleResult {
  const files: Record<string, FileContent> = {};
  for (const [raw, content] of Object.entries(input)) files[normalizeProjectPath(raw)] = content;

  const errors: string[] = [];
  const modules: Record<string, string> = {};
  const css: Record<string, string> = {};
  const assets: Record<string, string> = {};
  const publicUrls: Record<string, string> = {};

  for (const [path, content] of Object.entries(files)) {
    if (SKIP_RE.test(path)) continue;
    const isPublic = path.startsWith('public/');
    if (isBinaryPath(path) || /\.svg$/i.test(path)) {
      const url = toDataUrl(path, content);
      if (!url) continue;
      if (isPublic) publicUrls[`/${path.slice('public/'.length)}`] = url;
      else assets[path] = url;
    }
  }
  Object.assign(assets, publicUrls);

  for (const [path, content] of Object.entries(files)) {
    if (SKIP_RE.test(path) || path.startsWith('public/') || typeof content !== 'string') continue;
    if (/\.css$/i.test(path)) {
      css[path] = inlinePublicUrls(content, publicUrls);
    } else if (/\.json$/i.test(path)) {
      try {
        modules[path] = `module.exports = ${JSON.stringify(JSON.parse(content))};`;
      } catch (err) {
        errors.push(`${path}: invalid JSON (${err instanceof Error ? err.message : String(err)})`);
      }
    } else if (CODE_RE.test(path)) {
      const isTs = /\.tsx?$/i.test(path);
      try {
        const { code } = transform(inlinePublicUrls(content, publicUrls), {
          transforms: isTs ? ['typescript', 'jsx', 'imports'] : ['jsx', 'imports'],
          jsxRuntime: 'automatic',
          production: true,
          filePath: path,
        });
        modules[path] = code;
      } catch (err) {
        errors.push(`${path}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  const entry = findEntry(files);
  if (!(entry in modules) && !errors.some((e) => e.startsWith(`${entry}:`))) errors.push(`entry ${entry} not found`);
  const moduleCount = Object.keys(modules).length;
  if (errors.length) return { bundle: null, errors, moduleCount };
  return { bundle: { entry, title: findTitle(files), modules, css, assets }, errors, moduleCount };
}

export { affectsPreview } from './paths';
