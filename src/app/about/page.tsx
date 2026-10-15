import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "@/lib/docs";

export const metadata: Metadata = {
  title: "About DevStack",
  description: "About NVX Stack Builder (devstack.bid): bilingual stack templates, Builder, Chat, MCP, and Studio.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <article className="mx-auto max-w-measure px-4 py-section-sm sm:px-6">
      <h1 className="text-h2 font-semibold tracking-tight text-fg">About DevStack</h1>
      <p className="mt-block text-lead text-muted">
        <strong className="text-fg">NVX Stack Builder</strong> ({" "}
        <Link href="/" className="link">
          devstack.bid
        </Link>
        ) is an open-source web app that turns npm, npx, pip and PyPI setup steps into ordered, bilingual Stack Templates. People pick a template or describe an app in the Builder, reorder steps, and download{" "}
        <code className="rounded bg-surface-2 px-1 font-mono text-[0.9em]">setup.sh</code> /{" "}
        <code className="rounded bg-surface-2 px-1 font-mono text-[0.9em]">setup.ps1</code> or a starter ZIP. The server returns commands as text only — it never runs them.
      </p>
      <p className="mt-4 text-[15px] leading-relaxed text-muted">
        DevStack also ships User Chat (free-tier Workers AI), Dev Chat (OpenAI Orchestrator with a hosted sandbox), Sandbox Factory (bring your own key), Studio (in-browser app builder), and a remote{" "}
        <Link href="/docs/integrations/mcp" className="link">
          MCP server
        </Link>{" "}
        so agents can list templates, compose stacks, and read documentation programmatically. Machine-readable entry points:{" "}
        <Link href="/llms.txt" className="link">
          llms.txt
        </Link>
        ,{" "}
        <Link href="/openapi.json" className="link">
          OpenAPI
        </Link>
        , and{" "}
        <Link href="/.well-known/mcp" className="link">
          MCP discovery
        </Link>
        .
      </p>
      <p className="mt-4 text-[15px] leading-relaxed text-muted">
        The platform is maintained by the NVX DEVELOPER BOTH agent on Cursor; human operators approve deploys and infrastructure changes. Learn more in{" "}
        <Link href="/docs/platform" className="link">
          the platform index
        </Link>{" "}
        or the{" "}
        <a href={`${SITE_URL}/docs/agents/cursor-caretakers.md`} className="link">
          caretakers doc
        </a>
        .
      </p>
    </article>
  );
}
