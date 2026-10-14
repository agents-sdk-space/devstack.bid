import { useSyncExternalStore } from 'react';

/**
 * Studio UI language (Thai / English). Shares the `nvx-lang` localStorage key with the rest of
 * devstack.bid, so the language picked on any page carries over to /studio and back.
 * Agent log lines (CodeAgent (llm) → …) stay English: they are technical output, like a terminal.
 */
export type Lang = 'en' | 'th';
const KEY = 'nvx-lang';

function detect(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'th' || saved === 'en') return saved;
  } catch {
    /* storage blocked */
  }
  return typeof navigator !== 'undefined' && (navigator.language || '').toLowerCase().startsWith('th') ? 'th' : 'en';
}

let current: Lang | null = null;
const listeners = new Set<() => void>();

function get(): Lang {
  if (!current) current = typeof window === 'undefined' ? 'en' : detect();
  return current;
}

export function setLang(lang: Lang): void {
  current = lang;
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    /* ignore */
  }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang;
    document.documentElement.dataset.lang = lang;
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export const STRINGS = {
  'nav.home': { en: 'Home', th: 'หน้าแรก' },
  'nav.chat': { en: 'Chat', th: 'แชต' },
  'nav.docs': { en: 'Docs', th: 'เอกสาร' },
  'nav.guide': { en: 'Studio guide', th: 'คู่มือ Studio' },
  'nav.learn': { en: 'Learn', th: 'เรียนรู้' },
  'brand.tagline': { en: 'Build full-stack apps with AI agents, in your browser', th: 'สร้างแอป full-stack ด้วย AI agent ในเบราว์เซอร์' },
  'lang.toggle': { en: 'ไทย', th: 'EN' },
  'lang.label': { en: 'Switch language to Thai', th: 'เปลี่ยนภาษาเป็นอังกฤษ' },
  'header.assets': { en: 'Assets', th: 'ภาพ' },
  'header.export': { en: 'DEPLOY / EXPORT', th: 'DEPLOY / EXPORT' },
  'chip.quota': { en: 'Free today', th: 'ฟรีวันนี้' },
  'chat.title': { en: 'Agent Core', th: 'Agent Core' },
  'chat.subtitle': { en: 'Orchestrator → Code · DB · Design', th: 'Orchestrator → Code · DB · Design' },
  'chat.welcome': {
    en: 'Studio is ready. Describe an app (try “build a todo app”). CodeAgent writes the code, DBAgent designs tables in PGlite + pgvector, DesignAgent makes artwork. Import Markdown to ground the agents.',
    th: 'Studio พร้อมแล้ว บอกเราว่าอยากได้แอปอะไร (ลอง “build a todo app”) CodeAgent เขียนโค้ด DBAgent ออกแบบตารางใน PGlite + pgvector DesignAgent วาดภาพประกอบ นำเข้า Markdown เพื่อให้ agent รู้บริบทของคุณ',
  },
  'chat.import': { en: 'Import MD', th: 'นำเข้า MD' },
  'chat.demo': { en: 'Demo: build a todo app', th: 'ตัวอย่าง: build a todo app' },
  'chat.placeholder': { en: 'Describe what to build…', th: 'อธิบายสิ่งที่อยากสร้าง…' },
  'chat.run': { en: 'Run', th: 'รัน' },
  'chat.thinking': { en: 'Thinking', th: 'กำลังคิด' },
  'chat.idle': { en: 'Idle', th: 'ว่าง' },
  'assets.title': { en: 'AI Assets', th: 'ภาพจาก AI' },
  'assets.close': { en: 'Close assets', th: 'ปิดแผงภาพ' },
  'assets.prompt': { en: 'Image prompt…', th: 'คำบรรยายภาพ…' },
  'assets.empty': { en: 'No assets yet.', th: 'ยังไม่มีภาพ' },
  'inspector.title': { en: 'Data Inspector', th: 'Data Inspector' },
  'inspector.noRows': { en: 'No rows.', th: 'ไม่มีแถวข้อมูล' },
  'inspector.vectorPlaceholder': { en: 'Semantic query, e.g. “tasks table”', th: 'ค้นหาตามความหมาย เช่น “tasks table”' },
  'inspector.vectorHelp': { en: 'Embeddings: schema docs, prompts and imported vault chunks.', th: 'Embedding: เอกสาร schema, prompt และเนื้อหาที่นำเข้า' },
  'export.title': { en: 'Deploy / Export', th: 'Deploy / Export' },
  'export.subtitle': { en: 'Snapshot the sandbox, database and assets into a deployable bundle.', th: 'รวมโค้ดใน sandbox ฐานข้อมูล และภาพ เป็นไฟล์ zip ที่ deploy ได้' },
  'common.close': { en: 'Close', th: 'ปิด' },
  'preview.static': { en: 'static preview', th: 'พรีวิวแบบ static' },
  'preview.static.hint': {
    en: 'Bundled in your browser with Sucrase and run in a sandboxed iframe. Only react and react-dom can be imported; there is no npm install.',
    th: 'รวมโค้ดในเบราว์เซอร์ด้วย Sucrase แล้วรันใน iframe แบบ sandbox import ได้เฉพาะ react และ react-dom ไม่มี npm install',
  },
  'preview.waiting': { en: 'Preview appears when the bundle is ready', th: 'พรีวิวจะแสดงเมื่อรวมโค้ดเสร็จ' },
  'preview.output': { en: 'Output (bundler + console)', th: 'Output (bundler + console)' },
  'preview.title': { en: 'Sandbox preview', th: 'ตัวอย่างแอปใน sandbox' },
} as const satisfies Record<string, Record<Lang, string>>;

export type StringKey = keyof typeof STRINGS;

export function translate(lang: Lang, key: StringKey): string {
  return STRINGS[key][lang];
}

export function useLang(): { lang: Lang; t: (key: StringKey) => string; setLang: (l: Lang) => void } {
  const lang = useSyncExternalStore(subscribe, get, () => 'en' as Lang);
  return { lang, t: (key) => translate(lang, key), setLang };
}
