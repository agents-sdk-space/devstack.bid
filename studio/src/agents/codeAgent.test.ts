import { describe, expect, it } from 'vitest';
import { EventBroker } from '@/broker/eventBroker';
import { MockLLMProvider } from '@/llm/mockProvider';
import { MemoryFs } from '@/sandbox/memoryFs';
import { getInitialSandboxFiles } from '@/sandbox/template';
import { ScriptedLLM } from '@/test/fakes';
import { runCodeAgent, validateGeneratedFiles } from './codeAgent';
import { checkModuleSyntax } from './syntaxCheck';

const GOOD_APP = `import { useState } from 'react';\nimport './App.css';\nexport default function App() {\n  const [n, setN] = useState(0);\n  return <main><h1>Counter</h1><button onClick={() => setN(n + 1)}>{n}</button></main>;\n}\n`;
const input = { intent: 'counter', userPrompt: 'build a counter', schemaSql: '', heroPath: '/assets/hero.png' };

describe('validateGeneratedFiles', () => {
  const existing = Object.keys(getInitialSandboxFiles());

  it('accepts array and map shapes', () => {
    const files = [
      { path: 'src/App.jsx', content: GOOD_APP },
      { path: './src/App.css', content: 'main { color: #8BCAFE; }' },
    ];
    expect(Object.keys(validateGeneratedFiles({ files }, existing))).toEqual(['src/App.jsx', 'src/App.css']);
    expect(Object.keys(validateGeneratedFiles({ files: { 'src/App.jsx': GOOD_APP.replace("import './App.css';\n", '') } }, existing))).toEqual(['src/App.jsx']);
  });

  it.each([
    [{ files: [] }, /No files/],
    [{ files: [{ path: '../evil.js', content: 'x' }] }, /traversal/],
    [{ files: [{ path: 'package.json', content: '{}' }] }, /not allowed/],
    [{ files: [{ path: 'src/main.jsx', content: 'x' }] }, /Protected/],
    [{ files: [{ path: 'src/Other.jsx', content: 'export default 1' }] }, /App.jsx missing/],
    [{ files: [{ path: 'src/App.jsx', content: 'function App() {}' }] }, /default export/],
    [{ files: [{ path: 'src/App.jsx', content: "import axios from 'axios';\nexport default function A() { return null; }" }] }, /unavailable package "axios"/],
    [{ files: [{ path: 'src/App.jsx', content: 'export default function A() { return <div>; }' }] }, /Syntax error/],
    [{ files: [{ path: 'src/App.jsx', content: "import './Missing.css';\nexport default () => null;" }] }, /missing file/],
  ])('rejects %j', (raw, err) => {
    expect(() => validateGeneratedFiles(raw, existing)).toThrow(err);
  });

  it('checks CSS brace balance', () => {
    expect(checkModuleSyntax('a.css', 'a { b: c; }')).toBeNull();
    expect(checkModuleSyntax('a.css', 'a { b: c; ')).toMatch(/unbalanced/);
  });
});

describe('runCodeAgent', () => {
  it('writes the todo template with the mock provider', async () => {
    const fs = new MemoryFs(getInitialSandboxFiles());
    const r = await runCodeAgent(new EventBroker(), fs, new MockLLMProvider(), { ...input, userPrompt: 'build a todo app' });
    expect(r).toMatchObject({ source: 'template', paths: ['src/App.jsx'] });
    expect(await fs.readFile('src/App.jsx')).toContain("sql('SELECT id, title, done FROM todos");
  });

  it('writes validated LLM files and emits code:files-written', async () => {
    const fs = new MemoryFs(getInitialSandboxFiles());
    const broker = new EventBroker();
    const events: unknown[] = [];
    broker.on('code:files-written', (p) => void events.push(p));
    const llm = new ScriptedLLM({
      code: [JSON.stringify({ files: [{ path: 'src/App.jsx', content: GOOD_APP }, { path: 'src/App.css', content: 'h1{}' }] })],
    });
    const r = await runCodeAgent(broker, fs, llm, input);
    expect(r.source).toBe('llm');
    expect(await fs.readFile('src/App.jsx')).toBe(GOOD_APP);
    expect(events).toEqual([{ paths: ['src/App.jsx', 'src/App.css'], source: 'llm' }]);
    expect(llm.calls[0]?.opts?.json).toBe(true);
    expect(llm.calls[0]?.messages[0]?.content).toContain('/assets/hero.png');
  });

  it('repairs invalid output by feeding the error back to the model', async () => {
    const fs = new MemoryFs(getInitialSandboxFiles());
    const llm = new ScriptedLLM({
      code: [
        JSON.stringify({ files: [{ path: 'src/App.jsx', content: 'export default function A() { return <div>; }' }] }),
        '```json\n' + JSON.stringify({ files: [{ path: 'src/App.jsx', content: GOOD_APP.replace("import './App.css';\n", '') }] }) + '\n```',
      ],
    });
    const r = await runCodeAgent(new EventBroker(), fs, llm, input);
    expect(r.source).toBe('llm');
    expect(llm.calls).toHaveLength(2);
    expect(llm.calls[1]?.messages.at(-1)?.content).toMatch(/rejected: Syntax error/);
  });

  it('reports a failure (no silent template) when the model keeps failing, leaving files unchanged', async () => {
    const fs = new MemoryFs(getInitialSandboxFiles());
    const before = await fs.readFile('src/App.jsx');
    const llm = new ScriptedLLM({ code: ['not json', 'still not json'] });
    await expect(runCodeAgent(new EventBroker(), fs, llm, { ...input, userPrompt: 'todo app please' })).rejects.toThrow(/generation failed/);
    expect(await fs.readFile('src/App.jsx')).toBe(before);
  });

  it('does not retry on transport failure', async () => {
    const llm = new ScriptedLLM({ code: ['__THROW__'] });
    await expect(runCodeAgent(new EventBroker(), new MemoryFs(getInitialSandboxFiles()), llm, input)).rejects.toThrow(/generation failed/);
    expect(llm.calls).toHaveLength(1);
  });

  it('system prompt follows the requested design instead of forcing one theme', async () => {
    const { codeSystemPrompt } = await import('./prompts');
    expect(codeSystemPrompt({ schemaSql: '', heroPath: null })).toMatch(/follow the colours, theme/);
  });
});
