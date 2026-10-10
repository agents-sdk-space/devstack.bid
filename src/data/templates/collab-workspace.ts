import type { StackTemplate } from "@/lib/types";
import { cdProject, createNextApp } from "../common-steps";

const page = `"use client";

import { useEffect, useState } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";

// One shared document per browser tab. Every tab connected to the same room sees the same text.
const doc = new Y.Doc();
const shared = doc.getText("notes");

export default function Workspace() {
  const [text, setText] = useState("");
  const [status, setStatus] = useState("connecting");
  const [peers, setPeers] = useState(1);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_YJS_URL || "ws://localhost:1234";
    const provider = new WebsocketProvider(url, "{{name}}-room", doc);
    const onText = () => setText(shared.toString());
    const onPeers = () => setPeers(provider.awareness.getStates().size);
    provider.on("status", (event) => setStatus(event.status));
    provider.awareness.on("change", onPeers);
    shared.observe(onText);
    onText();
    return () => {
      shared.unobserve(onText);
      provider.awareness.off("change", onPeers);
      provider.destroy();
    };
  }, []);

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-8">
      <h1 className="text-3xl font-bold">{{name}}</h1>
      <p className="text-sm" aria-live="polite">
        Status: <strong>{status}</strong> - people here: <strong>{peers}</strong>
      </p>
      <label htmlFor="notes" className="block font-medium">Shared notes (open this page in two windows)</label>
      <textarea
        id="notes"
        className="h-80 w-full rounded-xl border p-4 font-mono"
        value={text}
        onChange={(e) => {
          const value = e.target.value;
          doc.transact(() => {
            shared.delete(0, shared.length);
            shared.insert(0, value);
          });
        }}
      />
    </main>
  );
}
`;

