import Editor from '@monaco-editor/react';
import '@/monaco/setup';

function languageFor(path: string): string {
  if (path.endsWith('.json')) return 'json';
  if (path.endsWith('.css')) return 'css';
  if (path.endsWith('.html')) return 'html';
  if (path.endsWith('.ts') || path.endsWith('.tsx')) return 'typescript';
  if (path.endsWith('.md')) return 'markdown';
  return 'javascript';
}

export default function MonacoEditor(props: { path: string; value: string; onChange: (v: string) => void }) {
  return (
    <Editor
      height="100%"
      path={props.path}
      language={languageFor(props.path)}
      theme="devstack"
      value={props.value}
      onChange={(v) => props.onChange(v ?? '')}
      options={{
        fontFamily: '"JetBrains Mono", monospace',
        fontLigatures: true,
        minimap: { enabled: false },
        fontSize: 13,
        padding: { top: 12 },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 2,
      }}
    />
  );
}
