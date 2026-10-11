import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Cloudflare / OpenNext build output
    ".open-next/**",
    ".wrangler/**",
    "cloudflare-env.d.ts",
    // Generated docs bundle (scripts/build-docs.mjs)
    "src/generated/**",
    // Studio sub-app (Vite + React, own ESLint/TS config: npm run studio:check) and its build output
    "studio/**",
    "public/studio/**",
  ]),
]);

export default eslintConfig;
