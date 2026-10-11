/** Wire types shared by the browser client and the server-side proxy. No secrets here. */
export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatRequestBody {
  messages: ChatMessage[];
  /** Ask the upstream model for a JSON object response. */
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
}

export interface ChatResponseBody {
  content: string;
  model: string;
}

export interface ImageRequestBody {
  prompt: string;
  size?: '1024x1024' | '1024x1536' | '1536x1024';
}

export interface ImageResponseBody {
  /** data:image/png;base64,... */
  dataUrl: string;
  model: string;
}

export interface HealthResponseBody {
  ok: true;
  llm: boolean;
  image: boolean;
  provider: string | null;
  model: string | null;
  imageModel: string | null;
  /** Remaining free quota for this browser (signed cookie) today; null when the server has no quota store. */
  quota?: { callsLeft: number; imagesLeft: number; resetSec: number } | null;
  /** Bilingual reason when llm/image are off (e.g. no Workers AI binding in local dev). */
  note?: string;
}

export interface ApiErrorBody {
  error: string;
  status?: number;
  /** Machine-readable error code (e.g. "rate_limited", "forbidden_origin"). */
  code?: string;
}

export const API_LIMITS = {
  maxBodyBytes: 512 * 1024,
  maxMessages: 40,
  maxMessageChars: 120_000,
  maxPromptChars: 4_000,
  maxTokensCeiling: 8_000,
} as const;
