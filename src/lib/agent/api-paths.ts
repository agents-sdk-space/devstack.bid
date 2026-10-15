const API_PREFIXES = ["/api/plan", "/api/auth", "/api/chat", "/api/factory", "/api/github", "/api/mcp", "/api/studio", "/api/cli", "/api/connections", "/api/deployments", "/api/projects"] as const;

export function isKnownApiPath(pathname: string): boolean {
  return API_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
