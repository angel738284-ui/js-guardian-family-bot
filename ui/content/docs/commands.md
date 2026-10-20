# Commands

Run `#menu` in WhatsApp for the live list, or `#help <command>` for details. The examples use the default prefix `#`; change it with `PREFIX`.

## General

| Command | Description |
|---------|-------------|
| `#menu` (also `#list`), `#help <command>` | Command list and details |
| `#ping` | Check that the bot answers, with response time |
| `#info` | Details about the chat and message |
| `#status` | Uptime, mode and FFmpeg check (more details for owner and sudo) |
| `#lang [en\|id\|hi]` | Show the language. Owner and sudo can change it. |

## Access (owner and sudo)

| Command | Description |
|---------|-------------|
| `#mode public\|private` | **public**: anyone can use commands. **private**: only owner and sudo; others are ignored. |
| `#sudo list\|add\|del` | Manage trusted users (only the owner can add or remove) |

## Groups

| Command | Who | Description |
|---------|-----|-------------|
| `#groupinfo`, `#admins` | everyone | Group details |
| `#warns [@user]` | everyone | Show warnings |
| `#disabled` | everyone | Commands switched off in this group |
| `#mention [text]` (also `#notify`) | admins | Notify every member |
| `#tagall` | owner, sudo | Tag every member in a numbered list |
| `#promote`, `#demote` | admins | Change admin rights |
| `#gcall`, `#gcall end` | admins | Start a group voice call that rings every member; the bot stays (silent) until everyone leaves. `end` takes the bot off. Needs calls installed |
| `#invite [@user\|number]` | admins | Invite card for this group. Plain `#invite` posts it here; with a person, sends it to them privately. The bot must be admin. |

## Moderation (group admins)

| Command | Description |
|---------|-------------|
| `#groupsetup recommended\|minimal\|off` | Apply a preset |
| `#welcome`, `#goodbye` | Turn on or off, or set the text (`@user`, `@group`, `@count`) |
| `#antilink`, `#antispam` | Delete links or spam (the bot must be admin) |
| `#groupsettings` | Show this group's settings |
| `#warn`, `#unwarn` | Warn a member; they are removed at the warn limit |
| `#mute`, `#unmute`, `#kick` | Mute or remove a member |
| `#disable <cmd>`, `#enable <cmd>` | Switch a command off or on in this group |

Moderation commands work on the member you **@mention** or **reply to**.

## Stickers and media

| Command | Description |
|---------|-------------|
| `#sticker` (also `#s`) | Image or short video to sticker |
| `#take Pack\|Author` (also `#steal`) | Re-label a sticker |
| `#toimg` | Sticker to image |
| `#exif Pack\|Author` | Default sticker pack info (owner and sudo) |
| `#yt`, `#ytmp3` (also `#play`), `#ytmp4` | YouTube details, audio, and video up to 720p |
| `#tomp3` | Video or audio to MP3 |
| `#tourl` (also `#url`) | Upload media and get a link |
| `#quote`, `#ttp`, `#attp` | Quote sticker, text sticker, animated text sticker |
| `#fancy`, `#tts [lang:] text` | Fancy text styles, text to speech |
| `#removebg` | Remove an image background (needs `REMOVEBG_API_KEY`) |
| `#tiktok` (also `#tt`), `#ig` (also `#insta`), `#fb` | Social downloads (best effort; these sites block bots often) |

YouTube limits: about 15 minutes for audio and 10 minutes for video. Downloads wait in a queue (`JOB_CONCURRENCY`).

## Productivity

| Command | Description |
|---------|-------------|
| `#note set\|get\|del\|list` | Personal notes |
| `#remind 10m <text>` | Reminder in this chat (`30s`, `10m`, `2h`, `1d`) |
| `#remind call 10m <text>` | Same, and the bot also calls you, up to 3 times until you pick up or decline (needs calls installed) |
| `#reminders`, `#cancelremind <id>` | List or cancel reminders |
| `#poll Question \| A \| B` | Create a poll |

## System and operations

Most of these work best in the system group.

| Command | Description |
|---------|-------------|
| `#setup`, `#createlog`, `#setlog` | Setup wizard and the system group |
| `#audit [action] [count]` | Recent sensitive actions (system group only) |
| `#flag list`, `#flag <name> on\|off` | Global feature switches: `media`, `ytdl`, `social`, `stickers`, `moderation`, `broadcast`, `maintenance` |
| `#policy list`, `#policy <name> <value>` | Rules for normal users: `quietHoursStart`, `quietHoursEnd`, `rateLimitPerUser`, `allowMediaCommands`, `blockBroadcast` |
| `#backup`, `#backup full` | Export settings (`full` also sends the login database, only in the system group) |
| `#metrics` | Runtime counters and the job queue |
| `#broadcast <text>` | Send a message to every group (owner) |
| `#story [options] <text>` (also `#poststatus`) | Post a WhatsApp status. Options: `--color purple\|#RRGGBB`, `--font bold\|serif\|script\|...`, `--to 234801...,234809...`. Reply to a photo or video to post it. `#story undo` deletes the last one. Without `--to`, the owners and the people in the current chat see it. |
| `#reqnum [@user\|number]` | Ask someone (or this chat) to share their phone number |
| `#cmdlist` | Every command name, including hidden ones |
| `#eval <code>` (also `#>`) | Run TypeScript inside the bot. Owner numbers only, needs `ENABLE_EVAL=true` |

## Admin HTTP API (optional)

Set `ADMIN_HTTP_PORT` and `ADMIN_HTTP_TOKEN`, then call the endpoints with `Authorization: Bearer <token>`.

| Endpoint | Token | Description |
|----------|-------|-------------|
| `GET /health` | no | Connection, mode, setup and queue status |
| `GET /metrics` | yes | JSON metrics (`?format=prom` for Prometheus) |
| `GET /audit?limit=50&action=kick` | yes | Audit entries |
| `GET /flags`, `GET /policies` | yes | Current flags and policies |
