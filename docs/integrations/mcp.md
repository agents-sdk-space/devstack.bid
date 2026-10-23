# DevStack MCP integration · เชื่อมเครื่องมือกับ AI platform

DevStack publishes a remote [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server so MCP-compatible clients can use the same templates, documentation, planner, chat, Factory, and GitHub features as the website. The endpoint is `https://devstack.bid/mcp` using Streamable HTTP. Discovery metadata is available at `https://devstack.bid/.well-known/mcp`. The server returns setup commands as text and never executes them on its own.

DevStack เปิด MCP server ให้แพลตฟอร์มที่รองรับเชื่อมเครื่องมือของเว็บได้โดยตรง Endpoint คือ `https://devstack.bid/mcp` และข้อมูลค้นพบระบบอยู่ที่ `https://devstack.bid/.well-known/mcp` ใช้ได้กับ MCP client ที่รองรับ Streamable HTTP โดยไม่ต้องติดตั้ง Node หรือรันเซิร์ฟเวอร์ MCP ไว้เอง

## Connect and create a key

1. Sign in to DevStack and open [`/settings/mcp`](https://devstack.bid/settings/mcp).
2. Create a named key and select only the scopes required by your client. The full key appears once; copy it into the MCP client's secret/header settings. DevStack stores only its SHA-256 hash.
3. Configure server URL `https://devstack.bid/mcp` and HTTP header `Authorization: Bearer nvx_live_…`.
4. Revoke a key from the same settings page when it is no longer needed. Active keys have a per-key limit of 60 requests per minute.

ห้ามวาง API key ใน prompt, source code, repo หรือข้อความสนทนา ใช้ช่อง secret ของ MCP client เท่านั้น บางเครื่องมืออาจต้อง refresh/reconnect หลังเพิ่ม server หาก key รั่วให้เพิกถอนแล้วออก key ใหม่ทันที

### Headers for paid AI features

`plan_stack` and Sandbox Factory can receive your own OpenAI API key as the separate `x-openai-key` HTTP header. Configure it as a secret header in the MCP client. It is forwarded only for that request and is not saved in DevStack. The Factory requires it; the planner can also use the site's configured provider or offline fallback. Never include this secret in tool arguments.

## Tools

| Tool | Access | What it does |
|---|---|---|
| `list_templates`, `get_template` | Public | Browse the current stack catalog and read one complete template. |
| `compose_stack`, `export_scripts`, `export_starter_bundle`, `create_share_link` | Public | Validate a configuration, optionally reorder/remove/add sanitized custom steps, return ordered steps, generate `setup.sh` / `setup.ps1`, return every file from the Builder ZIP as a path-to-text map, and create a Builder link. Scripts are not run by DevStack. |
| `search_docs`, `read_doc`, `get_platform_info` | Public | Search or read Thai/English product and technical documentation. |
| `get_safety_recommendations` | Public | Return general bilingual privacy, account/device security, scam-response, and personal-safety checklists. The tool accepts no personal details and cannot inspect devices or accounts. |
| `plan_stack` | `plan:write` | Turn a project description into a proposed scaffold plan. Uses quota/provider behavior from `/api/plan`. |
| `chat_send` | `chat:write` | Send a turn to User Chat, including image mode. The response may include image content blocks. Site chat quotas still apply. |
| `dev_chat_send` | `dev:write` | Send a turn to the Image and Research Orchestrator; site daily limits and budget still apply. |
| `list_conversations`, `read_conversation` | `chat:read` | Read only the signed-in account's own chat history. |
| `factory_create_session`, `factory_send_message` | `factory:write` | Create or continue a Sandbox Factory session using your `x-openai-key` and selected environment. |
| `github_list_repositories` | `github:read` | List writable repositories for an account signed in to DevStack with GitHub. |
| `github_commit_file` | `github:write` | Create a real commit for one validated file in a repository. Review the proposed file and ask the user before calling this write tool. |
| `list_project_templates` | `projects:read` | List the template ids `create_project` can seed a repository from. |
| `list_projects`, `get_project` | `projects:read` | List your projects (sites) or read one with its 10 most recent deployments. |
| `list_deployments`, `get_deployment` | `projects:read` | Read a project's deployment timeline or one deployment's status, URL and build job. |
| `get_deployment_logs` | `projects:read` | Read redacted build log lines; pass the returned `next` as `after` to resume. |
| `create_project` | `projects:write` | Create a real GitHub repository in your linked account (optionally seeded from a template) and register it as a project. Uses the daily project quota. |
| `trigger_deploy` | `deploy:write` | Start a container build. Defaults to `preview`. **Destructive for production:** `environment: "production"` replaces the live site and is refused unless the call also passes `confirm: "deploy-production"`. |
| `cancel_deployment` | `deploy:write` | **Destructive:** cancel a queued or running deployment. Refused unless `confirm` equals the deployment id. |

Public tools do not require a key. Private tools require a DevStack API key with the listed scope. GitHub scopes are available only when your DevStack account is linked through GitHub. The key UI only issues scoped keys for a signed-in account. All chat and AI tools can consume quotas or incur provider cost; the client should show the action to the user before sending prompts or creating Factory sessions. Uploaded file attachments are not exposed because the site's R2 upload storage is not enabled.

### Projects, deploys and logs

The project tools are thin adapters over the same service code as `/api/projects` and `/api/deployments`, so quotas, GitHub checks and log redaction are identical to the website. Every query is filtered by the user that owns the API key: another user's project or deployment id returns `not_found`. CLI keys (`cli:*`) are rejected by `/mcp`, and MCP keys are rejected by the CLI. Tools marked destructive carry the MCP `destructiveHint` annotation and also require a `confirm` argument, so a client that auto-approves still cannot deploy to production or cancel by accident. Custom-domain tools are not available yet; they will be added once custom domains ship on the website.

โปรเจกต์และ deploy: เครื่องมือชุดนี้ใช้โค้ดเดียวกับหน้าเว็บ เห็นเฉพาะโปรเจกต์ของเจ้าของคีย์เท่านั้น การ deploy ขึ้น production และการยกเลิก deploy ต้องส่งค่า `confirm` ทุกครั้ง ให้ AI ถามผู้ใช้ก่อนเสมอ

## Client configuration example

Most desktop clients accept a remote MCP URL and custom headers. For a JSON configuration that supports this shape:

```json
{
  "mcpServers": {
    "devstack": {
      "url": "https://devstack.bid/mcp",
      "headers": {
        "Authorization": "Bearer nvx_live_REPLACE_WITH_YOUR_KEY"
      }
    }
  }
}
```

Add `x-openai-key` as a second secret header only if you use planner BYOK or Factory. Client configuration formats differ; if your client cannot add HTTP headers to a remote server, it cannot call protected tools. The current server advertises MCP protocol versions `2025-11-25`, `2025-06-18`, and `2025-03-26`, sends JSON responses, and supports tool and resource discovery. The endpoint is stateless; clients do not need a session id.

### Cline (VS Code)

[Cline](https://cline.bot/) connects to DevStack as a remote Streamable HTTP server. Cline's own config differs from the generic example above in one important way: it needs `"type": "streamableHttp"`. Without `type`, Cline assumes a local stdio server and the connection fails; the hyphenated value `streamable-http` is not accepted.

1. Create a key at [`/settings/mcp`](https://devstack.bid/settings/mcp). After you create it, the page shows a ready-to-copy Cline snippet with your key filled in.
2. In VS Code open the Cline panel, click the **MCP Servers** icon, open the **Configure** tab, and choose **Configure MCP Servers**. This opens `cline_mcp_settings.json`.
3. Add the `devstack` entry under `mcpServers`, then save. Cline applies the change without restarting VS Code.

```json
{
  "mcpServers": {
    "devstack": {
      "type": "streamableHttp",
      "url": "https://devstack.bid/mcp",
      "headers": {
        "Authorization": "Bearer nvx_live_REPLACE_WITH_YOUR_KEY"
      },
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

Keep `autoApprove` empty. `plan_stack`, `chat_send`, `dev_chat_send`, the Factory tools and especially `github_commit_file` use quota, can cost money, or change a repository, so Cline should ask before each call. The public tools (templates, docs, script export) need no key; you can omit `headers` if you only use those. The settings file stores the key in plain text on your machine, so do not commit it or paste it into a chat, and revoke the key at `/settings/mcp` if the file leaks.

ผู้ใช้ Cline: เปิดแผง Cline ใน VS Code > ไอคอน **MCP Servers** > แท็บ **Configure** > **Configure MCP Servers** แล้วเพิ่มรายการ `devstack` ตามตัวอย่างด้านบน ต้องมี `"type": "streamableHttp"` เสมอ ถ้าไม่ใส่ Cline จะเข้าใจว่าเป็น server แบบ stdio ในเครื่องและเชื่อมต่อไม่ได้ ควรปล่อย `autoApprove` ว่างไว้เพื่อให้ Cline ถามก่อนเรียกเครื่องมือที่ใช้โควตา มีค่าใช้จ่าย หรือแก้ repository และห้ามนำไฟล์ตั้งค่าที่มีคีย์ไป commit

### Cursor

Add to `~/.cursor/mcp.json` (or `.cursor/mcp.json` in a project you do not commit secrets from):

```json
{
  "mcpServers": {
    "devstack": {
      "url": "https://devstack.bid/mcp",
      "headers": { "Authorization": "Bearer ${env:DEVSTACK_MCP_KEY}" }
    }
  }
}
```

Set `DEVSTACK_MCP_KEY` in your shell environment so the key is not stored in the file.

### Claude

Claude Code: `claude mcp add --transport http devstack https://devstack.bid/mcp --header "Authorization: Bearer $DEVSTACK_MCP_KEY"`.

Claude Desktop (via the `mcp-remote` bridge) in `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "devstack": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://devstack.bid/mcp", "--header", "Authorization:${DEVSTACK_AUTH}"],
      "env": { "DEVSTACK_AUTH": "Bearer nvx_live_REPLACE_WITH_YOUR_KEY" }
    }
  }
}
```

## Security and availability

Keys are shown once, stored as hashes, scope-checked on each call, and can be revoked immediately. Calls are limited to 60 per minute per key. Do not share a key between people or put a broad key in a public integration. The `github_commit_file` tool changes a repository; it is explicitly marked as a write operation. Other setup-script tools return plain text only. Cloudflare deployment must apply migration `0008_mcp_clients` before key management works in production; until then, the production endpoint cannot issue or authenticate these account keys.

### Privacy and personal safety

`get_safety_recommendations` returns a static checklist in Thai or English. It does not take free-text personal context, inspect a device, verify an account, or contact emergency services. Do not send passwords, OTPs, recovery codes, private/API keys, full addresses, or live location to an MCP client. For immediate danger, contact local emergency services; for suspected account compromise or financial fraud, use the affected provider's official recovery or support channel.

## ภาษาไทย: ขอบเขตและข้อจำกัด

คีย์แต่ละอันกำหนดสิทธิ์ได้แยกกัน เช่น อนุญาตอ่านประวัติอย่างเดียว หรืออนุญาตส่งแชตและเขียน GitHub เฉพาะตอนจำเป็น ให้ใช้สิทธิ์น้อยที่สุดและตั้งชื่อคีย์ตาม client เพื่อเพิกถอนง่าย เครื่องมือที่สร้างไฟล์หรือสร้าง session อาจใช้โควตาหรือมีค่าใช้จ่ายจาก provider ภายนอก ส่วน GitHub commit เป็นการเปลี่ยน repository จริง จึงควรตรวจเนื้อหาและขอให้ผู้ใช้ยืนยันก่อนเรียกทุกครั้ง

MCP ชุดนี้ครอบคลุมฟังก์ชันของเว็บที่ส่งผ่าน API หรือส่งคืนเป็นไฟล์ได้ รวมถึงปรับลำดับ ลบ และเพิ่ม custom steps ที่ผ่าน sanitizer แล้ว แต่ไม่จำลองทุกหน้าจอ UI เช่น OAuth login, การตั้งค่าบัญชี, theme, drag-and-drop ด้วยเมาส์ หรือการอัปโหลดไฟล์ เมื่อฟังก์ชันเว็บเปลี่ยน ให้ปรับ tool, scope, เอกสาร และ tests พร้อมกัน ดู [platform function index](../platform.md), [API plan reference](../reference/api-plan.md), [chat guide](../user-guide/chat.md), และ [D1 schema](../reference/d1-schema.md) ประกอบ
