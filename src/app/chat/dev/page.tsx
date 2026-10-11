import type { Metadata } from "next";
import { ChatApp } from "@/components/chat/chat-app";

export const metadata: Metadata = {
  title: "Dev Chat — Image & Research Orchestrator",
  description: "For developers: chat with a multi-agent orchestrator that researches the Agents SDK and DevStack docs, runs code in a sandbox you can watch live, and creates images.",
};

export default function DevChatPage() {
  return <ChatApp channel="dev" />;
}
