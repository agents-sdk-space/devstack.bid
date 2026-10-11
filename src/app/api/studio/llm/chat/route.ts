import { handleStudioChat } from "@/lib/studio/route";

/** POST /api/studio/llm/chat — Studio agents' completions (Workers AI, then Hugging Face). See src/lib/studio/route.ts. */
export async function POST(req: Request) {
  return handleStudioChat(req);
}
