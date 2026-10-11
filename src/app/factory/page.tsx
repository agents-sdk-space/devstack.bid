import type { Metadata } from "next";
import { FactoryApp } from "@/components/factory/factory-app";

export const metadata: Metadata = {
  title: "Sandbox Factory — bring your own OpenAI key",
  description: "Create your own Agents API agent, session and sandbox (OpenAI-hosted or self-hosted) with your own key, then chat with it and watch the sandbox live.",
};

export default function FactoryPage() {
  return <FactoryApp />;
}
