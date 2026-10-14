import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { AgentKind } from '@/broker/events';
import { TerminalSignature } from '@/brand/terminal-signature';
import { useDevstack, useRuntime } from '@/context/hooks';
import { useLang } from '@/i18n';

const AGENTS: { kind: AgentKind; label: string }[] = [
  { kind: 'orchestrator', label: 'Core' },
  { kind: 'code', label: 'Code' },
  { kind: 'db', label: 'DB' },
  { kind: 'design', label: 'Design' },
];

export function AgentChat() {
  const rt = useRuntime();
  const { t } = useLang();
  const messages = useDevstack((s) => s.messages);
  const thinking = useDevstack((s) => s.thinking);
  const thinkingAgent = useDevstack((s) => s.thinkingAgent);
  const activeAgents = useDevstack((s) => s.activeAgents);
  const [input, setInput] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  const submit = (text: string) => {
    const prompt = text.trim();
    if (!prompt || thinking) return;
    setInput('');
    void rt.sendPrompt(prompt);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit(input);
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit(input);
    }
  };

  return (
    <aside className="panel flex h-full w-[320px] shrink-0 flex-col overflow-hidden" data-testid="agent-chat">
      <header className="panel-header flex items-center justify-between px-4 py-3">
        <div>
          <h2 className="font-display text-sm font-semibold tracking-display text-white">{t('chat.title')}</h2>
          <p className="text-[11px] text-devstack-muted">{t('chat.subtitle')}</p>
        </div>
        <span
          data-testid="thinking-indicator"
          data-active={thinking}
          className={`h-2.5 w-2.5 rounded-full ${thinking ? 'neon-pulse bg-devstack-accent' : 'bg-devstack-secondary'}`}
          title={thinking ? `${t('chat.thinking')} (${thinkingAgent ?? 'orchestrator'})` : t('chat.idle')}
        />
      </header>
      <div className="flex gap-1 border-b border-devstack-border px-3 py-2">
        {AGENTS.map((a) => {
          const active = thinking && activeAgents.includes(a.kind);
          return (
            <span
              key={a.kind}
              className={`rounded border px-2 py-0.5 font-mono text-[10px] ${
                active
                  ? 'neon-pulse border-devstack-accent text-devstack-accent'
                  : 'border-devstack-border text-devstack-muted'
              }`}
            >
              {a.label}
            </span>
          );
        })}
      </div>

      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-3" data-testid="chat-messages">
        {messages.length <= 1 ? (
          <div className="mx-auto w-48 pb-1 pt-2" data-testid="studio-signature">
            <TerminalSignature />
          </div>
        ) : null}
        {messages.map((m) => (
          <div
            key={m.id}
            data-role={m.role}
            className={`rounded-md border px-3 py-2 text-[13px] ${
              m.role === 'user'
                ? 'border-devstack-accent/40 bg-devstack-surface-alt'
                : m.role === 'system'
                  ? 'border-devstack-border bg-black/40 text-devstack-muted'
                  : 'border-devstack-border bg-devstack-surface-alt'
            }`}
          >
            <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-devstack-muted">{m.role}</p>
            <p className="whitespace-pre-wrap break-words leading-relaxed">{m.id === 'welcome' ? t('chat.welcome') : m.content}</p>
          </div>
        ))}
      </div>

      <div className="space-y-2 border-t border-devstack-border p-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded border border-devstack-border px-2 py-1 text-xs text-devstack-muted hover:border-devstack-accent hover:text-white"
          >
            {t('chat.import')}
          </button>
          <button
            type="button"
            disabled={thinking}
            onClick={() => submit('build a todo app')}
            className="btn-ai flex-1 px-3 py-1 text-xs font-medium"
          >
            {t('chat.demo')}
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".md,.markdown,text/markdown,text/plain"
          className="hidden"
          data-testid="vault-input"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            await rt.importMarkdown(file.name, await file.text());
            e.target.value = '';
          }}
        />
        <form onSubmit={onSubmit} className="flex items-end gap-2">
          <textarea
            data-testid="prompt-input"
            value={input}
            rows={2}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            placeholder={t('chat.placeholder')}
            className="max-h-32 flex-1 resize-none rounded-md border border-devstack-border bg-black px-3 py-2 text-sm text-white outline-none placeholder:text-devstack-muted/60 focus:border-devstack-accent focus:shadow-accent-glow"
          />
          <button
            type="submit"
            data-testid="prompt-submit"
            disabled={thinking || !input.trim()}
            className="btn-ai px-4 py-2 text-sm font-semibold"
          >
            {t('chat.run')}
          </button>
        </form>
      </div>
    </aside>
  );
}
