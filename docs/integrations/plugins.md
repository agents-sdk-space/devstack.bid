# Plugins catalog · รายการปลั๊กอิน

`/plugins` lists MCP servers and plugins that people can connect to their own AI tools. **DevStack shows metadata and links only. It never installs, fetches or runs a plugin.**

`/plugins` คือรายการ MCP server และปลั๊กอินที่ผู้ใช้นำไปเชื่อมกับเครื่องมือ AI ของตัวเองได้ DevStack แสดงเฉพาะข้อมูลและลิงก์ ไม่ติดตั้ง ไม่ดึง และไม่รันปลั๊กอินใดๆ

## Source of truth · แหล่งข้อมูล

- Catalog repo: [agents-sdk-space/devstack-plugins](https://github.com/agents-sdk-space/devstack-plugins) (MIT), file `catalog/plugins.json`, validated by its own CI.
- Snapshot in this repo: `src/data/plugin-catalog.json`, which records the pinned commit. The site reads it at build time; there is no runtime fetch, no CSP change and no D1 table.
- Code: `src/lib/plugins/catalog.ts`, `src/components/plugins/*`, `src/app/plugins/page.tsx`, `src/app/plugins/[name]/page.tsx`.

## Update the catalog · อัปเดตรายการ

1. Merge the change in `devstack-plugins` and copy the new full commit SHA.
2. Run `node scripts/sync-plugin-catalog.mjs --commit <sha>` (or update `DEFAULT_COMMIT` and run `npm run plugins:sync`). The script fetches `catalog/plugins.json` at that commit, validates every entry (kebab-case name, https homepage, `https://github.com/owner/repo` source, known category), and rewrites the snapshot.
3. `npm run plugins:check` confirms the snapshot matches the pinned commit. Run `npm test`, then open a PR.

ห้ามเพิ่มข้อความ โลโก้ หรือไฟล์ SKILL.md ที่คัดลอกจาก repo อื่นที่ไม่มีสัญญาอนุญาต เขียนคำอธิบายเองเท่านั้น
