import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Contact",
  description: "Contact and support channels for DevStack (NVX Stack Builder).",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <article className="mx-auto max-w-measure px-4 py-section-sm sm:px-6">
      <h1 className="text-h2 font-semibold tracking-tight text-fg">Contact</h1>
      <p className="mt-block text-lead text-muted">
        DevStack is an open-source project. For product questions, documentation fixes, and agent integration help, start with the in-app{" "}
        <Link href="/docs" className="link">
          documentation
        </Link>{" "}
        and the{" "}
        <Link href="/llms.txt" className="link">
          llms.txt
        </Link>{" "}
        index for AI agents.
      </p>
      <ul className="mt-6 list-disc space-y-3 pl-5 text-[15px] leading-relaxed text-muted marker:text-subtle">
        <li>
          <strong className="text-fg">Email:</strong>{" "}
          <a href="mailto:devstack.sdk@gmail.com" className="link">
            devstack.sdk@gmail.com
          </a>{" "}
          (general inquiries; do not send secrets or API keys).
        </li>
        <li>
          <strong className="text-fg">Security:</strong> report vulnerabilities through{" "}
          <a href="https://github.com/agents-sdk-space/devstack.bid/security/advisories" className="link" rel="noopener noreferrer">
            GitHub Security Advisories
          </a>{" "}
          — see <Link href="/docs/contributing/docs-maintenance" className="link">contributing docs</Link> for the policy.
        </li>
        <li>
          <strong className="text-fg">MCP / API keys:</strong> self-serve at{" "}
          <Link href="/settings/mcp" className="link">
            MCP settings
          </Link>{" "}
          after signing in; scopes and limits are documented in{" "}
          <Link href="/docs/integrations/mcp" className="link">
            MCP integration
          </Link>
          .
        </li>
        <li>
          <strong className="text-fg">Status &amp; deploy notes:</strong> production URL{" "}
          <a href="https://devstack.bid" className="link">
            https://devstack.bid
          </a>{" "}
          (Cloudflare Workers via OpenNext).
        </li>
      </ul>
    </article>
  );
}
