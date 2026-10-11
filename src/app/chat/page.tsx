import type { Metadata } from "next";
import { ChatApp } from "@/components/chat/chat-app";

export const metadata: Metadata = {
  title: "Chat — free AI chat in Thai & English",
  description: "Free AI chat on DevStack: ask anything in Thai or English, get coding help, or create images. Powered by Cloudflare Workers AI.",
};

export default function ChatPage() {
  return <ChatApp channel="user" />;
}
