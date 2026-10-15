import type { DeployCardData } from "@/lib/chat/events";
import type { Activity, ChatMode } from "@/lib/chat/events";

export type { ChatMode };
export interface Quota {
  messagesLeft?: number;
  imagesLeft?: number;
  agentLeft?: number;
  resetSec?: number;
}

export interface ChatImage {
  id: string;
  url: string;
  caption: string;
}
export interface ChatFile {
  id: string;
  name: string;
  size: number;
  url: string;
}
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  activities: Activity[];
  images: ChatImage[];
  files: ChatFile[];
  deploys?: DeployCardData[];
  usage?: { input: number; output: number };
  error?: { code: string; message: string };
  pending?: boolean;
}
export interface ConversationSummary {
  id: string;
  title: string | null;
  updatedAt: number;
}
export interface ChatAccount {
  login: string;
  name: string | null;
  avatarUrl: string | null;
  provider: "github" | "google" | "cursor" | "password";
}
export interface ChatModelOption {
  mode: ChatMode;
  provider: string;
  model: string;
  available: boolean;
  label?: { en: string; th: string };
}
export interface ChatInfo {
  enabled: boolean;
  unavailable?: { code: string; message: string };
  agent: string;
  template?: "orchestrator" | "blank";
  limits: { maxInputChars: number; messagesPerDay: number; imagesPerDay: number; agentPerDay: number; maxAttachmentBytes: number; model: string; environment: string };
  models?: ChatModelOption[];
  github?: { configured: boolean };
  account?: ChatAccount | null;
  quota?: Quota;
  conversations: ConversationSummary[];
}
export type SandboxStatus = "idle" | "starting" | "provisioning" | "sandbox_ready" | "working" | "resuming";
