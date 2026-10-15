/**
 * Official token-creation console pages, one per provider the app accepts a token/key for.
 * Verified against each provider's docs on 2026-10-15 (see docs/user-guide/create-token.md).
 */
export type TokenProvider = "cloudflare" | "github" | "openai" | "vercel" | "huggingface";

export interface TokenProviderInfo {
  id: TokenProvider;
  name: string;
  url: string;
  /** Suggested Environment variable name when the user ticks "Remember". */
  envName: string;
  hint: { en: string; th: string };
}

export const TOKEN_PROVIDERS: readonly TokenProviderInfo[] = [
  {
    id: "cloudflare",
    name: "Cloudflare API token",
    url: "https://dash.cloudflare.com/profile/api-tokens",
    envName: "CLOUDFLARE_API_TOKEN",
    hint: { en: "Workers Scripts: Edit + Account Settings: Read", th: "Workers Scripts: Edit + Account Settings: Read" },
  },
  {
    id: "github",
    name: "GitHub fine-grained token",
    url: "https://github.com/settings/personal-access-tokens/new",
    envName: "GITHUB_TOKEN",
    hint: { en: "Contents + Pull requests: Read and write", th: "Contents + Pull requests: Read and write" },
  },
  {
    id: "openai",
    name: "OpenAI API key",
    url: "https://platform.openai.com/api-keys",
    envName: "OPENAI_API_KEY",
    hint: { en: "Project key, restricted if possible", th: "ใช้คีย์ระดับโปรเจกต์ และจำกัดสิทธิ์ถ้าทำได้" },
  },
  {
    id: "vercel",
    name: "Vercel token",
    url: "https://vercel.com/account/tokens",
    envName: "VERCEL_TOKEN",
    hint: { en: "Scope it to one team, set an expiry", th: "จำกัดให้ทีมเดียว และตั้งวันหมดอายุ" },
  },
  {
    id: "huggingface",
    name: "Hugging Face access token",
    url: "https://huggingface.co/settings/tokens",
    envName: "HF_TOKEN",
    hint: { en: "Fine-grained, Inference only", th: "แบบ fine-grained เฉพาะ Inference" },
  },
];

export const tokenProvider = (id: TokenProvider) => TOKEN_PROVIDERS.find((p) => p.id === id)!;
