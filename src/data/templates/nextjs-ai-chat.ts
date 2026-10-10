import type { StackTemplate } from "@/lib/types";
import { cdProject, createNextApp } from "../common-steps";

// ⟨...⟩ marks TypeScript-only syntax; it is removed for JavaScript projects.
const route = `import OpenAI from "openai";

export async function POST(req⟨: Request⟩) {
  if (!process.env.OPENAI_API_KEY) {
    return Response.json({ error: "Set OPENAI_API_KEY in .env.local" }, { status: 503 });
  }
  const { message } = await req.json();
  const client = new OpenAI();
  try {
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-6.1-sol",
      instructions: "You are a concise, friendly assistant.",
      input: String(message ?? "").slice(0, 4000),
    });
    return Response.json({ answer: response.output_text });
  } catch (error) {
    const status = error instanceof OpenAI.APIError && error.status ? error.status : 500;
    return Response.json({ error: "OpenAI request failed (" + status + ")" }, { status: 502 });
  }
}
`;

const page = `"use client";

import { useState } from "react";

export default function Chat() {
  const [messages, setMessages] = useState⟨<{ role: string; text: string }[]>⟩([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    const message = input.trim();
    if (!message || busy) return;
    setInput("");
    setBusy(true);
    setMessages((m) => [...m, { role: "you", text: message }]);
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message }) });
      const data = await res.json();
      setMessages((m) => [...m, { role: "ai", text: data.answer ?? data.error ?? "No answer" }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex h-screen max-w-2xl flex-col gap-4 p-6">
      <h1 className="text-2xl font-bold">{{name}}</h1>
      <ul className="flex-1 space-y-3 overflow-y-auto" aria-live="polite">
        {messages.map((m, i) => (
          <li key={i} className={m.role === "you" ? "text-right" : ""}>
            <span className="inline-block rounded-xl border px-3 py-2 whitespace-pre-wrap">{m.text}</span>
          </li>
        ))}
      </ul>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <label htmlFor="msg" className="sr-only">Message</label>
        <input id="msg" className="flex-1 rounded-xl border px-3 py-2" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask anything..." />
        <button className="rounded-xl border px-4 py-2" disabled={busy}>{busy ? "..." : "Send"}</button>
      </form>
    </main>
  );
}
`;

const template: StackTemplate = {
  id: "nextjs-ai-chat",
  name: { en: "Next.js AI Chat App", th: "แอปแชท AI ด้วย Next.js" },
  summary: {
    en: "Full-stack AI app: chat UI + a Route Handler that calls the OpenAI Responses API with the key kept server-side.",
    th: "แอป AI แบบ full-stack: หน้าแชท + Route Handler ที่เรียก OpenAI Responses API โดยเก็บ key ไว้ฝั่งเซิร์ฟเวอร์",
  },
  category: "ai",
  runtimes: ["node"],
  tags: ["Next.js", "OpenAI", "AI", "Chat", "Full-stack"],
  supportedAddons: ["typescript", "tailwind", "eslint", "testing", "docker", "ci"],
  defaultAddons: ["typescript", "tailwind", "eslint"],
  defaultName: "nvx-ai-chat",
  keywords: ["chat", "chatgpt", "assistant", "ai app", "gpt", "openai", "next.js ai", "full stack", "web app", "แชท", "ผู้ช่วย", "เว็บแอป", "แอป ai"],
  fileTree: ["{{name}}/", "  src/app/page.{{nextPage}}", "  src/app/api/chat/route.{{ext}}", "  .env.local", "  package.json"],
  steps: [
    createNextApp,
    cdProject,
    {
      id: "openai-sdk",
      title: { en: "Install the OpenAI SDK", th: "ติดตั้ง OpenAI SDK" },
      explanation: { en: "Used only on the server inside the Route Handler.", th: "ใช้เฉพาะฝั่งเซิร์ฟเวอร์ใน Route Handler" },
      commands: ["{{add}} openai"],
      expected: { en: "openai in dependencies.", th: "openai อยู่ใน dependencies" },
      verify: "{{list}} openai",
    },
    {
      id: "ai-chat-code",
      title: { en: "Write the chat API and UI", th: "เขียน API และหน้าแชท" },
      explanation: {
        en: "The browser posts to /api/chat; the server calls OpenAI. Put your key in .env.local (git-ignored by create-next-app).",
        th: "เบราว์เซอร์ส่งข้อความไปที่ /api/chat แล้วเซิร์ฟเวอร์เรียก OpenAI ใส่ key ใน .env.local (create-next-app ตั้งให้ git ไม่ติดตามไฟล์นี้)",
      },
      commands: [],
      files: [
        { path: "src/app/api/chat/route.{{ext}}", content: route },
        { path: "src/app/page.{{nextPage}}", content: page },
        { path: ".env.local", content: "OPENAI_API_KEY=\nOPENAI_MODEL=gpt-6.1-sol\n" },
      ],
      expected: { en: "Route and page files exist.", th: "มีไฟล์ route และ page" },
    },
    {
      id: "dev-server",
      title: { en: "Start chatting", th: "เริ่มแชท" },
      explanation: { en: "Add your key to .env.local, restart, and send a message.", th: "ใส่ key ใน .env.local รีสตาร์ท แล้วลองส่งข้อความ" },
      commands: ["{{run}} dev"],
      kind: "longRunning",
      expected: { en: "Replies appear in the chat.", th: "คำตอบแสดงในหน้าแชท" },
      verify: "curl -s -X POST http://localhost:3000/api/chat -H \"Content-Type: application/json\" -d \"{\\\"message\\\":\\\"hi\\\"}\"",
    },
    {
      id: "prod-build",
      title: { en: "Create a production build", th: "build สำหรับ production" },
      explanation: { en: "Make sure everything compiles before deploying.", th: "ตรวจว่าคอมไพล์ผ่านก่อน deploy" },
      commands: ["{{run}} build"],
      expected: { en: "Build succeeds.", th: "build สำเร็จ" },
      verify: "ls .next",
      verifyWindows: "Test-Path .next",
    },
  ],
  nextSteps: [
    { en: "Stream tokens to the UI for a faster feel.", th: "ส่งคำตอบแบบ stream เพื่อให้รู้สึกเร็วขึ้น" },
    { en: "Add rate limiting and auth before deploying publicly.", th: "เพิ่ม rate limit และระบบล็อกอินก่อนเปิดสาธารณะ" },
    { en: "Set OPENAI_API_KEY in your host's environment variables (Vercel → Settings → Environment Variables).", th: "ตั้งค่า OPENAI_API_KEY ใน environment ของโฮสต์ (Vercel → Settings → Environment Variables)" },
  ],
  docs: [
    { label: "OpenAI Node SDK", url: "https://github.com/openai/openai-node" },
    { label: "Route Handlers", url: "https://nextjs.org/docs/app/getting-started/route-handlers" },
  ],
  docker: { kind: "node", port: 3000, cmd: ["npm", "start"] },
  ci: ["{{run}} build"],
};

export default template;
