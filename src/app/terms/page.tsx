import type { Metadata } from "next";
import { InfoPage } from "@/components/legal/info-page";

export const metadata: Metadata = { title: "Terms of Use", description: "Terms of Use for devstack.bid." };

export default function Page() {
  return (
    <InfoPage
      title={{ en: "Terms of Use", th: "ข้อกำหนดการใช้งาน" }}
      intro={{ en: "By using devstack.bid you agree to these terms.", th: "การใช้ devstack.bid ถือว่าคุณยอมรับข้อกำหนดเหล่านี้" }}
      sections={[
        { heading: { en: "Use of the service", th: "การใช้บริการ" }, body: { en: "Use the site lawfully. Do not abuse rate limits or attempt to disrupt the service.", th: "ใช้เว็บอย่างถูกกฎหมาย ห้ามใช้เกินขีดจำกัดหรือพยายามรบกวนบริการ" } },
        { heading: { en: "Generated content", th: "เนื้อหาที่สร้างขึ้น" }, body: { en: "Commands and code are shown as text. Review them before you run them; you are responsible for what you run.", th: "คำสั่งและโค้ดแสดงเป็นข้อความ ตรวจก่อนรันเสมอ คุณรับผิดชอบสิ่งที่คุณรันเอง" } },
        { heading: { en: "No warranty", th: "ไม่มีการรับประกัน" }, body: { en: "The service is provided as is, without warranty of any kind.", th: "บริการนี้ให้ตามสภาพ โดยไม่มีการรับประกันใดๆ" } },
      ]}
    />
  );
}
