import { connection } from "next/server";
import { resolveSignedIn } from "@/lib/auth/session";
import { AgentsApi } from "@/lib/chat/agents-api";

import { chatEnv, chatRuntime, json, unavailable } from "@/lib/chat/runtime";
import { getConversation } from "@/lib/chat/store";

const SAFE_TYPES: Record<string, string> = {
  md: "text/markdown; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  json: "application/json",
  png: "image/png",
  webp: "image/webp",
  jpg: "image/jpeg",
};

/** GET /api/chat/files/:conversationId/:artifactId -> download a sandbox artifact (owner only). */
export async function GET(req: Request, { params }: { params: Promise<{ conversationId: string; artifactId: string }> }) {
  await connection();
  const { conversationId, artifactId } = await params;
  const env = chatEnv();
  const { db } = await chatRuntime();
  if (unavailable(env, db) || !/^[0-9a-f-]{36}$/.test(conversationId) || !/^[\w-]{4,200}$/.test(artifactId)) return json({ error: "Not found" }, 404);
  const uid = (await resolveSignedIn(req, env.CHAT_COOKIE_SECRET!)).uid;
  const conv = uid ? await getConversation(db!, uid, conversationId) : null;
  if (!conv?.agent_session_id) return json({ error: "Not found" }, 404);
  const api = new AgentsApi(env.OPENAI_API_KEY!);
  try {
    const arts = await api.listArtifacts(conv.agent_session_id);
    const art = arts.find((a) => a.id === artifactId);
    if (!art) return json({ error: "Not found" }, 404);
    const res = await api.artifactContent(conv.agent_session_id, artifactId);
    const name = art.path.split("/").pop()!.replace(/[^\w.-]/g, "_").slice(0, 100) || "file";
    const ext = name.split(".").pop()!.toLowerCase();
    return new Response(res.body, {
      headers: {
        "Content-Type": SAFE_TYPES[ext] ?? "application/octet-stream",
        "Content-Disposition": `attachment; filename="${name}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return json({ error: "File is no longer available" }, 410);
  }
}
