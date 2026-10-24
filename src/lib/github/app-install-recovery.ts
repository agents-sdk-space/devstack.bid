/** Recovery destinations when the GitHub App has already been registered.
 * Installation authorization belongs to GitHub account/org owners, not DevStack.
 * Do not point existing installations back to /installations/new.
 */
export const PERSONAL_GITHUB_INSTALLATIONS = "https://github.com/settings/installations";
export const DEVSTACK_IMPORT_GIT = "/new?mode=git";

export function githubAppRecoveryLinks(appOwner: string): {
  organizationInstallations: string | null;
  personalInstallations: string;
  importGit: string;
} {
  // GitHub login names contain only alphanumeric characters and hyphens.
  // A malformed owner must not be interpolated into a navigation URL.
  const org = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(appOwner)
    ? appOwner
    : null;
  return {
    organizationInstallations: org
      ? `https://github.com/organizations/${encodeURIComponent(org)}/settings/installations`
      : null,
    personalInstallations: PERSONAL_GITHUB_INSTALLATIONS,
    importGit: DEVSTACK_IMPORT_GIT,
  };
}
