/**
 * Server endpoints used by the Studio. They are Next.js route handlers in the devstack.bid app
 * (src/app/api/studio/*) that call Workers AI / Hugging Face with the site's own bindings, quotas
 * and signed-cookie identity. The browser never sees a key.
 */
export const API_PATHS = {
  health: '/api/studio/health',
  chat: '/api/studio/llm/chat',
  image: '/api/studio/image',
} as const;
