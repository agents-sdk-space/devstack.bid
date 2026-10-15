/**
 * Starter files vendored verbatim from cloudflare/workers-sdk (MIT OR Apache-2.0), pinned commit
 * ad01099fef3baa6af4bcc1bd6325257831f4b911, packages/create-cloudflare/templates/
 * (hello-world/js/src/index.js, hello-world-assets-only/templates/public/index.html).
 * Raw copies + LICENSE-MIT: third_party/cloudflare-workers-sdk/. See THIRD_PARTY_NOTICES.md.
 */
export const UPSTREAM = {
  repo: "https://github.com/cloudflare/workers-sdk",
  commit: "ad01099fef3baa6af4bcc1bd6325257831f4b911",
  license: "MIT OR Apache-2.0",
  copyright: "Copyright (c) 2020 Cloudflare, Inc.",
} as const;

export const UPSTREAM_WORKER_JS = "/**\n * Welcome to Cloudflare Workers! This is your first worker.\n *\n * - Run `npm run dev` in your terminal to start a development server\n * - Open a browser tab at http://localhost:8787/ to see your worker in action\n * - Run `npm run deploy` to publish your worker\n *\n * Learn more at https://developers.cloudflare.com/workers/\n */\n\nexport default {\n\tasync fetch(request, env, ctx) {\n\t\treturn new Response(\"Hello World!\");\n\t},\n};\n";

export const UPSTREAM_ASSETS_INDEX_HTML = "<!doctype html>\n<html lang=\"en\">\n\t<head>\n\t\t<meta charset=\"UTF-8\" />\n\t\t<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />\n\t\t<title>Hello, World!</title>\n\t</head>\n\t<body>\n\t\t<h1 id=\"heading\">Hello, World!</h1>\n\t\t<p>This page comes from a static asset stored at `public/index.html` as configured in `wrangler.jsonc`.</p>\n\t</body>\n</html>\n";
