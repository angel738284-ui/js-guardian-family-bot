# Getting started

This page takes you from nothing to a bot answering `#ping`.

## 1. Install the tools

```bash
# Bun (macOS / Linux)
curl -fsSL https://bun.sh/install | bash

# FFmpeg
brew install ffmpeg          # macOS
sudo apt install ffmpeg      # Debian / Ubuntu
choco install ffmpeg         # Windows
```

## 2. Get Asena

```bash
git clone https://github.com/shellhaki/asena.git
cd asena
bun install
cp .env.example .env
```

Open `.env` and set your own number as the owner, with country code and no `+`:

```env
OWNER_NUMBER=2348012345678
```

## 3. Link WhatsApp

Pick one of the two ways.

### On the website

1. Open [asena.fun/pair](/pair).
2. Scan the QR code with the phone that has the bot's number, or use a pairing code.
3. Copy the session ID and add it to `.env`:

```env
SESSION_ID=ASENA_...
```

### In the terminal

Leave `SESSION_ID` empty. When you start the bot, it prints a QR code. Scan it under *WhatsApp → Settings → Linked devices → Link a device*.

To use a pairing code instead, set `PAIRING_NUMBER` to the bot's number and restart.

## 4. Start the bot

```bash
bun start
```

You should see:

```text
✓ Database ready
✓ 68 commands loaded
✓ Connected to WhatsApp
✓ Created system log group …
```

Send `#ping` to the bot. It answers with `Pong` and the response time.

## 5. Finish setup

The bot creates a private group called **Asena · System** with you in it. Run `#setup` there to pick the mode, language and sticker pack. Error details and alerts are posted only in this group.

In a normal group, make the bot an admin and run `#groupsetup recommended` for welcome messages, anti-link and anti-spam.

## Keep it running

`bun start` stops when you close the terminal. On a server, use a process manager:

```bash
# pm2
bun add -g pm2
pm2 start "bun start" --name asena
pm2 save

# or a systemd service with: ExecStart=/home/you/.bun/bin/bun start
```

Next: [Pairing and session IDs](/docs/pairing) explains what the session ID is and how it is protected.
