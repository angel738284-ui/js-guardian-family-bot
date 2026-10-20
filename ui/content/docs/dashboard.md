# Dashboard

[app.asena.fun](https://app.asena.fun) is where you manage bots that use a session ID: name them, watch them live, keep them awake, and link WhatsApp again without starting over. Sign in with GitHub or Google. The dashboard only stores your name and avatar.

Bots that you pair in the terminal (no `SESSION_ID`) do not appear here.

## Bots and sessions

A **bot** is the named record you see in the list, such as *Shop support*. A **session** is one WhatsApp link for that bot, with its own session ID.

A bot keeps its name, metrics, activity log and keep-alive jobs when its session changes. That is what **Refresh session** is for.

| Action | What happens |
|---|---|
| **New bot** | Name it, then link WhatsApp with a QR code or pairing code. You get a session ID. |
| **Import session ID** | Paste an ID from [asena.fun/pair](/pair). The running bot keeps going and shows up here. |
| **Refresh session** | Link WhatsApp again. You get a new session ID, and the old one stops working. |
| **Revoke session** | The running bot stops within a minute and its ID stops working. |
| **Delete bot** | Revokes the session and deletes the bot's history and jobs. |

The session ID is shown once, right after linking. Copy it then. The server keeps only a hash of it, so nobody can show it to you again.

## Status

| Status | Meaning |
|---|---|
| Online | Running and connected to WhatsApp |
| Connecting | Running, but the WhatsApp connection is down right now |
| Offline | Not running, or asleep on a free host |
| Not started | Linked, but no bot has used the session ID yet. Unused IDs expire after 24 hours. |
| Logged out | WhatsApp unlinked the device. Refresh the session. |
| Expired / Revoked | The ID no longer works. Refresh the session. |

## Live metrics

A running bot sends a heartbeat every 30 seconds with:

- messages received and sent, commands run and errors since the last heartbeat
- which commands ran (names only)
- memory use, uptime, bot version and host (Render, Railway, Linux...)

The dashboard updates as heartbeats arrive. The chart shows messages per minute, hour or day for the last hour, day, week or month. Message text, chat names and phone numbers of contacts are never sent.

Metrics are kept for 30 days and the activity log for 90 days.

## Keep-alive jobs

A keep-alive job opens a URL on a schedule, from every 5 minutes to once a day. Use it to stop hosts like Render from putting the bot to sleep: see [Deploy on Render](/docs/deploy-render).

- When the bot runs on Render, the dashboard suggests its `/health` URL. One click adds a job every 10 minutes.
- Elsewhere, set `PORT` (and `PUBLIC_URL`) so the bot answers HTTP, then add the URL yourself.
- Up to 5 jobs per bot. Only public `http` and `https` addresses can be pinged.

Each job shows its last result and a bar for each of its last 30 runs.

## Session events

The bot reports when it connects, loses the connection, stops, is replaced by another copy, or is logged out from the phone. These show up under *Activity*.

When WhatsApp logs a session out, the server marks it immediately, so a restarting host does not keep retrying it, and the bot shows **Logged out** with a **Refresh session** button.
