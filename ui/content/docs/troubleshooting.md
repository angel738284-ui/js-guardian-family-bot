# Troubleshooting

| Problem | What to try |
|---------|-------------|
| No system group | Set `OWNER_NUMBER` and restart, or run `#setlog` in a group you created |
| Media commands fail | Install FFmpeg and make sure `ffmpeg -version` works |
| Bot ignores everyone | Check `#mode`: `private` only answers owner and sudo |
| Owner commands refused in groups | Check `OWNER_NUMBER`; the bot looks up your private group ID (LID) when it connects |
| Social download fails | Expected sometimes; these sites change and block bots |
| Admin HTTP does not start | Set both `ADMIN_HTTP_PORT` and `ADMIN_HTTP_TOKEN` |
| "Taking over; the other copy will stop" | The same session ID was started on a second machine. Only one copy runs at a time; the newest wins |
| "SESSION_ID does not match the stored session" | The ID was not copied completely. Copy it again from where you saved it |
| "Could not load the session: session revoked" | The session was revoked or never used within 24 hours. Pair again |

## Terminal shortcuts

| Key + Enter | Action |
|-----|--------|
| `R` | Reconnect to WhatsApp |
| `Q` | Log out (unlink the device) and exit |
| `A` | Delete all data (login and settings), after a `Y` confirmation |

## Upgrading from X-Asena

- Install Bun and run `bun install`. Node, npm and the old `node_modules` are no longer used.
- **You must link WhatsApp again.** The old Baileys login cannot be reused.
- **Your settings are kept.** On first start, Asena imports mode, sudo, language, notes, warns, reminders, group settings and flags from the old `./database.db` (SQLite only).
- Renamed: `#toururl` → `#tourl`, `#plugins` → `#disabled` (the old name still works), `BAILEYS_LOG_LEVEL` → `ZAPO_LOG_LEVEL`.
- Removed: `#role` (RBAC). Owner and sudo cover the same cases.
