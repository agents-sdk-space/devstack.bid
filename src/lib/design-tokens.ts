/**
 * Token manifest used by the /design style guide and tests. The values live in
 * src/app/tokens.css; this file only names and groups them.
 */
export interface TokenInfo {
  name: string; // CSS variable without the --nvx- prefix
  utility: string; // Tailwind utility that uses it
  en: string;
  th: string;
}

export const COLOR_GROUPS: { id: string; en: string; th: string; tokens: TokenInfo[] }[] = [
  {
    id: "surface",
    en: "Surfaces & text",
    th: "พื้นผิวและข้อความ",
    tokens: [
      { name: "bg", utility: "bg-bg", en: "Page background", th: "พื้นหลังหน้า" },
      { name: "surface", utility: "bg-surface", en: "Cards, inputs", th: "การ์ด ช่องกรอก" },
      { name: "surface-2", utility: "bg-surface-2", en: "Hover, subtle fills", th: "hover พื้นจาง" },
      { name: "surface-3", utility: "bg-surface-3", en: "Pressed, skeleton", th: "กดค้าง skeleton" },
      { name: "raised", utility: "bg-raised", en: "Selected segment / tab", th: "ส่วนที่เลือกใน segmented / แท็บ" },
      { name: "border", utility: "border-border", en: "Default border", th: "เส้นขอบปกติ" },
      { name: "border-strong", utility: "border-border-strong", en: "Inputs, emphasis", th: "ช่องกรอก เน้น" },
      { name: "fg", utility: "text-fg", en: "Primary text", th: "ข้อความหลัก" },
      { name: "muted", utility: "text-muted", en: "Secondary text", th: "ข้อความรอง" },
      { name: "subtle", utility: "text-subtle", en: "Hints, captions", th: "คำใบ้ คำอธิบาย" },
    ],
  },
  {
    id: "brand",
    en: "Brand",
    th: "แบรนด์",
    tokens: [
      { name: "primary", utility: "bg-primary", en: "Filled call-to-action (blue pill)", th: "ปุ่มหลัก (แคปซูลสีฟ้า)" },
      { name: "link", utility: "text-link", en: "Links, active text", th: "ลิงก์ ข้อความที่เลือก" },
      { name: "primary-hover", utility: "hover:bg-primary-hover", en: "Primary hover", th: "ปุ่มหลักตอน hover" },
      { name: "primary-soft", utility: "bg-primary-soft", en: "Selected, soft fills", th: "สถานะเลือก พื้นอ่อน" },
      { name: "primary-soft-fg", utility: "text-primary-soft-fg", en: "Text on soft fill", th: "ข้อความบนพื้นอ่อน" },
      { name: "accent", utility: "text-accent", en: "Icon highlights", th: "สีไฮไลต์ของไอคอน" },
      { name: "ring", utility: "ring-ring", en: "Focus ring", th: "วงโฟกัส" },
    ],
  },
  {
    id: "status",
    en: "Status",
    th: "สถานะ",
    tokens: [
      { name: "success", utility: "text-success", en: "Success", th: "สำเร็จ" },
      { name: "success-soft", utility: "bg-success-soft", en: "Success background", th: "พื้นสำเร็จ" },
      { name: "warning", utility: "text-warning", en: "Warning", th: "เตือน" },
      { name: "warning-soft", utility: "bg-warning-soft", en: "Warning background", th: "พื้นเตือน" },
      { name: "danger", utility: "bg-danger", en: "Destructive / error", th: "อันตราย / ผิดพลาด" },
      { name: "danger-soft", utility: "bg-danger-soft", en: "Error background", th: "พื้นผิดพลาด" },
      { name: "info", utility: "text-info", en: "Info", th: "ข้อมูล" },
      { name: "info-soft", utility: "bg-info-soft", en: "Info background", th: "พื้นข้อมูล" },
      { name: "code-bg", utility: "bg-code-bg", en: "Code windows (always dark)", th: "หน้าต่างโค้ด (มืดเสมอ)" },
      { name: "code-prompt", utility: "text-code-prompt", en: "Shell prompt in code", th: "prompt ในบล็อกโค้ด" },
    ],
  },
];

export const RADII = [
  { name: "sm", value: "6px", utility: "rounded-sm" },
  { name: "md", value: "10px", utility: "rounded-md" },
  { name: "lg", value: "12px", utility: "rounded-lg" },
  { name: "xl", value: "18px", utility: "rounded-xl" },
  { name: "2xl", value: "22px", utility: "rounded-2xl" },
  { name: "full", value: "pill", utility: "rounded-full" },
] as const;

export const SPACING = [1, 2, 3, 4, 6, 8, 12, 16] as const; // × 4px

export const SHADOWS = ["sm", "md", "lg"] as const;

export const TYPE_SCALE = [
  { utility: "text-display", px: 64, en: "Display — hero headline", th: "Display — หัวข้อหลักหน้าแรก" },
  { utility: "text-4xl", px: 36, en: "Page title (h1)", th: "หัวข้อหน้า (h1)" },
  { utility: "text-2xl", px: 24, en: "Section title (h2)", th: "หัวข้อส่วน (h2)" },
  { utility: "text-xl", px: 20, en: "Stage / card group title", th: "หัวข้อขั้นตอน / กลุ่มการ์ด" },
  { utility: "text-base", px: 16, en: "Body, card titles", th: "เนื้อหา หัวข้อการ์ด" },
  { utility: "text-sm", px: 14, en: "UI text, descriptions", th: "ข้อความ UI คำอธิบาย" },
  { utility: "text-xs", px: 12, en: "Captions, badges, hints", th: "คำบรรยาย ป้าย คำใบ้" },
] as const;

export const MOTION = [
  { name: "duration-fast", value: "120ms", en: "Hover, press", th: "hover กด" },
  { name: "duration-base", value: "200ms", en: "Dialogs, fades", th: "หน้าต่าง เฟด" },
  { name: "duration-slow", value: "320ms", en: "Sheets, toasts", th: "แผ่นข้าง toast" },
  { name: "ease-standard", value: "cubic-bezier(0.2, 0, 0, 1)", en: "Most transitions", th: "การเปลี่ยนส่วนใหญ่" },
  { name: "ease-emphasized", value: "cubic-bezier(0.3, 0, 0, 1.2)", en: "Entrances with a little overshoot", th: "การปรากฏที่เด้งเล็กน้อย" },
] as const;
