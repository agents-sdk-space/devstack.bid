import { describe, expect, it } from 'vitest';
import { Store } from './store';
import { TerminalBuffer } from './terminalBuffer';

describe('Store', () => {
  it('merges patches and notifies subscribers', () => {
    const s = new Store({ a: 1, b: 'x' });
    let n = 0;
    const off = s.subscribe(() => n++);
    s.setState({ a: 2 });
    s.setState((st) => ({ b: `${st.b}y` }));
    off();
    s.setState({ a: 3 });
    expect(s.getState()).toEqual({ a: 3, b: 'xy' });
    expect(n).toBe(2);
  });
});

describe('TerminalBuffer', () => {
  it('normalizes newlines, caps size and strips ANSI for plain text', () => {
    const t = new TerminalBuffer(20);
    const seen: string[] = [];
    t.subscribe((c) => seen.push(c));
    t.write('\x1b[32mhello\x1b[0m\n');
    t.write('0123456789012345');
    expect(seen[0]).toBe('\x1b[32mhello\x1b[0m\r\n');
    expect(t.replay()).toBe('0123456789012345');
    expect(new TerminalBuffer().plainText()).toBe('');
    const u = new TerminalBuffer();
    u.write('\x1b[1;1Hready\r\n');
    expect(u.plainText()).toBe('ready\r\n');
  });
});
