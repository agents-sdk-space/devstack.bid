# Contributing to NVX Stack Builder · การร่วมพัฒนา

Thank you for helping! ขอบคุณที่ร่วมพัฒนา! Issues and pull requests are welcome in **English or Thai**.

## Ground rules

- Be kind — see [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).
- Never commit secrets. Use `.env.local` (git-ignored); document new variables in `.env.example`.
- Commands shown by the app must be **correct, current and non-interactive**. Prefer official docs as the source and link them in the template's `docs`.
- The server must never execute user/AI-provided commands. Keep commands as text.

## Development

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # vitest
npm run lint
npm run typecheck
npm run build        # must pass with zero errors before you open a PR
```

## Adding or changing a Stack Template

1. Add `src/data/templates/<id>.ts` (default export `StackTemplate`) and register it in `src/data/templates/index.ts`.
2. Checklist for every step:
   - [ ] `title`, `explanation`, `expected` (and `osNotes` if relevant) in **both** `en` and `th`
   - [ ] exact `commands` for macOS/Linux; `windows` override when PowerShell differs (activation, `cp`, `chmod`, env vars)
   - [ ] a `verify` command that proves the step worked
   - [ ] correct `kind`: dev servers → `longRunning`; `npm publish` / `twine upload` → `publish`; installers / global changes → `manual`
   - [ ] placeholders (`{{install}}`, `{{add}}`, `{{run}}`, `{{pip}}` …) instead of hard-coded package managers
   - [ ] starter files compile in both TS and JS variants (wrap TS-only syntax in `⟨ ⟩`)
3. Add useful `keywords` in English **and** Thai so the offline planner can find your template.
4. Run it end-to-end on a clean folder:
   ```bash
   npm run export -- <id> --out /tmp/nvx-try --addons typescript,testing
   cd /tmp/nvx-try && bash setup.sh
   ```
   If you can, also try `--pm pnpm`, `--py uv`, and `setup.ps1` on Windows.
5. Update tests if behaviour changes (`tests/`), then `npm test && npm run build`.

## Pull requests

- Keep PRs focused; describe **what** and **why** (screenshots for UI changes).
- Conventional commit messages are appreciated (`feat:`, `fix:`, `docs:`, `template:`).
- By contributing you agree your work is licensed under the MIT License.

## Reporting security issues

Please do not open public issues for vulnerabilities (e.g. a sanitiser bypass). Contact the maintainers privately via the repository's security advisory feature.