const template: StackTemplate = {
  id: "collab-workspace",
  name: { en: "Realtime Collaborative Workspace", th: "พื้นที่ทำงานร่วมกันแบบเรียลไทม์" },
  summary: {
    en: "Next.js + Yjs CRDT + y-websocket: shared notes that sync live between browsers, with presence count.",
    th: "Next.js + Yjs (CRDT) + y-websocket: โน้ตที่ซิงก์สดระหว่างเบราว์เซอร์ พร้อมแสดงจำนวนคนที่ออนไลน์",
  },
  category: "collab",
  runtimes: ["node"],
  tags: ["Next.js", "Yjs", "WebSocket", "CRDT", "Realtime"],
  supportedAddons: ["typescript", "tailwind", "eslint", "testing", "docker", "ci"],
  defaultAddons: ["typescript", "tailwind", "eslint"],
  defaultName: "nvx-workspace",
  keywords: ["collaborative", "realtime", "real-time", "multiplayer", "websocket", "yjs", "shared", "notion", "whiteboard", "chat room", "ทำงานร่วมกัน", "เรียลไทม์", "แชร์", "ห้องแชท", "พร้อมกัน"],
  fileTree: ["{{name}}/", "  src/app/page.{{nextPage}}", "  package.json (scripts: dev, ws)", "  .env.local"],
  steps: [
    createNextApp,
    cdProject,
    {
      id: "yjs-deps",
      title: { en: "Install Yjs and the WebSocket provider + server", th: "ติดตั้ง Yjs, WebSocket provider และเซิร์ฟเวอร์" },
      explanation: {
        en: "yjs is the CRDT, y-websocket is the browser provider, @y/websocket-server is the small sync server (y-websocket v3 no longer ships it). It is pinned to 0.1.1, the last release compatible with Yjs 13 (newer ones require the Yjs 14 pre-release).",
        th: "yjs คือ CRDT, y-websocket คือ provider ฝั่งเบราว์เซอร์ และ @y/websocket-server คือเซิร์ฟเวอร์ซิงก์ (y-websocket v3 ไม่มีเซิร์ฟเวอร์ในตัวแล้ว) ล็อกเวอร์ชันไว้ที่ 0.1.1 ซึ่งเป็นรุ่นล่าสุดที่ใช้กับ Yjs 13 ได้ (รุ่นใหม่กว่าต้องใช้ Yjs 14 รุ่นทดสอบ)",
      },
      commands: ["{{add}} yjs y-websocket", "{{addDev}} @y/websocket-server@0.1.1"],
      expected: { en: "Packages listed in package.json.", th: "แพ็กเกจอยู่ใน package.json" },
      verify: "{{list}} yjs",
    },
    {
      id: "yjs-script",
      title: { en: "Add a script for the sync server", th: "เพิ่ม script สำหรับเซิร์ฟเวอร์ซิงก์" },
      explanation: { en: "The server listens on localhost:1234 by default (override with HOST / PORT env vars).", th: "เซิร์ฟเวอร์ฟังที่ localhost:1234 เป็นค่าเริ่มต้น (เปลี่ยนได้ด้วยตัวแปร HOST / PORT)" },
      commands: ["npm pkg set 'scripts.ws=y-websocket'"],
      files: [{ path: ".env.local", content: "NEXT_PUBLIC_YJS_URL=ws://localhost:1234\n" }],
      expected: { en: "`ws` script exists in package.json.", th: "มี script `ws` ใน package.json" },
      verify: "npm pkg get scripts.ws",
    },
    {
      id: "yjs-page",
      title: { en: "Write the collaborative page", th: "เขียนหน้าที่ทำงานร่วมกันได้" },
      explanation: { en: "A textarea bound to a Y.Text; awareness tracks who is connected.", th: "textarea ผูกกับ Y.Text และ awareness ติดตามว่าใครเชื่อมต่ออยู่" },
      commands: [],
      files: [{ path: "src/app/page.{{nextPage}}", content: page }],
      expected: { en: "src/app/page contains the workspace.", th: "src/app/page มีโค้ดพื้นที่ทำงาน" },
    },
    {
      id: "ws-server",
      title: { en: "Terminal 1: start the sync server", th: "เทอร์มินัล 1: เปิดเซิร์ฟเวอร์ซิงก์" },
      explanation: { en: "Keep this running.", th: "เปิดค้างไว้" },
      commands: ["{{run}} ws"],
      kind: "longRunning",
      expected: { en: "Prints: running at 'localhost' on port 1234", th: "แสดง: running at 'localhost' on port 1234" },
    },
    {
      id: "dev-server",
      title: { en: "Terminal 2: start Next.js", th: "เทอร์มินัล 2: เปิด Next.js" },
      explanation: { en: "Open http://localhost:3000 in two windows and type — text syncs instantly.", th: "เปิด http://localhost:3000 สองหน้าต่างแล้วพิมพ์ — ข้อความจะซิงก์ทันที" },
      commands: ["{{run}} dev"],
      kind: "longRunning",
      expected: { en: "Status shows connected and people here: 2.", th: "สถานะแสดง connected และจำนวนคน 2" },
      verify: "curl -I http://localhost:3000",
    },
  ],
  nextSteps: [
    { en: "Swap the textarea for a rich editor binding (y-prosemirror, y-codemirror, TipTap).", th: "เปลี่ยน textarea เป็น rich editor (y-prosemirror, y-codemirror, TipTap)" },
    { en: "Persist documents (YPERSISTENCE=./db) and add auth to the WebSocket server.", th: "บันทึกเอกสาร (YPERSISTENCE=./db) และเพิ่มการยืนยันตัวตนให้เซิร์ฟเวอร์ WebSocket" },
    { en: "Host the sync server on Fly.io/Render, or use a managed service (Liveblocks, PartyKit).", th: "โฮสต์เซิร์ฟเวอร์ซิงก์บน Fly.io/Render หรือใช้บริการสำเร็จรูป (Liveblocks, PartyKit)" },
  ],
  docs: [
    { label: "Yjs docs", url: "https://docs.yjs.dev" },
    { label: "@y/websocket-server", url: "https://github.com/yjs/y-websocket-server" },
  ],
  docker: { kind: "node", port: 3000, cmd: ["npm", "start"] },
  ci: ["{{run}} build"],
};

export default template;
