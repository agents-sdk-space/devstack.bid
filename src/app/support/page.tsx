import type { Metadata } from "next";
import { InfoPage } from "@/components/legal/info-page";

export const metadata: Metadata = { title: "Support", description: "Get help with DevStack." };

export default function Page() {
  return (
    <InfoPage
      title={{ en: "Support", th: "ช่วยเหลือ" }}
      intro={{ en: "Need help with DevStack? Start here.", th: "ต้องการความช่วยเหลือเรื่อง DevStack เริ่มที่นี่" }}
      sections={[
        { heading: { en: "Documentation", th: "เอกสาร" }, body: { en: "Most answers are in the docs at /docs and the guides at /learn.", th: "คำตอบส่วนใหญ่อยู่ในเอกสารที่ /docs และคู่มือที่ /learn" } },
        { heading: { en: "Ask in chat", th: "ถามในแชต" }, body: { en: "Use /chat to ask the assistant about templates, setup and errors.", th: "ใช้ /chat ถามผู้ช่วยเรื่องเทมเพลต การตั้งค่า และข้อผิดพลาด" } },
        { heading: { en: "Report a bug", th: "แจ้งบั๊ก" }, body: { en: "Open an issue on GitHub at agents-sdk-space/devstack.bid.", th: "เปิด issue บน GitHub ที่ agents-sdk-space/devstack.bid" } },
      ]}
    />
  );
}
