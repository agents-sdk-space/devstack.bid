/**
 * Files for the Studio project: a standard Vite + React app. In the Studio it is compiled in the
 * browser (Sucrase) for the static preview; the exported zip runs with `npm install && npm run dev`.
 */

export const SANDBOX_PACKAGE_JSON = `{
  "name": "devstack-app",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite --port 5173 --host 0.0.0.0",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.1.0",
    "react-dom": "^19.1.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.5.0",
    "vite": "^6.3.5"
  }
}
`;

export const SANDBOX_VITE_CONFIG = `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { host: true, port: 5173 },
});
`;

export const SANDBOX_INDEX_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>DEVSTACK App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`;

export const SANDBOX_MAIN = `import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
`;

export const SANDBOX_INDEX_CSS = `:root {
  color-scheme: dark;
  font-family: Inter, system-ui, sans-serif;
  background: #000;
  color: #fff;
}
body { margin: 0; }
* { box-sizing: border-box; }
`;

/**
 * Database bridge for sandbox apps. Inside DEVSTACK the preview iframe talks to the
 * in-browser PGlite database through postMessage; outside DEVSTACK (exported app)
 * \`sql()\` throws so apps can fall back to their own API/storage.
 */
export const SANDBOX_DB_BRIDGE = `const pending = new Map();
let seq = 0;
const inDevstack = typeof window !== 'undefined' && window.parent !== window;

if (inDevstack) {
  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (!msg || msg.type !== 'devstack:sql:result' || !pending.has(msg.id)) return;
    const { resolve, reject, timer } = pending.get(msg.id);
    clearTimeout(timer);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(msg.error));
    else resolve(msg.rows);
  });
}

export const hasDevstackDb = inDevstack;

/** Run one SQL statement against the DEVSTACK database. Returns result rows. */
export function sql(text, params = []) {
  if (!inDevstack) {
    return Promise.reject(new Error('DEVSTACK DB bridge unavailable (app is running outside DEVSTACK)'));
  }
  return new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('DEVSTACK DB bridge timeout'));
    }, 10000);
    pending.set(id, { resolve, reject, timer });
    window.parent.postMessage({ type: 'devstack:sql', id, sql: text, params }, '*');
  });
}
`;

export const TODO_APP_JSX = `import { useEffect, useState } from 'react';
import { sql } from './devstackDb.js';

const LOCAL_KEY = 'devstack-todos';

export default function App() {
  const [items, setItems] = useState([]);
  const [text, setText] = useState('');
  const [mode, setMode] = useState('loading');

  useEffect(() => {
    sql('SELECT id, title, done FROM todos ORDER BY id')
      .then((rows) => {
        setItems(rows);
        setMode('db');
      })
      .catch(() => {
        setItems(JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '[]'));
        setMode('local');
      });
  }, []);

  useEffect(() => {
    if (mode === 'local') localStorage.setItem(LOCAL_KEY, JSON.stringify(items));
  }, [items, mode]);

  async function addTodo(e) {
    e.preventDefault();
    const title = text.trim();
    if (!title) return;
    setText('');
    if (mode === 'db') {
      const [row] = await sql('INSERT INTO todos (title) VALUES ($1) RETURNING id, title, done', [title]);
      setItems((prev) => [...prev, row]);
    } else {
      setItems((prev) => [...prev, { id: Date.now(), title, done: false }]);
    }
  }

  async function toggle(todo) {
    if (mode === 'db') await sql('UPDATE todos SET done = NOT done WHERE id = $1', [todo.id]);
    setItems((prev) => prev.map((x) => (x.id === todo.id ? { ...x, done: !x.done } : x)));
  }

  return (
    <main style={{ minHeight: '100vh', padding: 32, maxWidth: 560, margin: '0 auto' }}>
      <img src="/assets/todo-hero.png" alt="" style={{ width: '100%', borderRadius: 8, border: '1px solid #2A2A2D' }} />
      <h1 style={{ color: '#2997FF', letterSpacing: '-0.03em' }}>Todo</h1>
      <p style={{ color: '#98989D', fontSize: 12 }}>Storage: {mode === 'db' ? 'DEVSTACK PGlite (todos table)' : mode}</p>
      <form onSubmit={addTodo} style={{ display: 'flex', gap: 8 }}>
        <input
          aria-label="New todo"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What needs doing?"
          style={{ flex: 1, padding: 8, background: '#161617', color: '#fff', border: '1px solid #2A2A2D', borderRadius: 6 }}
        />
        <button type="submit" style={{ padding: '8px 14px', background: '#0071E3', color: '#fff', border: 0, borderRadius: 6 }}>
          Add
        </button>
      </form>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {items.map((t) => (
          <li key={t.id} style={{ display: 'flex', gap: 8, padding: '8px 0', borderBottom: '1px solid #1E293B' }}>
            <input type="checkbox" checked={t.done} onChange={() => toggle(t)} />
            <span style={{ textDecoration: t.done ? 'line-through' : 'none' }}>{t.title}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
`;

export const WELCOME_APP_JSX = `export default function App() {
  return (
    <main style={{ minHeight: '100vh', padding: 32 }}>
      <h1 style={{ color: '#2997FF', letterSpacing: '-0.03em' }}>DEVSTACK Sandbox</h1>
      <p style={{ color: '#98989D' }}>Ask the agent to build something, e.g. “build a todo app”.</p>
    </main>
  );
}
`;

export const GENERIC_APP_JSX = (intent: string) => `export default function App() {
  return (
    <main style={{ minHeight: '100vh', padding: 32 }}>
      <h1 style={{ color: '#2997FF' }}>DEVSTACK App</h1>
      <p style={{ color: '#98989D' }}>Generated for: ${intent.replace(/[`$\\{}<>]/g, '')}</p>
    </main>
  );
}
`;

/** Scaffold files that agents never overwrite (dependency set is fixed for the sandbox). */
export function scaffoldFiles(): Record<string, string> {
  return {
    'package.json': SANDBOX_PACKAGE_JSON,
    'vite.config.js': SANDBOX_VITE_CONFIG,
    'index.html': SANDBOX_INDEX_HTML,
    'src/main.jsx': SANDBOX_MAIN,
    'src/index.css': SANDBOX_INDEX_CSS,
    'src/devstackDb.js': SANDBOX_DB_BRIDGE,
  };
}

export function getInitialSandboxFiles(): Record<string, string> {
  return { ...scaffoldFiles(), 'src/App.jsx': WELCOME_APP_JSX };
}

export const TODO_APP_FILES: Record<string, string> = {
  'src/App.jsx': TODO_APP_JSX,
};
