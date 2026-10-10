import type { StackTemplate } from "@/lib/types";
import { mkdirAndCd, npmInit } from "../common-steps";

const server = `import express from "express";
import cors from "cors";

export const app = express();
app.use(cors());
app.use(express.json());

let nextId = 1;
const todos = [];

app.get("/health", (_req, res) => res.json({ ok: true, service: "{{name}}" }));

app.get("/api/todos", (_req, res) => res.json(todos));

app.post("/api/todos", (req, res) => {
  const title = String(req.body?.title ?? "").trim();
  if (!title) return res.status(400).json({ error: "title is required" });
  const todo = { id: nextId++, title, done: false };
  todos.push(todo);
  res.status(201).json(todo);
});

app.patch("/api/todos/:id", (req, res) => {
  const todo = todos.find((t) => t.id === Number(req.params.id));
  if (!todo) return res.status(404).json({ error: "not found" });
  if (typeof req.body?.done === "boolean") todo.done = req.body.done;
  res.json(todo);
});

app.delete("/api/todos/:id", (req, res) => {
  const index = todos.findIndex((t) => t.id === Number(req.params.id));
  if (index === -1) return res.status(404).json({ error: "not found" });
  todos.splice(index, 1);
  res.status(204).end();
});

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => console.log("API ready on http://localhost:" + port));
}
`;

const template: StackTemplate = {
  id: "express-api",
  name: { en: "Express REST API", th: "REST API ด้วย Express" },
  summary: {
    en: "Minimal Express 5 JSON API with CORS, a health check and in-memory CRUD routes; uses Node's built-in --watch.",
    th: "JSON API ด้วย Express 5 พร้อม CORS, health check และ CRUD แบบเก็บในหน่วยความจำ ใช้ --watch ที่มากับ Node",
  },
  category: "api",
  runtimes: ["node"],
  tags: ["Node.js", "Express", "REST", "API"],
  supportedAddons: ["testing", "docker", "ci"],
  defaultAddons: [],
  defaultName: "nvx-api",
  keywords: ["api", "rest", "backend", "server", "express", "endpoint", "crud", "หลังบ้าน", "เซิร์ฟเวอร์", "แบ็กเอนด์", "เอพีไอ"],
  fileTree: ["{{name}}/", "  src/index.js", "  package.json"],
  steps: [
    mkdirAndCd,
    npmInit,
    {
      id: "express-deps",
      title: { en: "Install Express and CORS", th: "ติดตั้ง Express และ CORS" },
      explanation: { en: "express handles routing; cors lets browsers on other origins call the API.", th: "express จัดการ routing ส่วน cors อนุญาตให้เว็บจาก origin อื่นเรียก API ได้" },
      commands: ["{{add}} express cors"],
      expected: { en: "express and cors in dependencies.", th: "express และ cors อยู่ใน dependencies" },
      verify: "{{list}} express",
    },
    {
      id: "express-scripts",
      title: { en: "Configure ES modules and scripts", th: "ตั้งค่า ES modules และ scripts" },
      explanation: {
        en: "npm pkg set edits package.json safely: enable import syntax and add dev/start scripts (node --watch restarts on save).",
        th: "npm pkg set แก้ไข package.json อย่างปลอดภัย: เปิดใช้ import และเพิ่ม scripts dev/start (node --watch รีสตาร์ทเมื่อบันทึกไฟล์)",
      },
      commands: ["npm pkg set type=module 'scripts.dev=node --watch src/index.js' 'scripts.start=node src/index.js'"],
      expected: { en: "package.json has \"type\": \"module\" and dev/start scripts.", th: "package.json มี \"type\": \"module\" และ scripts dev/start" },
      verify: "npm pkg get type scripts",
    },
    {
      id: "express-server",
      title: { en: "Write the API server", th: "เขียนเซิร์ฟเวอร์ API" },
      explanation: { en: "Routes: GET /health, and CRUD on /api/todos.", th: "เส้นทาง: GET /health และ CRUD ที่ /api/todos" },
      commands: [],
      files: [{ path: "src/index.js", content: server }],
      expected: { en: "src/index.js exists.", th: "มีไฟล์ src/index.js" },
      verify: "node --check src/index.js",
    },
    {
      id: "dev-server",
      title: { en: "Run the API", th: "รัน API" },
      explanation: { en: "Starts the server on port 3000 and restarts on file changes.", th: "เปิดเซิร์ฟเวอร์ที่พอร์ต 3000 และรีสตาร์ทเมื่อไฟล์เปลี่ยน" },
      commands: ["{{run}} dev"],
      kind: "longRunning",
      expected: { en: "Console prints: API ready on http://localhost:3000", th: "คอนโซลแสดง: API ready on http://localhost:3000" },
      verify: "curl http://localhost:3000/health",
    },
  ],
  nextSteps: [
    { en: "Replace the in-memory array with PostgreSQL (e.g. via Prisma or Drizzle).", th: "เปลี่ยนจาก array ในหน่วยความจำเป็น PostgreSQL (เช่น Prisma หรือ Drizzle)" },
    { en: "Validate request bodies with zod.", th: "ตรวจสอบข้อมูล request ด้วย zod" },
    { en: "Add rate limiting and helmet before going public.", th: "เพิ่ม rate limiting และ helmet ก่อนเปิดใช้งานจริง" },
  ],
  docs: [
    { label: "Express", url: "https://expressjs.com" },
    { label: "npm pkg", url: "https://docs.npmjs.com/cli/commands/npm-pkg" },
  ],
  docker: { kind: "node", port: 3000, cmd: ["node", "src/index.js"] },
  ci: ["node --check src/index.js"],
};

export default template;
