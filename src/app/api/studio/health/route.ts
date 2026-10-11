import { connection } from "next/server";
import { handleStudioHealth } from "@/lib/studio/route";

/** GET /api/studio/health — Studio capabilities + this browser's free quota. See src/lib/studio/route.ts. */
export async function GET(req: Request) {
  await connection();
  return handleStudioHealth(req);
}
