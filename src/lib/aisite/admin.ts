/** Operator-only details (e.g. the AI route) are shown to logins listed in AISITE_ADMIN_LOGINS (comma separated). Default: nobody. */
export function isAdmin(login: string | null | undefined, list = process.env.AISITE_ADMIN_LOGINS ?? ""): boolean {
  if (!login) return false;
  return list.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean).includes(login.toLowerCase());
}
