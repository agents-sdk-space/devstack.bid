/**
 * Cursor prompt deeplinks for general users.
 * https://cursor.com/docs/integrations/deeplinks
 * Web form: https://cursor.com/link/prompt?text=...
 * Cursor shows the prompt and waits for the person to confirm. It does not run on its own.
 */

import type { Lang } from "./types";

export const CURSOR_DOWNLOAD_URL = "https://cursor.com/download";
export const CURSOR_PROMPT_URL = "https://cursor.com/link/prompt";

/** Stay under Cursor's 10,000-character deeplink limit after encoding. */
const MAX_URL_LENGTH = 9000;
const MAX_QUESTION = 800;

const CREATE: Record<Lang, string> = {
  en: `You are helping a general user of DevStack (https://devstack.bid). They chose "Create with Cursor" on the learn page.

Help them start a project:
1. Ask what they want to build, in plain language.
2. Point them to a matching Stack Template at https://devstack.bid/templates or the planner at https://devstack.bid/builder#agent.
3. Treat setup commands as text they review. The DevStack server does not run commands.
4. When they are ready, walk them through downloading setup.sh or setup.ps1 and reading it before they run it on their own computer.`,
  th: `คุณกำลังช่วยผู้ใช้ทั่วไปของ DevStack (https://devstack.bid) เขาเลือก "สร้างด้วย Cursor" จากหน้าเรียนรู้

ช่วยเขาเริ่มโปรเจกต์:
1. ถามว่าอยากสร้างอะไร เป็นภาษาที่เข้าใจง่าย
2. ชี้ไปที่ Stack Template ที่ตรงกันที่ https://devstack.bid/templates หรือตัววางแผนที่ https://devstack.bid/builder#agent
3. คำสั่งตั้งค่าเป็นข้อความที่เขาต้องอ่านเอง เซิร์ฟเวอร์ของ DevStack ไม่รันคำสั่ง
4. เมื่อเขาพร้อมแล้ว พาเขาดาวน์โหลด setup.sh หรือ setup.ps1 แล้วอ่านก่อนรันบนเครื่องของเขาเอง`,
};

const ASK_INTRO: Record<Lang, string> = {
  en: `A general user of DevStack (https://devstack.bid) asked Cursor the question below. Answer in the same language they used, in plain language. Setup commands are text. The DevStack server does not run them.

Question:
`,
  th: `ผู้ใช้ทั่วไปของ DevStack (https://devstack.bid) ถาม Cursor ตามข้อความด้านล่าง ตอบภาษาเดียวกับที่เขาใช้ และใช้ภาษาที่เข้าใจง่าย คำสั่งตั้งค่าเป็นข้อความ เซิร์ฟเวอร์ของ DevStack ไม่รันคำสั่ง

คำถาม:
`,
};

export function createPrompt(lang: Lang): string {
  return CREATE[lang];
}

export function askPrompt(lang: Lang, question: string): string {
  const q = question.trim().slice(0, MAX_QUESTION);
  return `${ASK_INTRO[lang]}${q}`;
}

function buildPromptUrl(text: string): string {
  const url = new URL(CURSOR_PROMPT_URL);
  url.searchParams.set("text", text);
  return url.toString();
}

/** A cursor.com prompt link. Trims the text if the encoded URL would be too long. */
export function cursorPromptUrl(text: string): string {
  let body = text.trim();
  let url = buildPromptUrl(body);
  while (url.length > MAX_URL_LENGTH && body.length > 40) {
    body = body.slice(0, Math.floor(body.length * 0.8)).trim();
    url = buildPromptUrl(body);
  }
  return url;
}
