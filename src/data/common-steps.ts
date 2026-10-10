import type { StepDef } from "@/lib/types";

/**
 * Reusable steps shared by many templates. Placeholders ({{name}}, {{install}}, ...)
 * are documented in src/lib/placeholders.ts.
 */

export const mkdirAndCd: StepDef = {
  id: "mkdir-cd",
  title: { en: "Create the project folder", th: "สร้างโฟลเดอร์โปรเจกต์" },
  explanation: {
    en: "Create an empty folder for the project and move into it. All following commands run inside it.",
    th: "สร้างโฟลเดอร์ว่างสำหรับโปรเจกต์แล้วเข้าไปในโฟลเดอร์นั้น คำสั่งถัดไปทั้งหมดจะรันในโฟลเดอร์นี้",
  },
  commands: ["mkdir {{name}}", "cd {{name}}"],
  expected: { en: "You are inside ./{{name}}", th: "คุณอยู่ในโฟลเดอร์ ./{{name}} แล้ว" },
  verify: "pwd",
  verifyWindows: "Get-Location",
};

export const cdProject: StepDef = {
  id: "cd-project",
  title: { en: "Enter the project folder", th: "เข้าไปในโฟลเดอร์โปรเจกต์" },
  explanation: {
    en: "The scaffolder created ./{{name}}. Move into it before installing anything else.",
    th: "ตัวสร้างโปรเจกต์ได้สร้างโฟลเดอร์ ./{{name}} แล้ว ให้เข้าไปในโฟลเดอร์ก่อนติดตั้งแพ็กเกจอื่น",
  },
  commands: ["cd {{name}}"],
  expected: { en: "You are inside ./{{name}}", th: "คุณอยู่ในโฟลเดอร์ ./{{name}} แล้ว" },
  verify: "ls package.json",
  verifyWindows: "Test-Path package.json",
};

export const npmInit: StepDef = {
  id: "pm-init",
  title: { en: "Initialise package.json", th: "สร้างไฟล์ package.json" },
  explanation: {
    en: "Create a package.json with default values so you can add dependencies and scripts.",
    th: "สร้าง package.json ด้วยค่าเริ่มต้น เพื่อให้เพิ่ม dependencies และ scripts ได้",
  },
  commands: ["{{init}}"],
  expected: { en: "A package.json file exists.", th: "มีไฟล์ package.json เกิดขึ้น" },
  verify: "node -e \"console.log(require('./package.json').name)\"",
};

export const createNextApp: StepDef = {
  id: "create-next-app",
  title: { en: "Scaffold a Next.js app", th: "สร้างโปรเจกต์ Next.js" },
  explanation: {
    en: "create-next-app generates an App Router project. Flags make it non-interactive and reflect your add-on choices (TypeScript, Tailwind, ESLint).",
    th: "create-next-app จะสร้างโปรเจกต์แบบ App Router ส่วน flags ทำให้ไม่ต้องตอบคำถาม และเลือกตาม add-on ของคุณ (TypeScript, Tailwind, ESLint)",
  },
  commands: ["{{createNext}} {{name}} {{nextFlags}}"],
  osNotes: {
    en: "Requires Node.js 20.9 or newer. On Windows, run in PowerShell or Windows Terminal.",
    th: "ต้องใช้ Node.js 20.9 ขึ้นไป บน Windows ให้รันใน PowerShell หรือ Windows Terminal",
  },
  expected: {
    en: "A ./{{name}} folder with src/app, package.json and installed dependencies.",
    th: "ได้โฟลเดอร์ ./{{name}} ที่มี src/app, package.json และติดตั้ง dependencies แล้ว",
  },
  verify: "ls {{name}}/src/app",
  verifyWindows: "Get-ChildItem {{name}}/src/app",
};

export const createViteApp: StepDef = {
  id: "create-vite",
  title: { en: "Scaffold a Vite + React app", th: "สร้างโปรเจกต์ Vite + React" },
  explanation: {
    en: "create-vite copies the React template. --no-interactive skips prompts; the extra '--' is required by npm to forward flags.",
    th: "create-vite จะคัดลอกเทมเพลต React ส่วน --no-interactive ข้ามคำถาม และ '--' ที่เพิ่มมาจำเป็นสำหรับ npm เพื่อส่ง flags ต่อ",
  },
  commands: ["{{createVite}} {{name}}{{sep}} --template {{viteTemplate}} --no-interactive{{viteLint}}"],
  osNotes: {
    en: "create-vite 9 needs Node.js 20.19+ or 22.12+.",
    th: "create-vite 9 ต้องใช้ Node.js 20.19+ หรือ 22.12+",
  },
  expected: { en: "A ./{{name}} folder with index.html, src/ and package.json.", th: "ได้โฟลเดอร์ ./{{name}} ที่มี index.html, src/ และ package.json" },
  verify: "ls {{name}}/src",
  verifyWindows: "Get-ChildItem {{name}}/src",
};

export const pmInstall: StepDef = {
  id: "pm-install",
  title: { en: "Install dependencies", th: "ติดตั้ง dependencies" },
  explanation: {
    en: "Download every package listed in package.json into node_modules.",
    th: "ดาวน์โหลดแพ็กเกจทั้งหมดใน package.json ลงใน node_modules",
  },
  commands: ["{{install}}"],
  expected: { en: "node_modules/ exists and a lockfile is created.", th: "มีโฟลเดอร์ node_modules/ และไฟล์ lockfile" },
  verify: "ls node_modules",
  verifyWindows: "Test-Path node_modules",
};

export const pyVenv: StepDef = {
  id: "py-venv",
  title: { en: "Create and activate a virtual environment", th: "สร้างและเปิดใช้ virtual environment" },
  explanation: {
    en: "A virtual environment (.venv) keeps this project's Python packages isolated from the system Python.",
    th: "virtual environment (.venv) แยกแพ็กเกจ Python ของโปรเจกต์นี้ออกจาก Python ของระบบ",
  },
  commands: ["{{venv}}", "{{activate}}"],
  windows: ["{{venvWin}}", "{{activateWin}}"],
  osNotes: {
    en: "Debian/Ubuntu may need: sudo apt install python3-venv. On Windows, if activation is blocked run: Set-ExecutionPolicy -Scope CurrentUser RemoteSigned",
    th: "Debian/Ubuntu อาจต้องติดตั้ง: sudo apt install python3-venv บน Windows ถ้าเปิดใช้ไม่ได้ให้รัน: Set-ExecutionPolicy -Scope CurrentUser RemoteSigned",
  },
  expected: { en: "Your prompt shows (.venv) and `python` points inside .venv.", th: "prompt แสดง (.venv) และคำสั่ง `python` ชี้ไปที่ .venv" },
  verify: "python -c \"import sys; print(sys.prefix)\"",
};

export const pyFreeze: StepDef = {
  id: "py-freeze",
  title: { en: "Pin dependencies in requirements.txt", th: "บันทึกเวอร์ชัน dependencies ลง requirements.txt" },
  explanation: {
    en: "Freeze the exact installed versions so teammates, CI and Docker install the same packages.",
    th: "บันทึกเวอร์ชันที่ติดตั้งจริง เพื่อให้เพื่อนร่วมทีม, CI และ Docker ติดตั้งแพ็กเกจชุดเดียวกัน",
  },
  commands: ["{{freeze}}"],
  expected: { en: "requirements.txt lists pinned packages (name==version).", th: "requirements.txt มีรายชื่อแพ็กเกจพร้อมเวอร์ชัน (name==version)" },
  verify: "cat requirements.txt",
  verifyWindows: "Get-Content requirements.txt",
};
