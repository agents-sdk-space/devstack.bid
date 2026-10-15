import type { Metadata } from "next";
import { InfoPage } from "@/components/legal/info-page";

export const metadata: Metadata = { title: "Careers", description: "Work with devstack." };

export default function Page() {
  return (
    <InfoPage
      title={{ en: "Careers", th: "ร่วมงานกับเรา" }}
      intro={{ en: "We're a small team building tools that help anyone start a project in minutes.", th: "เราเป็นทีมเล็กที่สร้างเครื่องมือช่วยให้ใครก็เริ่มโปรเจกต์ได้ในไม่กี่นาที" }}
      sections={[
        { heading: { en: "Open roles", th: "ตำแหน่งที่เปิดรับ" }, body: { en: "There are no open roles right now. Check back soon.", th: "ตอนนี้ยังไม่มีตำแหน่งที่เปิดรับ แวะกลับมาดูเร็วๆ นี้" } },
        { heading: { en: "Contribute", th: "ร่วมพัฒนา" }, body: { en: "Pull requests on GitHub are the best way to get to know us.", th: "การส่ง pull request บน GitHub เป็นวิธีที่ดีที่สุดในการรู้จักเรา" } },
      ]}
    />
  );
}
