import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy",
  description: "Privacy practices for DevStack chat, MCP keys, cookies, and third-party AI providers.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-measure px-4 py-section-sm sm:px-6">
      <h1 className="text-h2 font-semibold tracking-tight text-fg">Privacy</h1>
      <p className="mt-block text-lead text-muted">
        DevStack (NVX Stack Builder) is designed so setup commands stay on your machine. This page summarizes what the website stores and what leaves your browser when you use Chat, MCP, or Studio.
      </p>
      <h2 className="mt-8 text-h3 font-semibold text-fg">What we do not do</h2>
      <p className="mt-3 text-[15px] leading-relaxed text-muted">
        We do not execute template or Builder commands on our servers. We do not ask you to paste production secrets into public chat. MCP tools return text and metadata only; scoped API keys can be revoked at any time from{" "}
        <Link href="/settings/mcp" className="link">
          MCP settings
        </Link>
        .
      </p>
      <h2 className="mt-8 text-h3 font-semibold text-fg">Chat and quotas</h2>
      <p className="mt-3 text-[15px] leading-relaxed text-muted">
        User Chat stores conversation text in Cloudflare D1 associated with a signed browser cookie or your account when you sign in. Dev Chat and Factory may stream prompts to OpenAI-hosted agents when enabled. Free-tier quotas reset daily (Bangkok midnight for messages/images). See{" "}
        <Link href="/chat" className="link">
          Chat
        </Link>{" "}
        in-product notices for current limits.
      </p>
      <h2 className="mt-8 text-h3 font-semibold text-fg">Authentication</h2>
      <p className="mt-3 text-[15px] leading-relaxed text-muted">
        Optional sign-in uses GitHub, Google, Cursor, or email/password. OAuth providers receive only what their consent screen shows. Session cookies are HTTP-only and revocable. Passwords are hashed with PBKDF2; we never store plaintext passwords.
      </p>
      <h2 className="mt-8 text-h3 font-semibold text-fg">Third parties</h2>
      <p className="mt-3 text-[15px] leading-relaxed text-muted">
        AI features may call Cloudflare Workers AI, Hugging Face, or OpenAI depending on mode and keys you supply. The home page live editor loads CodeSandbox iframes in your browser (see site CSP). Analytics, if enabled, follows Cloudflare Web Analytics configuration on the deployed Worker.
      </p>
      <p className="mt-6 text-[15px] leading-relaxed text-muted">
        Questions:{" "}
        <a href="mailto:devstack.sdk@gmail.com" className="link">
          devstack.sdk@gmail.com
        </a>
        . Full operational detail lives in{" "}
        <Link href="/docs/architecture/api-hardening" className="link">
          API hardening
        </Link>{" "}
        and{" "}
        <Link href="/docs/integrations/mcp" className="link">
          MCP integration
        </Link>
        .
      </p>
    </article>
  );
}
