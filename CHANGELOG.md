# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.0.0] - 2026-10-19

First release of **Asena**: a rewrite of X-Asena 4 in TypeScript for Bun, on top of [zapo](https://zapo.to) instead of Baileys.

### Changed

- `#menu` is a cleaner sectioned list, greets the user, and hides owner commands from normal users. `#list` is an alias. Command descriptions are shorter.
- zapo logs default to `error` (`ZAPO_LOG_LEVEL`), hiding harmless delivery notices.
- Log lines show the sender without the device suffix.
- Replies use plain symbols (✓ ✕ ! › •) instead of emoji. The ⚡ reaction on every command is replaced by the "typing…" indicator.
- `#ping` answers with one message that is edited to show the latency.
- Comments trimmed to the ones that explain something non-obvious.
- Runtime: Bun ≥ 1.4 instead of Node. TypeScript runs directly, with no build step.
- WhatsApp library: `zapo-js` instead of `baileys`. zapo saves the login automatically.
- Storage: `data/session.db` (login) and `data/bot.db` (settings), using Bun's built-in SQLite and SQL drivers. `better-sqlite3`, `sequelize`, `axios`, `dotenv`, `fluent-ffmpeg` and `google-tts-api` are gone.
- Simpler command API: `command({ name, description, category, run })` with a `ctx` helper object and declarative rules (`adminOnly`, `botAdmin`, `permission`, `flag`, `audit`).
- `#tourl` replaces the misspelled `#toururl`. `#disabled` replaces `#plugins` (alias kept). `#notify` is now an alias of `#mention`.
- `BAILEYS_LOG_LEVEL` is now `ZAPO_LOG_LEVEL`.

### Added

- `#eval` (alias `#>`): run TypeScript inside the bot. Off unless `ENABLE_EVAL=true`, and only numbers in `OWNER_NUMBER` may use it. Every use is audited.
- `#demo <type>`: try event cards, in-place edits, pins, view-once, round video notes, recording indicator, locations, contact cards, link previews, multi-select polls and list menus.
- `#story`: post a status (text with background color and font, or a photo/video), choose who sees it with `--to`, and `#story undo`.
- `#reqnum`: ask a person or chat to share their phone number.
- `#invite`: post this group's invite card (with the group picture), or send it privately to someone.
- `#ai`: ask Meta AI and post its answer in the chat.
- README: "Using zapo", a practical guide to sending every message type, groups, profile, privacy, presence, chats, status, channels, AI bots and events.
- Asena server (Go, separate private repository): pair WhatsApp on a website with a QR code or pairing code and get a `SESSION_ID`. With it, the bot's login and settings are stored on the server, encrypted with a key derived from the session ID (the server keeps only a hash of the ID). The bot syncs every 20 seconds and on shutdown, holds a lease so only one copy runs, and can move to a new machine with nothing but the ID. Admin API (`ADMIN_TOKEN`) to list and revoke sessions. Public stats for active bots, sessions and users. Postgres + Redis, with a Bun worker that runs the pairing with zapo.
- `SESSION_ID`, `ASENA_SERVER` and `SESSION_SYNC_SECONDS` settings in the bot. Without `SESSION_ID`, the bot pairs locally exactly as before.
- `AUTH_DB` (`sqlite`, `postgres`, `redis`, `mongodb`) and `AUTH_DB_URL` choose where a locally paired bot stores its login. `DATABASE_URL` still works as the old name.
- `Dockerfile` and `render.yaml` (free web service with a `/health` check) for running the bot with a `SESSION_ID` on Render.
- Dashboard at app.asena.fun: GitHub and Google sign-in, named bots, live metrics (messages, commands, errors, memory, uptime), activity log, keep-alive jobs, session import and **Refresh session**, which links WhatsApp again while keeping the bot's history and jobs.
- Admin console at admin.asena.fun: username and password login (PBKDF2 hash, `asena-server hash-password`), overview of every account, bot, session and job, revoke and delete.
- Bots with a `SESSION_ID` stop when WhatsApp logs them out, tell the dashboard, and print how to refresh the session, instead of waiting for a QR code nobody can scan. `PORT` starts a `/health` endpoint for hosts like Render.
- One-time import of X-Asena 4 settings from `./database.db`.
- Owner LIDs are looked up on connect, so owner checks work in LID groups.
- The owner can type commands from the bot's own phone. The bot ignores only its own replies.
- Tests: unit tests and an end-to-end test against `@zapo-js/fake-server`.

### Fixed

- The bot could not be installed on current Node versions (`better-sqlite3` failed to build).
- Logging out from the phone left stale credentials, so restarts kept failing. A new QR code is now shown.
- Terminal `R` exited instead of restarting. The `A` wipe confirmation also printed "Unknown command".
- `#ping` always reported about 0 ms.
- `#quote` stickers rendered without text (SVG `foreignObject` is not supported by sharp).
- `#setup` lowercased sticker pack names, and a wizard-set owner was forgotten after a restart.
- Anyone could change the bot language with `#lang`, and anyone could cancel anyone's reminder.
- `#mention` let any member tag the whole group. It is now admin-only.
- Anti-spam posted a warning for every blocked message. It now warns once per window.
- `#policy` accepted unknown names and values. Invalid input is now rejected.
- `#backup full` showed a server file path instead of sending the file.
- Old commands sent while the bot was offline (over 5 minutes) no longer run on reconnect.
- Error details could be posted to the log group twice.

### Removed

- `#role` (RBAC). Its roles were never checked anywhere except for sudo users.

## [X-Asena 4.0.0] - 2026-07-24

Major Baileys **7.0.0-rc13** rewrite on `main` (previous line preserved as `pre-v7`).

### Added

- Lean Baileys socket (no full history sync, offline on connect, safe reconnect)
- Dual auth: **better-sqlite3** (default) or **Postgres** via `DATABASE_URL`
- BotKV settings (mode, sudo, lang, sticker EXIF, group settings)
- System **log group** onboarding (`#setup`, `#createlog`, `#setlog`)
- Media plugins: stickers + EXIF, YouTube (`youtubei.js`), tools, social DLs
- Moderation: welcome/goodbye, antilink, antispam, warn/mute/kick
- Productivity: notes, reminders, polls
- Enterprise: audit, feature flags, RBAC, policies, metrics, job queue, backup
- Optional admin HTTP (`/health`, `/metrics`, `/audit`, …)
- Public/private bot mode and sudo ACL
- Multi-language strings (`en` / `id` / `hi`)

### Changed

- Command prefix and UX helpers (`#menu`, react-ack, typing)
- README rewritten for the v4 architecture

### Security

- User-facing errors stay generic; stacks go to the system log group only
- Spoof mitigations on `messages.upsert` (notify-only, ignore `requestId`)

[Unreleased]: https://github.com/shellhaki/asena/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/shellhaki/asena/releases/tag/v1.0.0
[X-Asena 4.0.0]: https://github.com/Neeraj-x0/X-Asena/releases/tag/v4.0.0
