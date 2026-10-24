import { describe, expect, it, vi } from "vitest";
import { DEVSTACK_IMPORT_GIT, PERSONAL_GITHUB_INSTALLATIONS, githubAppRecoveryLinks } from "@/lib/github/app-install-recovery";

vi.mock("next/server", () => ({ connection: vi.fn(async () => {}) }));

import { GET as postInstallRedirect } from "@/app/api/github/app/setup/route";

describe("GitHub App installation recovery", () => {
  it("offers settings for an existing org installation instead of installing again", () => {
    expect(githubAppRecoveryLinks("agents-sdk-space")).toEqual({
      organizationInstallations: "https://github.com/organizations/agents-sdk-space/settings/installations",
      personalInstallations: PERSONAL_GITHUB_INSTALLATIONS,
      importGit: DEVSTACK_IMPORT_GIT,
    });
    expect(DEVSTACK_IMPORT_GIT).toBe("/new?mode=git");
    expect(githubAppRecoveryLinks("agents-sdk-space").organizationInstallations).not.toContain("/installations/new");
  });

  it("rejects invalid owner names in generated installation settings URL", () => {
    expect(githubAppRecoveryLinks("evil/path").organizationInstallations).toBeNull();
    expect(githubAppRecoveryLinks("evil?next=https://example.com").organizationInstallations).toBeNull();
    expect(githubAppRecoveryLinks("-bad").organizationInstallations).toBeNull();
  });

  it("directs a post-installation browser back to the actionable Import Git screen", async () => {
    const res = await postInstallRedirect(new Request("https://devstack.bid/api/github/app/setup?installation_id=123&setup_action=install"));
    expect(res.status).toBe(302);
    const url = new URL(res.headers.get("location")!);
    expect(url.origin).toBe("https://devstack.bid");
    expect(url.pathname).toBe("/new");
    expect(url.searchParams.get("mode")).toBe("git");
    expect(url.searchParams.get("github_app")).toBe("installed");
    expect(url.searchParams.has("installation_id")).toBe(false);
  });
});
