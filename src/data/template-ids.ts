/**
 * IDs of all Stack Templates. Kept separate (and tiny) so next.config.ts can return a real 404 for
 * unknown /templates/<id> without bundling the template data. A unit test keeps it in sync.
 */
export const KNOWN_TEMPLATE_IDS = [
  "nextjs-dashboard",
  "vite-react-game",
  "express-api",
  "fastapi-ai",
  "streamlit-dashboard",
  "node-cli-npx",
  "pypi-package",
  "collab-workspace",
  "react-admin-tool",
  "nextjs-ai-chat",
  "static-website",
] as const;
