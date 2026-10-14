import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import CssWorker from 'monaco-editor/language/css/css.worker?worker';
import HtmlWorker from 'monaco-editor/language/html/html.worker?worker';
import JsonWorker from 'monaco-editor/language/json/json.worker?worker';
import TsWorker from 'monaco-editor/language/typescript/ts.worker?worker';

// Bundle Monaco locally (no CDN): required under COEP require-corp and for offline use.
self.MonacoEnvironment = {
  getWorker(_id: string, label: string) {
    if (label === 'json') return new JsonWorker();
    if (label === 'css' || label === 'scss' || label === 'less') return new CssWorker();
    if (label === 'html') return new HtmlWorker();
    if (label === 'typescript' || label === 'javascript') return new TsWorker();
    return new EditorWorker();
  },
};

monaco.editor.defineTheme('devstack', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'keyword', foreground: '2997FF' },
    { token: 'string', foreground: 'A5D6FF' },
    { token: 'comment', foreground: '64748B', fontStyle: 'italic' },
  ],
  colors: {
    'editor.background': '#0c0c0d',
    'editor.lineHighlightBackground': '#161617',
    'editorLineNumber.foreground': '#48484C',
    'editorLineNumber.activeForeground': '#2997FF',
    'editorCursor.foreground': '#2997FF',
    'editor.selectionBackground': '#1E293B',
  },
});

monaco.typescript.javascriptDefaults.setCompilerOptions({
  jsx: monaco.typescript.JsxEmit.Preserve,
  allowJs: true,
  allowNonTsExtensions: true,
  target: monaco.typescript.ScriptTarget.ESNext,
  module: monaco.typescript.ModuleKind.ESNext,
});
monaco.typescript.javascriptDefaults.setDiagnosticsOptions({ noSemanticValidation: true });

loader.config({ monaco });

export { monaco };
