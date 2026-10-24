import { handleTurn } from "@/lib/chat/turn-route";
import { chatRuntime } from "@/lib/chat/runtime";
import { classify, visitorOf } from "@/lib/activity/core";
import { recordActivity } from "@/lib/activity/store";

/** POST /api/chat/turn — User Chat (Workers AI / HF, free-tier quotas). See src/lib/chat/turn-route.ts. */
export async function POST(req: Request) {
  // Opted-in visitors only: store the topic *category* of the message, never its text.
  if (visitorOf(req)) {
    const body = (await req.clone().json().catch(() => null)) as { message?: unknown } | null;
    if (typeof body?.message === "string") {
      const { db, waitUntil } = await chatRuntime();
      waitUntil(Promise.all(classify(body.message).map((topic) => recordActivity(db, req, { type: "topic", path: "/chat", topic }))).catch(() => {}));
    }
  }
  return handleTurn(req, "user");
}
