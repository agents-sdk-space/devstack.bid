import type { Metadata } from "next";
import { InfoPage } from "@/components/legal/info-page";

export const metadata: Metadata = { title: "System status", description: "DevStack service status." };

export default function Page() {
  return (
    <InfoPage
      title={{ en: "System status", th: "สถานะระบบ" }}
      intro={{ en: "A live status page is coming soon. If this page loads, the website is up.", th: "หน้าสถานะแบบเรียลไทม์กำลังจะมา ถ้าหน้านี้โหลดได้ แปลว่าเว็บไซต์ทำงานปกติ" }}
      sections={[
        { heading: { en: "Website", th: "เว็บไซต์" }, body: { en: "Served from Cloudflare's global network.", th: "ให้บริการผ่านเครือข่ายทั่วโลกของ Cloudflare" } },
        { heading: { en: "Chat and Studio AI", th: "แชตและ Studio AI" }, body: { en: "When AI is unavailable, the Builder and Studio fall back to offline planners.", th: "เมื่อ AI ใช้งานไม่ได้ Builder และ Studio จะสลับไปใช้ตัววางแผนออฟไลน์" } },
        { heading: { en: "Incidents", th: "เหตุขัดข้อง" }, body: { en: "Incidents will be posted here and on GitHub.", th: "เหตุขัดข้องจะแจ้งไว้ที่นี่และบน GitHub" } },
      ]}
    />
  );
}
