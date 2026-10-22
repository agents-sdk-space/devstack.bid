"use client";

import { useState } from "react";

// Static site: there is no server here, so no API key may live in this code.
// Set NEXT_PUBLIC_CHAT_API to your own chat endpoint (for example a Cloudflare Worker that holds the key).
// It receives POST {messages:[{role,content}]} and returns {reply:string}. Without it, the page runs in demo mode.
const API = process.env.NEXT_PUBLIC_CHAT_API || "";

export default function Chat() {
  const [messages, setMessages] = useState([{ role: "assistant", content: "Hi! Ask me anything about __TITLE__." }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    const next = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setBusy(true);
    let reply = `Demo mode: you said "${text}". Set NEXT_PUBLIC_CHAT_API to connect a real model.`;
    if (API) {
      try {
        const r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: next }) });
        const b = await r.json();
        reply = r.ok && typeof b.reply === "string" ? b.reply : `Error ${r.status}`;
      } catch {
        reply = "Network error. Try again.";
      }
    }
    setMessages([...next, { role: "assistant", content: reply }]);
    setBusy(false);
  }

  return (
    <main>
      <h1>__TITLE__</h1>
      <p className="muted">__DESCRIPTION__</p>
      <div className="log" aria-live="polite">
        {messages.map((m, i) => <div key={i} className={`msg ${m.role === "user" ? "me" : "bot"}`}>{m.content}</div>)}
      </div>
      <form onSubmit={send}>
        <label htmlFor="q" className="muted" style={{ position: "absolute", left: -9999 }}>Message</label>
        <input id="q" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type a message" autoComplete="off" />
        <button type="submit" disabled={busy}>{busy ? "..." : "Send"}</button>
      </form>
    </main>
  );
}
