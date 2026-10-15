#!/usr/bin/env node
// Local mock of the Cloudflare API endpoints used by validate.ts + deploy/cloudflare.ts (verification only).
import http from "node:http";
const port = Number(process.env.PORT ?? 18790);
const calls = [];
const send = (res, status, body) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const u = new URL(req.url, "http://x");
    const p = u.pathname.replace(/^\/client\/v4/, "");
    calls.push(`${req.method} ${p}`);
    console.log(`${req.method} ${p}`);
    if (p === "/__calls") return send(res, 200, calls);
    if (p === "/user/tokens/verify") return send(res, 200, { success: true, result: { status: "active" } });
    let m;
    if ((m = p.match(/^\/accounts\/([a-f0-9]{32})$/))) return send(res, 200, { success: true, result: { id: m[1], name: "Mock account" } });
    if ((m = p.match(/\/workers\/scripts\/([^/]+)\/assets-upload-session$/))) {
      const manifest = JSON.parse(body || "{}").manifest ?? {};
      return send(res, 200, { success: true, result: { jwt: "upload-jwt", buckets: [Object.values(manifest).map((x) => x.hash)] } });
    }
    if (p.endsWith("/workers/assets/upload")) return send(res, 201, { success: true, result: { jwt: "completion-jwt" } });
    if ((m = p.match(/\/workers\/scripts\/([^/]+)$/)) && req.method === "PUT") {
      if (m[1].includes("fail") && !body.includes("FIXED")) return send(res, 400, { success: false, errors: [{ code: 10021, message: "Uncaught SyntaxError: Unexpected token (mock)" }] });
      return send(res, 200, { success: true, result: { etag: `etag-${calls.length}` } });
    }
    if (p.endsWith("/subdomain") && req.method === "POST") return send(res, 200, { success: true, result: {} });
    if (p.endsWith("/workers/subdomain")) return send(res, 200, { success: true, result: { subdomain: "mock" } });
    send(res, 404, { success: false, errors: [{ code: 7003, message: `mock: no route ${req.method} ${p}` }] });
  });
}).listen(port, "127.0.0.1", () => console.log(`mock cloudflare on ${port}`));
