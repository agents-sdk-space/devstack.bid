import type { Metadata } from "next";
import { AiSiteBuilder } from "@/components/aisite/ai-site-builder";

export const metadata: Metadata = { title: "Build with AI", description: "Chat with AI to create and edit a website, with live previews on devstack.bid.", robots: { index: false } };

export default function AiBuildPage() {
  return <AiSiteBuilder />;
}
