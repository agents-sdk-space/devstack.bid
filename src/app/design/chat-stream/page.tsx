"use client";

import { useEffect, useState } from "react";
import { ThoughtChain } from "@/components/chat/thought-chain";
import { StreamText } from "@/components/chat/stream-text";
import type { Activity } from "@/lib/chat/events";

const DEMO_MD = `Here is a **streaming** reply with a list:

- Grapheme-safe Thai: สวัสดีครับ
- Monochrome caret while pending
- Markdown throttled for stable code blocks

\`\`\`ts
export function hello(name: string) {
  return \`Hi, \${name}\`;
}
\`\`\`
`;

const ACTIVITIES: Activity[] = [
  { id: "1", kind: "search", label: "Web search", detail: "Agents SDK handoffs", status: "done", at: 1 },
  { id: "2", kind: "tool", label: "Docs lookup", detail: "devstack.bid chat UI", status: "done", at: 2 },
  { id: "3", kind: "note", label: "Drafting reply", status: "running", at: 3 },
];

/** Design-only preview for streaming chat UI (not linked in nav). */
export default function ChatStreamDesignPage() {
  const [text, setText] = useState("");
  const [pending, setPending] = useState(true);
  const [activities, setActivities] = useState(ACTIVITIES);

  useEffect(() => {
    let i = 0;
    const id = window.setInterval(() => {
      i += 3;
      setText(DEMO_MD.slice(0, i));
      if (i >= DEMO_MD.length) {
        window.clearInterval(id);
        setPending(false);
        setActivities((a) => a.map((x) => (x.id === "3" ? { ...x, status: "done" as const } : x)));
      }
    }, 40);
    return () => window.clearInterval(id);
  }, []);

  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="mb-2 text-lg font-semibold">Chat stream preview</h1>
      <p className="mb-8 text-sm text-muted">Design reference only — simulates SSE deltas on /chat.</p>
      <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
        <ThoughtChain activities={activities} pending={pending} />
        <StreamText text={text} streaming={pending} />
      </div>
    </main>
  );
}
