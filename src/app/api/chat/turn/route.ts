import { handleTurn } from "@/lib/chat/turn-route";

/** POST /api/chat/turn — User Chat (Workers AI / HF, free-tier quotas). See src/lib/chat/turn-route.ts. */
export async function POST(req: Request) {
  return handleTurn(req, "user");
}
