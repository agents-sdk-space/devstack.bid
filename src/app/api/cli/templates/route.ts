import { json } from "@/lib/chat/runtime";
import { TEMPLATES } from "@/data/templates";
import { KNOWN_TEMPLATE_IDS } from "@/data/template-ids";

/** GET /api/cli/templates — public list for `devstack create`. Starters are local zips; repo templates create a GitHub repo. */
export function GET() {
  const known = KNOWN_TEMPLATE_IDS as readonly string[];
  return json({
    starters: [
      { id: "static", name: "Static site", kind: "starter" },
      { id: "worker", name: "Cloudflare Worker", kind: "starter" },
    ],
    templates: TEMPLATES.filter((t) => known.includes(t.id)).map((t) => ({ id: t.id, name: t.name.en, summary: t.summary.en, kind: "repo" })),
  }, 200, { "Cache-Control": "public, max-age=300" });
}
