import { handleTurn } from "@/lib/chat/turn-route";

/** POST /api/chat/dev/turn — Dev Chat (Image and Research Orchestrator, OpenAI Agents API + sandbox). */
export async function POST(req: Request) {
  return handleTurn(req, "dev");
}
