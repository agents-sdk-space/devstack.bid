import type { StackTemplate } from "@/lib/types";
import { cdProject, pmInstall } from "../common-steps";

const index = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{{name}}</title>
    <link rel="stylesheet" href="/style.css" />
  </head>
  <body>
    <header class="nav"><a class="brand" href="#top">{{name}}</a><nav aria-label="Main"><a href="#about">About</a> <a href="#services">Services</a> <a href="#contact">Contact</a></nav></header>
    <main id="top">
      <section class="hero"><h1>{{name}}</h1><p class="lead">Say what you do in one sentence.</p><a class="button" href="#contact">Get in touch</a></section>
      <section id="about"><h2>About us</h2><p>Your story.</p></section>
      <section id="services"><h2>What we offer</h2><p>Your products or services.</p></section>
      <section id="contact"><h2>Contact</h2><p>hello@example.com</p></section>
    </main>
  </body>
</html>
`;

const css = `:root { --primary: #0f766e; --bg: #f8fafc; --fg: #0f172a; }
body { margin: 0; font-family: system-ui, sans-serif; background: var(--bg); color: var(--fg); line-height: 1.6; }
main > section { max-width: 1040px; margin: 0 auto; padding: 64px 24px; }
.nav { display: flex; justify-content: space-between; padding: 14px 24px; }
.button { display: inline-block; padding: 12px 22px; border-radius: 10px; background: var(--primary); color: #fff; text-decoration: none; }
`;

const template: StackTemplate = {
  id: "static-website",
  name: { en: "Website (landing page)", th: "เว็บไซต์ (หน้าแลนดิ้ง)" },
  summary: {
    en: "A fast static website with hero, about, services and contact sections. Vite build, no framework, colours picked from your project.",
    th: "เว็บไซต์ static ที่โหลดเร็ว มีส่วนหัว เกี่ยวกับเรา บริการ และติดต่อ build ด้วย Vite ไม่ใช้ framework และเลือกสีตามโปรเจกต์ของคุณ",
  },
  category: "website",
  runtimes: ["node"],
  tags: ["HTML", "CSS", "Vite", "Static"],
  supportedAddons: ["eslint", "docker", "ci"],
  defaultAddons: [],
  defaultName: "my-website",
  keywords: [
    "website", "web site", "landing page", "landing", "homepage", "home page", "portfolio", "blog", "personal site",
    "เว็บไซต์", "หน้าเว็บ", "ทำเว็บ", "แลนดิ้ง", "หน้าแรก", "บล็อก", "พอร์ต", "ผลงาน",
  ],
  weakKeywords: [
    "shop", "store", "restaurant", "cafe", "coffee", "bakery", "dentist", "clinic", "hospital", "school", "company", "business", "agency",
    "hotel", "salon", "spa", "gym", "wedding", "event",
    "ร้านกาแฟ", "ร้านอาหาร", "ร้านค้า", "คาเฟ่", "คลินิก", "ทันตกรรม", "หมอฟัน", "โรงเรียน", "บริษัท", "ธุรกิจ", "โรงแรม", "ร้านเสริมสวย", "ฟิตเนส", "งานแต่ง", "ขายของ",
  ],
  fileTree: ["{{name}}/", "  index.html", "  main.js", "  public/style.css", "  package.json", "  package-lock.json"],
  steps: [
    {
      id: "create-vite-vanilla",
      title: { en: "Scaffold a plain Vite site", th: "สร้างโปรเจกต์ Vite แบบธรรมดา" },
      explanation: { en: "create-vite with the vanilla template: HTML, CSS and JavaScript, no framework.", th: "create-vite เทมเพลต vanilla: HTML, CSS และ JavaScript ไม่ใช้ framework" },
      commands: ["{{createVite}} {{name}}{{sep}} --template vanilla --no-interactive"],
      expected: { en: "A ./{{name}} folder with index.html and package.json.", th: "ได้โฟลเดอร์ ./{{name}} ที่มี index.html และ package.json" },
      verify: "ls {{name}}/index.html",
      verifyWindows: "Test-Path {{name}}/index.html",
    },
    cdProject,
    pmInstall,
    {
      id: "website-pages",
      title: { en: "Write the landing page", th: "เขียนหน้าแลนดิ้ง" },
      explanation: { en: "Replace the starter page with a landing page and a stylesheet you can recolour.", th: "แทนที่หน้าเริ่มต้นด้วยหน้าแลนดิ้งและไฟล์ CSS ที่เปลี่ยนสีได้" },
      commands: [],
      files: [{ path: "index.html", content: index }, { path: "public/style.css", content: css }],
      expected: { en: "index.html shows the landing page.", th: "index.html แสดงหน้าแลนดิ้ง" },
    },
    {
      id: "prod-build",
      title: { en: "Create a production build", th: "build สำหรับ production" },
      explanation: { en: "Vite writes the static site to dist/.", th: "Vite เขียนเว็บ static ไว้ที่ dist/" },
      commands: ["{{run}} build"],
      expected: { en: "dist/index.html exists.", th: "มีไฟล์ dist/index.html" },
      verify: "ls dist/index.html",
      verifyWindows: "Test-Path dist/index.html",
    },
  ],
  nextSteps: [
    { en: "Edit the text in index.html and the colours in public/style.css.", th: "แก้ข้อความใน index.html และสีใน public/style.css" },
    { en: "Add images to public/ and reference them as /image.jpg.", th: "เพิ่มรูปไว้ใน public/ แล้วอ้างอิงเป็น /image.jpg" },
  ],
  docs: [{ label: "Vite docs", url: "https://vite.dev/guide/" }],
  docker: { kind: "static", port: 80, cmd: [] },
  ci: ["{{run}} build"],
};

export default template;
