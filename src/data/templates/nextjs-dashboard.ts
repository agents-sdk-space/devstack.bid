import type { StackTemplate } from "@/lib/types";
import { cdProject, createNextApp } from "../common-steps";

const page = `"use client";

import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function Dashboard() {
  const [range, setRange] = useState(7);
  const data = useMemo(
    () => DAYS.slice(0, range).map((day, i) => ({ day, users: 120 + i * 35 + (i % 2) * 40, revenue: 900 + i * 210 })),
    [range]
  );
  const revenue = data.reduce((sum, row) => sum + row.revenue, 0);
  const users = data.reduce((sum, row) => sum + row.users, 0);

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">{{name}} dashboard</h1>
        <label className="text-sm">
          Range{" "}
          <select className="rounded border px-2 py-1" value={range} onChange={(e) => setRange(Number(e.target.value))}>
            <option value={3}>3 days</option>
            <option value={5}>5 days</option>
            <option value={7}>7 days</option>
          </select>
        </label>
      </header>
      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border p-4"><p className="text-sm opacity-70">Revenue</p><p className="text-2xl font-semibold">\${revenue.toLocaleString()}</p></div>
        <div className="rounded-xl border p-4"><p className="text-sm opacity-70">Active users</p><p className="text-2xl font-semibold">{users}</p></div>
        <div className="rounded-xl border p-4"><p className="text-sm opacity-70">Days</p><p className="text-2xl font-semibold">{range}</p></div>
      </section>
      <section className="h-72 rounded-xl border p-4" aria-label="Users chart">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="day" />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey="users" stroke="#6366f1" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </section>
    </main>
  );
}
`;

const template: StackTemplate = {
  id: "nextjs-dashboard",
  name: { en: "Next.js Analytics Dashboard", th: "แดชบอร์ดวิเคราะห์ข้อมูลด้วย Next.js" },
  summary: {
    en: "App Router + Tailwind dashboard with KPI cards and a Recharts line chart.",
    th: "แดชบอร์ด App Router + Tailwind พร้อมการ์ด KPI และกราฟเส้นด้วย Recharts",
  },
  category: "dashboard",
  runtimes: ["node"],
  tags: ["Next.js", "React", "Tailwind", "Recharts", "TypeScript"],
  supportedAddons: ["typescript", "tailwind", "eslint", "testing", "docker", "ci"],
  defaultAddons: ["typescript", "tailwind", "eslint"],
  defaultName: "nvx-dashboard",
  keywords: ["dashboard", "analytics", "chart", "kpi", "admin panel", "report", "แดชบอร์ด", "กราฟ", "รายงาน", "สถิติ", "วิเคราะห์"],
  fileTree: ["{{name}}/", "  src/app/layout.{{nextPage}}", "  src/app/page.{{nextPage}}", "  src/app/globals.css", "  public/", "  package.json", "  next.config.{{ext}}"],
  steps: [
    createNextApp,
    cdProject,
    {
      id: "add-recharts",
      title: { en: "Add the charting library", th: "ติดตั้งไลบรารีกราฟ" },
      explanation: { en: "Recharts renders responsive SVG charts from plain arrays.", th: "Recharts วาดกราฟ SVG แบบ responsive จากข้อมูล array ธรรมดา" },
      commands: ["{{add}} recharts"],
      expected: { en: "recharts appears in package.json dependencies.", th: "recharts อยู่ใน dependencies ของ package.json" },
      verify: "{{list}} recharts",
    },
    {
      id: "dashboard-page",
      title: { en: "Write the dashboard page", th: "เขียนหน้าแดชบอร์ด" },
      explanation: {
        en: "Replace the default home page with a client component that shows KPI cards and a chart.",
        th: "แทนที่หน้าแรกด้วย client component ที่แสดงการ์ด KPI และกราฟ",
      },
      commands: [],
      files: [{ path: "src/app/page.{{nextPage}}", content: page }],
      expected: { en: "src/app/page contains the dashboard.", th: "ไฟล์ src/app/page มีโค้ดแดชบอร์ด" },
    },
    {
      id: "dev-server",
      title: { en: "Start the dev server", th: "เปิด dev server" },
      explanation: { en: "Runs Next.js with hot reload. Keep it running and open the URL.", th: "รัน Next.js แบบ hot reload ปล่อยไว้แล้วเปิด URL ในเบราว์เซอร์" },
      commands: ["{{run}} dev"],
      kind: "longRunning",
      expected: { en: "http://localhost:3000 shows the dashboard.", th: "http://localhost:3000 แสดงแดชบอร์ด" },
      verify: "curl -I http://localhost:3000",
    },
    {
      id: "prod-build",
      title: { en: "Create a production build", th: "build สำหรับ production" },
      explanation: { en: "Type-checks and compiles the optimized production bundle.", th: "ตรวจ type และคอมไพล์ bundle ที่ปรับแต่งสำหรับ production" },
      commands: ["{{run}} build"],
      expected: { en: "Build finishes without errors and creates .next/.", th: "build สำเร็จโดยไม่มี error และได้โฟลเดอร์ .next/" },
      verify: "ls .next",
      verifyWindows: "Test-Path .next",
    },
  ],
  nextSteps: [
    { en: "Fetch real data in a Server Component or Route Handler.", th: "ดึงข้อมูลจริงใน Server Component หรือ Route Handler" },
    { en: "Add authentication (e.g. Auth.js) before exposing private metrics.", th: "เพิ่มระบบล็อกอิน (เช่น Auth.js) ก่อนเปิดเผยข้อมูลภายใน" },
    { en: "Deploy to Vercel: push to GitHub and import the repo.", th: "Deploy ขึ้น Vercel: push ขึ้น GitHub แล้ว import repo" },
  ],
  docs: [
    { label: "Next.js docs", url: "https://nextjs.org/docs" },
    { label: "Recharts", url: "https://recharts.org" },
  ],
  docker: { kind: "node", port: 3000, cmd: ["npm", "start"] },
  ci: ["{{run}} build"],
};

export default template;
