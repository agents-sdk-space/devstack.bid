import type { Metadata } from "next";
import { InfoPage } from "@/components/legal/info-page";

export const metadata: Metadata = { title: "Report Security Issues", description: "How to report a security vulnerability in devstack.bid." };

export default function Page() {
  return (
    <InfoPage
      title={{ en: "Report Security Issues", th: "แจ้งปัญหาความปลอดภัย" }}
      intro={{ en: "We take security seriously. Please report vulnerabilities privately.", th: "เราให้ความสำคัญกับความปลอดภัย กรุณาแจ้งช่องโหว่แบบส่วนตัว" }}
      sections={[
        { heading: { en: "How to report", th: "วิธีแจ้ง" }, body: { en: "Use GitHub private vulnerability reporting on agents-sdk-space/devstack.bid (Security → Report a vulnerability). Do not open a public issue.", th: "ใช้การแจ้งช่องโหว่แบบส่วนตัวของ GitHub ที่ agents-sdk-space/devstack.bid (Security → Report a vulnerability) อย่าเปิด issue สาธารณะ" } },
        { heading: { en: "What to include", th: "สิ่งที่ควรแนบ" }, body: { en: "Steps to reproduce, affected URL, and impact. Never include real user data or secrets.", th: "ขั้นตอนทำซ้ำ URL ที่ได้รับผลกระทบ และผลกระทบ ห้ามแนบข้อมูลผู้ใช้จริงหรือข้อมูลลับ" } },
        { heading: { en: "Safe harbor", th: "การคุ้มครอง" }, body: { en: "Good-faith research that avoids harm to users and data will not be pursued.", th: "การวิจัยโดยสุจริตที่ไม่ก่อความเสียหายต่อผู้ใช้และข้อมูลจะไม่ถูกดำเนินการทางกฎหมาย" } },
      ]}
    />
  );
}
