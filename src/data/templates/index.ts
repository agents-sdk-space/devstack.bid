import type { StackTemplate } from "@/lib/types";
import collabWorkspace from "./collab-workspace";
import expressApi from "./express-api";
import fastapiAi from "./fastapi-ai";
import nextjsAiChat from "./nextjs-ai-chat";
import nextjsDashboard from "./nextjs-dashboard";
import nodeCliNpx from "./node-cli-npx";
import pypiPackage from "./pypi-package";
import reactAdminTool from "./react-admin-tool";
import streamlitDashboard from "./streamlit-dashboard";
import viteReactGame from "./vite-react-game";

/**
 * Template registry. To add a template: create a file in this folder that
 * default-exports a StackTemplate, then add it to this array.
 */
export const TEMPLATES: StackTemplate[] = [
  nextjsDashboard,
  viteReactGame,
  expressApi,
  fastapiAi,
  streamlitDashboard,
  nodeCliNpx,
  pypiPackage,
  collabWorkspace,
  reactAdminTool,
  nextjsAiChat,
];

export const TEMPLATE_IDS = TEMPLATES.map((t) => t.id);

export function getTemplate(id: string): StackTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
