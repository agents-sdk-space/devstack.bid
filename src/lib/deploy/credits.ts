/**
 * Upstream sources credited in the UI, THIRD_PARTY_NOTICES.md and generated NOTICE files.
 * logo: null = text-only, because the brand's guidelines do not allow logo use without permission.
 */
import { UPSTREAM } from "./upstream-starters";

export interface Credit {
  name: string;
  owner: string;
  url: string;
  license: string;
  version: string;
  logo: null | { src: string; sourceUrl: string };
  logoPolicy: string;
  /** Starter/profile ids this source is used for. */
  usedFor: string[];
  trademark: string;
}

export const CREDITS: Credit[] = [
  {
    name: "create-cloudflare templates (Cloudflare® Workers SDK)",
    owner: "Cloudflare, Inc.",
    url: `${UPSTREAM.repo}/tree/${UPSTREAM.commit}/packages/create-cloudflare/templates`,
    license: UPSTREAM.license,
    version: UPSTREAM.commit.slice(0, 7),
    logo: null,
    logoPolicy: "Text only: Cloudflare allows word marks; logo use needs written permission (https://www.cloudflare.com/trademark/).",
    usedFor: ["chat-static", "chat-worker"],
    trademark: "Cloudflare and Cloudflare Workers are trademarks and/or registered trademarks of Cloudflare, Inc. in the United States and other jurisdictions.",
  },
];

export const NOT_AFFILIATED = "DevStack is not affiliated with, endorsed or sponsored by the projects and companies listed.";

export const creditsFor = (profileId: string) => CREDITS.filter((c) => c.usedFor.includes(profileId));
