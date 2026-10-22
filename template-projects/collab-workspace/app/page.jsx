"use client";

import { useEffect, useRef, useState } from "react";

// Static-hosting version: tabs of this site in the same browser edit one shared note in real time
// (BroadcastChannel + localStorage). Cross-device sync needs a backend such as a Durable Object.
const KEY = "__SLUG__:note";

export default function Workspace() {
  const [text, setText] = useState("");
  const [peers, setPeers] = useState(1);
  const chan = useRef(null);

  useEffect(() => {
    setText(localStorage.getItem(KEY) ?? "# Shared notes\n\nOpen this page in a second tab and type.");
    const c = new BroadcastChannel(KEY);
    chan.current = c;
    const seen = new Map();
    c.onmessage = (e) => {
      if (e.data.type === "text") setText(e.data.text);
      if (e.data.type === "hello") { seen.set(e.data.id, Date.now()); setPeers(1 + seen.size); }
    };
    const id = Math.random().toString(36).slice(2);
    const ping = setInterval(() => {
      c.postMessage({ type: "hello", id });
      for (const [k, t] of seen) if (Date.now() - t > 5000) seen.delete(k);
      setPeers(1 + seen.size);
    }, 2000);
    return () => { clearInterval(ping); c.close(); };
  }, []);

  function edit(v) {
    setText(v);
    localStorage.setItem(KEY, v);
    chan.current?.postMessage({ type: "text", text: v });
  }

  return (
    <main>
      <h1>__TITLE__</h1>
      <p className="muted">__DESCRIPTION__</p>
      <div className="status"><span className="dot" aria-hidden="true" /> {peers} open tab{peers === 1 ? "" : "s"} editing</div>
      <label htmlFor="note" className="muted">Shared note</label>
      <textarea id="note" value={text} onChange={(e) => edit(e.target.value)} />
    </main>
  );
}
