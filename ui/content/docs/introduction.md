# Introduction

Asena is an open-source WhatsApp bot written in **TypeScript** for **[Bun](https://bun.sh)**, built on **[zapo](https://zapo.to)**, a modern implementation of the WhatsApp Web protocol.

It runs on your own computer or server. You link a WhatsApp account to it once, and from then on it answers commands in private chats and groups.

## What it does

- **Group moderation:** welcome and goodbye messages, anti-link, anti-spam, warnings, mute and kick, and per-group command switches.
- **Media:** stickers with your pack name, MP3 conversion, YouTube audio and video, text-to-speech, quote and text stickers.
- **Productivity:** notes, reminders, polls, event cards, status posts and Meta AI answers.
- **Owner controls:** public or private mode, trusted sudo users, feature flags, quiet hours, rate limits, an audit log and backups.
- **Developer friendly:** a command is one `command({...})` call with a typed `ctx`, and the full zapo client is one property away.

## How the pieces fit

| Part | What it is |
|---|---|
| **The bot** | The program you run with `bun start`. It keeps its data in `data/` (SQLite) or Postgres. |
| **asena.fun/pair** | An optional website to link WhatsApp in the browser and get a session ID. |
| **The pairing server** | The open-source Go backend behind the website. You can run your own. |

You never have to use the website: the bot can show its own QR code in the terminal. The website is a convenience for setting up a bot on a machine where scanning a terminal QR code is awkward, such as a remote server.

## Requirements

- Bun 1.4 or newer
- FFmpeg on your `PATH` for audio, video and animated stickers
- A WhatsApp account to link (a spare number is best)

> Asena is not affiliated with WhatsApp. Running unofficial clients can get an account banned, so prefer a number you can afford to lose.

Next: [Getting started](/docs/getting-started).
