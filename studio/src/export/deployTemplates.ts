/** Deploy payload for the exported (generated) app. */
export const EXPORT_VERCEL_JSON = `{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "vite",
  "installCommand": "npm ci",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "rewrites": [{ "source": "/((?!assets/).*)", "destination": "/index.html" }]
}
`;

export const EXPORT_WRANGLER_TOML = `# Cloudflare Pages: npx wrangler pages deploy dist
name = "devstack-app"
compatibility_date = "2025-01-01"
pages_build_output_dir = "dist"
`;

export const EXPORT_CF_REDIRECTS = `/* /index.html 200
`;

export const EXPORT_DOCKERFILE = `# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
`;

export const EXPORT_NGINX_CONF = `server {
  listen 80;
  root /usr/share/nginx/html;
  location / {
    try_files $uri $uri/ /index.html;
  }
  location /assets/ {
    add_header Cache-Control "public, max-age=31536000, immutable";
  }
}
`;

export const EXPORT_DOCKERIGNORE = `node_modules
dist
.env
.git
`;

export const EXPORT_GITIGNORE = `node_modules
dist
.env
.env.*
!.env.example
`;

export const EXPORT_ENV_EXAMPLE = `# PostgreSQL connection for the exported schema (db/migrations, db/schema.prisma)
DATABASE_URL=postgresql://user:password@localhost:5432/devstack
`;

export function exportReadme(opts: { hasLockfile: boolean; tables: string[] }): string {
  return `# DEVSTACK export

Generated with DEVSTACK. Vite + React app with a PostgreSQL schema.

## Run locally

\`\`\`bash
${opts.hasLockfile ? 'npm ci' : 'npm install'}
npm run dev
\`\`\`

## Database

- \`db/migrations/001_init.sql\` — schema, indexes (incl. pgvector) and data: \`psql "$DATABASE_URL" -f db/migrations/001_init.sql\`
- \`db/schema.prisma\` — Prisma schema for the same tables (${opts.tables.join(', ') || 'none'}): \`npx prisma db pull\` / \`npx prisma generate\`

Inside DEVSTACK the app talks to the in-browser database through \`src/devstackDb.js\`.
Outside DEVSTACK, \`sql()\` rejects and the app falls back to local storage — wire it to your own API
(backed by \`DATABASE_URL\`) for production persistence.

## Deploy

- **Vercel:** \`npx vercel\` (uses \`vercel.json\`)
- **Cloudflare Pages:** \`npm run build && npx wrangler pages deploy dist\` (uses \`wrangler.toml\`)
- **Docker:** \`docker build -t devstack-app . && docker run -p 8080:80 devstack-app\`
`;
}
