import type { StackTemplate } from "@/lib/types";
import { cdProject, createViteApp, pmInstall } from "../common-steps";

const app = `import { Admin, EditGuesser, ListGuesser, Resource, ShowGuesser } from "react-admin";
import jsonServerProvider from "ra-data-json-server";

// Demo REST backend. Point this at your own API (or swap the data provider).
const dataProvider = jsonServerProvider("https://jsonplaceholder.typicode.com");

export default function App() {
  return (
    <Admin dataProvider={dataProvider} title="{{name}}">
      <Resource name="users" list={ListGuesser} edit={EditGuesser} show={ShowGuesser} recordRepresentation="name" />
      <Resource name="posts" list={ListGuesser} edit={EditGuesser} show={ShowGuesser} />
      <Resource name="todos" list={ListGuesser} />
    </Admin>
  );
}
`;

const template: StackTemplate = {
  id: "react-admin-tool",
  name: { en: "Internal Tool (React Admin)", th: "เครื่องมือภายในองค์กร (React Admin)" },
  summary: {
    en: "Vite + react-admin back-office: list/edit/show screens generated from a REST API in minutes.",
    th: "ระบบหลังบ้านด้วย Vite + react-admin: สร้างหน้า list/edit/show จาก REST API ได้ในไม่กี่นาที",
  },
  category: "internal-tool",
  runtimes: ["node"],
  tags: ["React", "react-admin", "Vite", "CRUD", "Internal tool"],
  supportedAddons: ["typescript", "eslint", "testing", "docker", "ci"],
  defaultAddons: ["typescript"],
  defaultName: "nvx-backoffice",
  keywords: ["internal tool", "admin", "back office", "backoffice", "crud", "crm", "inventory", "retool", "หลังบ้าน", "ระบบภายใน", "จัดการข้อมูล", "สต็อก", "ระบบแอดมิน"],
  fileTree: ["{{name}}/", "  src/App.{{jsx}}", "  src/index.css", "  src/main.{{jsx}}", "  package.json"],
  steps: [
    createViteApp,
    cdProject,
    pmInstall,
    {
      id: "ra-deps",
      title: { en: "Install react-admin and a data provider", th: "ติดตั้ง react-admin และ data provider" },
      explanation: { en: "ra-data-json-server talks to any json-server-style REST API.", th: "ra-data-json-server เชื่อมกับ REST API แบบ json-server ได้ทุกตัว" },
      commands: ["{{add}} react-admin ra-data-json-server"],
      expected: { en: "react-admin in dependencies.", th: "react-admin อยู่ใน dependencies" },
      verify: "{{list}} react-admin",
    },
    {
      id: "ra-app",
      title: { en: "Write the admin app", th: "เขียนแอปแอดมิน" },
      explanation: { en: "Guessers inspect the API response and generate screens; replace them with custom components later.", th: "Guesser จะอ่านข้อมูลจาก API แล้วสร้างหน้าจอให้ ภายหลังค่อยเปลี่ยนเป็น component ของคุณเอง" },
      commands: [],
      files: [
        { path: "src/App.{{jsx}}", content: app },
        { path: "src/index.css", content: "body { margin: 0; }\n" },
      ],
      expected: { en: "src/App renders <Admin>.", th: "src/App แสดง <Admin>" },
    },
    {
      id: "dev-server",
      title: { en: "Start the admin", th: "เปิดหน้าแอดมิน" },
      explanation: { en: "Open the URL and browse Users, Posts and Todos.", th: "เปิด URL แล้วดู Users, Posts และ Todos" },
      commands: ["{{run}} dev"],
      kind: "longRunning",
      expected: { en: "http://localhost:5173 shows the react-admin layout.", th: "http://localhost:5173 แสดงหน้าจอ react-admin" },
      verify: "curl -I http://localhost:5173",
    },
    {
      id: "prod-build",
      title: { en: "Build for production", th: "build สำหรับ production" },
      explanation: { en: "Static output in dist/ — host it behind your company SSO.", th: "ได้ไฟล์ static ใน dist/ — วางไว้หลังระบบ SSO ขององค์กร" },
      commands: ["{{run}} build"],
      expected: { en: "dist/ is created.", th: "ได้โฟลเดอร์ dist/" },
      verify: "ls dist",
      verifyWindows: "Get-ChildItem dist",
    },
  ],
  nextSteps: [
    { en: "Add an authProvider for login and roles.", th: "เพิ่ม authProvider สำหรับล็อกอินและสิทธิ์" },
    { en: "Swap to ra-data-simple-rest, Supabase or GraphQL providers for real data.", th: "เปลี่ยนเป็น provider อย่าง ra-data-simple-rest, Supabase หรือ GraphQL สำหรับข้อมูลจริง" },
  ],
  docs: [
    { label: "react-admin tutorial", url: "https://marmelab.com/react-admin/Tutorial.html" },
    { label: "Data providers", url: "https://marmelab.com/react-admin/DataProviderList.html" },
  ],
  docker: { kind: "static", port: 80, cmd: [] },
  ci: ["{{run}} build"],
};

export default template;
