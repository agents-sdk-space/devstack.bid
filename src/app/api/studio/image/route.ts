import { handleStudioImage } from "@/lib/studio/route";

/** POST /api/studio/image — Studio DesignAgent images (FLUX on Workers AI, shares /chat's free images). See src/lib/studio/route.ts. */
export async function POST(req: Request) {
  return handleStudioImage(req);
}
