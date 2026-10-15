import type { Metadata } from "next";
import { InfoPage } from "@/components/legal/info-page";

export const metadata: Metadata = { title: "Privacy Policy", description: "Privacy Policy for devstack.bid." };

export default function Page() {
  return (
    <InfoPage
      title={{ en: "Privacy Policy", th: "นโยบายความเป็นส่วนตัว" }}
      intro={{ en: "This page explains what data devstack.bid collects and why.", th: "หน้านี้อธิบายว่า devstack.bid เก็บข้อมูลอะไรและเพราะอะไร" }}
      sections={[
        { heading: { en: "What we collect", th: "ข้อมูลที่เก็บ" }, body: { en: "Account details from GitHub sign-in, chat messages you send, and anonymous usage counters for rate limits.", th: "ข้อมูลบัญชีจากการล็อกอิน GitHub ข้อความแชตที่คุณส่ง และตัวนับการใช้งานแบบไม่ระบุตัวตนเพื่อจำกัดอัตรา" } },
        { heading: { en: "Cookies", th: "คุกกี้" }, body: { en: "Necessary cookies keep you signed in. You can change optional cookies any time via Cookie Preferences in the footer.", th: "คุกกี้ที่จำเป็นใช้เพื่อให้คุณล็อกอินค้างไว้ เปลี่ยนคุกกี้ที่ไม่จำเป็นได้ทุกเมื่อที่การตั้งค่าคุกกี้ท้ายเว็บ" } },
        { heading: { en: "Your choices", th: "สิทธิ์ของคุณ" }, body: { en: "You can ask us to delete your data by opening a request on GitHub.", th: "คุณขอให้ลบข้อมูลได้โดยส่งคำขอบน GitHub" } },
      ]}
    />
  );
}
