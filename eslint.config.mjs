import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import jsxA11y from "eslint-plugin-jsx-a11y";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

const eslintConfig = defineConfig([
  js.configs.recommended,
  ...tseslint.configs.recommended,
  react.configs.flat.recommended,
  react.configs.flat["jsx-runtime"],
  reactHooks.configs.flat.recommended,
  jsxA11y.flatConfigs.recommended,
  {
    files: ["**/*.{js,mjs,cjs,jsx,ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      // These patterns intentionally match control characters as input validation.
      "no-control-regex": "off",
      "no-useless-escape": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
      // Existing UI uses managed focus and click targets with explicit handlers.
      "jsx-a11y/no-noninteractive-tabindex": "off",
      "jsx-a11y/no-autofocus": "off",
      "jsx-a11y/no-static-element-interactions": "off",
      "jsx-a11y/click-events-have-key-events": "off",
    },
  },
  globalIgnores([
    "sandbox-examples/**",
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".open-next/**",
    ".wrangler/**",
    "cloudflare-env.d.ts",
    "src/generated/**",
    // Studio sub-app (Vite + React, own ESLint/TS config: npm run studio:check) and its build output
    "studio/**",
    "public/studio/**",
    // Verbatim upstream template copies kept for licence attribution
    "third_party/**",
    // Complete starter projects committed to customer repos (own package.json); embedded via scripts/gen-template-projects.mjs
    "template-projects/**",
    "src/data/template-projects.generated.ts",
  ]),
]);

export default eslintConfig;
