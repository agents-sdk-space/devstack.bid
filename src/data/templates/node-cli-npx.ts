import type { StackTemplate } from "@/lib/types";
import { mkdirAndCd, npmInit } from "../common-steps";

const cli = `#!/usr/bin/env node
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    name: { type: "string", short: "n", default: "world" },
    help: { type: "boolean", short: "h", default: false },
  },
});

if (values.help) {
  console.log("Usage: {{name}} [--name <name>]");
  console.log("  -n, --name   who to greet (default: world)");
  console.log("  -h, --help   show this help");
  process.exit(0);
}

console.log("Hello, " + values.name + "! (from {{name}})");
`;

const readme = `# {{name}}

Run without installing:

    npx {{name}}@latest --name NVX
`;

const template: StackTemplate = {
  id: "node-cli-npx",
  name: { en: "Node CLI Tool (run via npx)", th: "เครื่องมือ CLI ด้วย Node (รันผ่าน npx)" },
  summary: {
    en: "Zero-dependency CLI using node:util parseArgs, wired through package.json \"bin\" and published to npm so anyone can run `npx <name>`.",
    th: "CLI ไม่มี dependency ใช้ node:util parseArgs ตั้งค่าผ่าน \"bin\" ใน package.json และเผยแพร่บน npm ให้ทุกคนรัน `npx <name>` ได้",
  },
  category: "cli",
  runtimes: ["node"],
  tags: ["Node.js", "CLI", "npx", "npm publish"],
  supportedAddons: ["testing", "ci"],
  defaultAddons: [],
  defaultName: "nvx-hello-cli",
  keywords: ["cli", "command line", "terminal", "npx", "npm package", "tool", "คอมมานด์ไลน์", "เทอร์มินัล", "เครื่องมือ"],
  fileTree: ["{{name}}/", "  bin/cli.js", "  package.json", "  README.md"],
  steps: [
    mkdirAndCd,
    npmInit,
    {
      id: "cli-pkg",
      title: { en: "Declare the executable in package.json", th: "ประกาศไฟล์รันใน package.json" },
      explanation: {
        en: "\"bin\" maps the command name to a file; npx and global installs create the command from it. \"files\" limits what gets published.",
        th: "\"bin\" ผูกชื่อคำสั่งกับไฟล์ npx และการติดตั้งแบบ global จะสร้างคำสั่งจากตรงนี้ ส่วน \"files\" จำกัดไฟล์ที่จะเผยแพร่",
      },
      commands: ["npm pkg set type=module 'bin.{{name}}=bin/cli.js' 'files[]=bin' 'engines.node=>=20'"],
      expected: { en: "package.json has bin, files and engines.", th: "package.json มี bin, files และ engines" },
      verify: "npm pkg get bin files",
    },
    {
      id: "cli-code",
      title: { en: "Write the CLI entry file", th: "เขียนไฟล์หลักของ CLI" },
      explanation: { en: "The shebang line lets the OS run the file with Node.", th: "บรรทัด shebang ทำให้ระบบรันไฟล์ด้วย Node ได้" },
      commands: ["chmod +x bin/cli.js"],
      windows: [],
      files: [
        { path: "bin/cli.js", content: cli },
        { path: "README.md", content: readme },
      ],
      osNotes: { en: "chmod is not needed on Windows; npm creates a .cmd shim.", th: "บน Windows ไม่ต้อง chmod เพราะ npm จะสร้างไฟล์ .cmd ให้" },
      expected: { en: "Running the file prints a greeting.", th: "รันไฟล์แล้วแสดงข้อความทักทาย" },
      verify: "node bin/cli.js --name NVX",
    },
    {
      id: "cli-pack",
      title: { en: "Preview the published package", th: "ดูตัวอย่างไฟล์ที่จะเผยแพร่" },
      explanation: { en: "--dry-run lists the tarball contents without creating or uploading anything.", th: "--dry-run แสดงรายการไฟล์ใน tarball โดยไม่สร้างหรืออัปโหลดจริง" },
      commands: ["npm pack --dry-run"],
      expected: { en: "Only package.json, README.md and bin/cli.js are listed.", th: "มีเพียง package.json, README.md และ bin/cli.js" },
    },
    {
      id: "cli-link",
      title: { en: "Try it as a global command", th: "ทดลองใช้เป็นคำสั่ง global" },
      explanation: { en: "npm link symlinks the package globally so you can type the command anywhere. Undo with npm unlink -g {{name}}.", th: "npm link สร้าง symlink แบบ global เพื่อพิมพ์คำสั่งได้ทุกที่ ยกเลิกด้วย npm unlink -g {{name}}" },
      commands: ["npm link"],
      kind: "manual",
      osNotes: { en: "With nvm no sudo is needed. Never use sudo npm with nvm.", th: "ถ้าใช้ nvm ไม่ต้องใช้ sudo และห้ามใช้ sudo npm ร่วมกับ nvm" },
      expected: { en: "`{{name}} --help` works in any folder.", th: "`{{name}} --help` ใช้ได้ทุกโฟลเดอร์" },
      verify: "{{name}} --help",
    },
    {
      id: "npm-publish",
      title: { en: "Publish to npm", th: "เผยแพร่ขึ้น npm" },
      explanation: {
        en: "Log in once, then publish. Package names are global — check availability with `npm view {{name}}` first. Bump versions with `npm version patch`.",
        th: "ล็อกอินครั้งเดียวแล้ว publish ชื่อแพ็กเกจต้องไม่ซ้ำทั้งโลก — ตรวจด้วย `npm view {{name}}` ก่อน และเพิ่มเวอร์ชันด้วย `npm version patch`",
      },
      commands: ["npm login", "npm publish --access public"],
      kind: "publish",
      expected: { en: "https://www.npmjs.com/package/{{name}} is live.", th: "https://www.npmjs.com/package/{{name}} ใช้งานได้" },
      verify: "npx {{name}}@latest --help",
    },
  ],
  nextSteps: [
    { en: "Add colours/prompts with picocolors or @clack/prompts.", th: "เพิ่มสีและ prompt ด้วย picocolors หรือ @clack/prompts" },
    { en: "Publish from CI with npm provenance (npm publish --provenance).", th: "publish จาก CI พร้อม provenance (npm publish --provenance)" },
  ],
  docs: [
    { label: "package.json bin", url: "https://docs.npmjs.com/cli/configuring-npm/package-json#bin" },
    { label: "npm publish", url: "https://docs.npmjs.com/cli/commands/npm-publish" },
    { label: "util.parseArgs", url: "https://nodejs.org/api/util.html#utilparseargsconfig" },
  ],
  ci: ["node bin/cli.js --help"],
};

export default template;
