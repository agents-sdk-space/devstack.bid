import type { D1Like } from "@/lib/chat/store";
import { ServiceError } from "@/lib/connections/github-service";
import type { R2BucketLike } from "@/lib/hosting/serve";

/**
 * Every way a project gets (or changes) its slug MUST call this: import today, and any future rename/slug-change
 * route. Refuses a slug that is (1) another project's slug, (2) shaped like another project's preview host
 * `<existing-slug>-<6 chars>`, or (3) still held by another project's host record in R2 (incl. expired tombstones).
 */
export async function assertSlugUsable(db: D1Like, slug: string, projectId: string | null, sites: R2BucketLike | null = null): Promise<void> {
  const taken = await db.prepare("SELECT id FROM projects WHERE slug = ?1").bind(slug).first<{ id: string }>();
  if (taken && taken.id !== projectId) throw new ServiceError("conflict", `Project name "${slug}" is already used. / ชื่อนี้ถูกใช้แล้ว`, 409);
  const previewShape = /^(.+)-[a-z0-9]{6}$/.exec(slug);
  if (previewShape) {
    const base = await db.prepare("SELECT id FROM projects WHERE slug = ?1").bind(previewShape[1]).first<{ id: string }>();
    if (base && base.id !== projectId) throw new ServiceError("conflict", `Project name "${slug}" looks like a preview address of another project. / ชื่อนี้ซ้ำกับรูปแบบลิงก์ preview`, 409);
  }
  if (sites) {
    const rec = await sites.get(`hosts/${slug}.json`);
    if (rec) {
      let owner: unknown = null;
      try { owner = (JSON.parse(rec.text ? await rec.text() : await new Response(rec.body).text()) as { projectId?: unknown }).projectId; } catch { owner = null; }
      // A tombstone without an owner (projectId null/missing) blocks everyone.
      if (typeof owner !== "string" || owner !== projectId) throw new ServiceError("conflict", `Project name "${slug}" is still reserved by an earlier site. / ชื่อนี้ยังถูกจองโดยเว็บเดิม`, 409);
    }
  }
}

