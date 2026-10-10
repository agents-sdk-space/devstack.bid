import type { Metadata } from "next";
import { DesignSystem } from "@/components/design-system";

export const metadata: Metadata = {
  title: "Design system",
  description: "NVX UI — design tokens and accessible components, documented live in Thai and English.",
};

export default function DesignPage() {
  return <DesignSystem />;
}
