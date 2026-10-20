# Contributing to Asena

Thanks for your interest in improving Asena. This guide covers how to set up the project, make changes, and open a pull request.

## Code of conduct

Participation is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). Be respectful and constructive.

## Before you start

1. Search [existing issues](https://github.com/shellhaki/asena/issues) and PRs to avoid duplicates.
2. For larger features, open an issue first so we can agree on scope.
3. Read the [README](README.md) for architecture, env vars, and command overview.
4. Never commit secrets (`.env`, session DBs, API keys, admin tokens).

## Development setup

**Requirements:** Bun ≥ 1.4, FFmpeg on `PATH`, Git.

```bash
git clone https://github.com/shellhaki/asena.git
cd asena
bun install
cp .env.example .env
# Edit .env — at least set OWNER_NUMBER
bun dev
```

Login via QR in the terminal, or set `PAIRING_NUMBER` for pairing-code login.

Useful paths:

| Path | Role |
|------|------|
| `src/plugins/` | Commands (each file calls `command({...})`) |
| `src/bot/` | zapo connection, session store, send helpers |
| `src/core/` | Command registry, message parser, `ctx`, handler |
| `src/features/` | Access, groups, moderation, setup, flags, policies, audit, metrics, queue |
| `src/db/` | Bot settings storage |
| `src/lib/` | Small shared helpers |
| `tests/` | Unit tests and the end-to-end test |

## Branching and commits

1. Fork the repo (or create a branch from `main`).
2. Create a focused branch:

   ```bash
   git checkout -b feat/short-description
   ```

3. Keep commits small and meaningful. Prefer messages like:

   - `feat: add warn reset for all members`
   - `fix: handle missing FFmpeg in status`
   - `docs: clarify pairing login`

4. Do not mix unrelated refactors with feature work in the same PR.

## Coding guidelines

- **TypeScript, strict mode.** Keep code easy to read: plain functions, clear names, short comments that explain *why*.
- Prefer the `ctx` helpers (`ctx.reply`, `ctx.withTyping`, `ctx.downloadMedia`) and existing modules (`writeAudit`, `systemLog`) over new one-offs.
- **User chats:** short, friendly errors only. Thrown errors are caught by the handler and their details go to the **system log group**.
- **Plugins:** `command({ name, description, category, run })` from `src/core/command.ts`. Put rules (`adminOnly`, `botAdmin`, `permission`, `flag`) in the definition instead of checking them by hand.
- **Heavy work** (YouTube downloads, big media): use `enqueueJob` from `src/features/queue.ts`.
- Avoid new native dependencies unless necessary; document them in the README.
- Do not re-enable full WhatsApp history sync or dump large objects to the console.

## Testing your change

Run `bun run typecheck` and `bun test`. The end-to-end test links the bot to zapo's fake WhatsApp server, so it needs no phone. Please add a test for new behaviour where you can. Then check by hand:

1. Bot starts with `bun start` / `bun dev`.
2. Your command appears in `#menu` (unless `hidden`).
3. Happy path works in a test chat/group.
4. Failure paths return a clear message (no crash).
5. Owner-only / private-mode behaviour still holds if you touched ACL.
6. For media: confirm FFmpeg behaviour if relevant.

## Pull requests

1. Push your branch and open a PR against **`main`**.
2. Fill in the PR template: what / why / how tested.
3. Link related issues (`Fixes #123`).
4. Keep the diff reviewable. Split huge changes if asked.
5. Expect feedback; force-pushes on your feature branch are fine while reviewing.

Legacy history before Baileys v7 lives on the `pre-v7` branch. New work targets **`main`**.

## Reporting bugs

Use a bug issue (or the bug template) and include:

- Asena / Bun / OS versions
- zapo-js version (`package.json`)
- Steps to reproduce
- Expected vs actual behaviour
- Whether the failure shows in the **system log group**
- Redacted logs only (no session keys, tokens, or phone numbers you must not share)

Security issues: see [SECURITY.md](SECURITY.md) — do not open a public issue for vulnerabilities.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
