import type { StepDef } from "@/lib/types";

/** Runtime setup steps, prepended automatically based on the template's runtimes. */

export const nvmStep: StepDef = {
  id: "node-nvm",
  title: { en: "Install and select Node.js with nvm", th: "ติดตั้งและเลือกเวอร์ชัน Node.js ด้วย nvm" },
  explanation: {
    en: "nvm lets you install several Node.js versions side by side and switch per project. `nvm use` activates it for this shell.",
    th: "nvm ติดตั้ง Node.js ได้หลายเวอร์ชันพร้อมกันและสลับตามโปรเจกต์ `nvm use` จะเปิดใช้เวอร์ชันนั้นใน shell นี้",
  },
  commands: ["nvm install {{nvm}}", "nvm use {{nvm}}"],
  windows: ["nvm install {{nvmWin}}", "nvm use {{nvmWin}}"],
  requires: "nvm",
  osNotes: {
    en: "macOS/Linux/WSL: install nvm with `curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.8/install.sh | bash`, then reopen the terminal. Windows: use nvm-windows (github.com/coreybutler/nvm-windows) from an elevated terminal, or fnm.",
    th: "macOS/Linux/WSL: ติดตั้ง nvm ด้วย `curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.8/install.sh | bash` แล้วเปิดเทอร์มินัลใหม่ Windows: ใช้ nvm-windows (github.com/coreybutler/nvm-windows) ในเทอร์มินัลแบบ Administrator หรือใช้ fnm",
  },
  expected: { en: "`node -v` prints the selected version.", th: "`node -v` แสดงเวอร์ชันที่เลือก" },
  verify: "node -v && npm -v",
};

export const pnpmStep: StepDef = {
  id: "pm-pnpm",
  title: { en: "Install pnpm", th: "ติดตั้ง pnpm" },
  explanation: { en: "pnpm is a fast, disk-efficient package manager.", th: "pnpm เป็นตัวจัดการแพ็กเกจที่เร็วและประหยัดพื้นที่ดิสก์" },
  commands: ["npm install -g pnpm@latest"],
  expected: { en: "`pnpm -v` prints a version.", th: "`pnpm -v` แสดงหมายเลขเวอร์ชัน" },
  verify: "pnpm -v",
};

export const yarnStep: StepDef = {
  id: "pm-yarn",
  title: { en: "Install Yarn", th: "ติดตั้ง Yarn" },
  explanation: { en: "Installs the yarn command globally for this Node.js version.", th: "ติดตั้งคำสั่ง yarn แบบ global สำหรับ Node.js เวอร์ชันนี้" },
  commands: ["npm install -g yarn"],
  expected: { en: "`yarn -v` prints a version.", th: "`yarn -v` แสดงหมายเลขเวอร์ชัน" },
  verify: "yarn -v",
};

export const pythonCheckStep: StepDef = {
  id: "python-check",
  title: { en: "Check Python {{py}}", th: "ตรวจสอบ Python {{py}}" },
  explanation: {
    en: "Make sure Python 3 is installed. Python {{py}} is recommended for this stack.",
    th: "ตรวจให้แน่ใจว่าติดตั้ง Python 3 แล้ว แนะนำ Python {{py}} สำหรับสแต็กนี้",
  },
  commands: ["python3 --version"],
  windows: ["py -{{py}} --version"],
  osNotes: {
    en: "Install from python.org, `brew install python@{{py}}` (macOS), `sudo apt install python3 python3-venv` (Debian/Ubuntu), or `pyenv install {{py}}`. On Windows the `py` launcher comes with the python.org installer.",
    th: "ติดตั้งจาก python.org, `brew install python@{{py}}` (macOS), `sudo apt install python3 python3-venv` (Debian/Ubuntu) หรือ `pyenv install {{py}}` บน Windows คำสั่ง `py` มากับตัวติดตั้งจาก python.org",
  },
  expected: { en: "Prints Python 3.x.", th: "แสดง Python 3.x" },
  verify: "python3 -c \"import sys; assert sys.version_info >= (3, 9); print(sys.version)\"",
  verifyWindows: "py -{{py}} -c \"import sys; print(sys.version)\"",
};

export const uvInstallStep: StepDef = {
  id: "uv-install",
  title: { en: "Install uv (fast Python package manager)", th: "ติดตั้ง uv (ตัวจัดการแพ็กเกจ Python ที่เร็วมาก)" },
  explanation: {
    en: "uv replaces pip/venv/pyenv with one fast tool. The official installer is shown; review it before running. Skip if `uv --version` already works.",
    th: "uv รวม pip/venv/pyenv ไว้ในเครื่องมือเดียวที่เร็วมาก คำสั่งด้านล่างคือตัวติดตั้งทางการ ควรตรวจสอบก่อนรัน ข้ามได้ถ้า `uv --version` ใช้ได้แล้ว",
  },
  commands: ["curl -LsSf https://astral.sh/uv/install.sh | sh"],
  windows: ['powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"'],
  kind: "manual",
  osNotes: { en: "Alternatives: `brew install uv`, `pipx install uv`, `winget install --id=astral-sh.uv -e`.", th: "ทางเลือกอื่น: `brew install uv`, `pipx install uv`, `winget install --id=astral-sh.uv -e`" },
  expected: { en: "`uv --version` prints a version.", th: "`uv --version` แสดงหมายเลขเวอร์ชัน" },
  verify: "uv --version",
};

export const uvPythonStep: StepDef = {
  id: "uv-python",
  title: { en: "Install Python {{py}} with uv", th: "ติดตั้ง Python {{py}} ด้วย uv" },
  explanation: { en: "uv downloads a managed Python build if it is not already available.", th: "uv จะดาวน์โหลด Python ให้ถ้ายังไม่มีในเครื่อง" },
  commands: ["uv python install {{py}}"],
  requires: "uv",
  expected: { en: "`uv python find {{py}}` prints a path.", th: "`uv python find {{py}}` แสดง path" },
  verify: "uv python find {{py}}",
};
