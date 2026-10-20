# Deploy on Render

Render can run Asena for free. Render's free services have no disk that survives a restart, so the bot keeps its login and settings on the Asena server with a **session ID**, and they come back after every restart.

## What you need

- A WhatsApp number for the bot
- A free [Render](https://render.com) account
- An Asena account at [app.asena.fun](https://app.asena.fun) (sign in with GitHub or Google)

## 1. Create the bot and link WhatsApp

1. Open [app.asena.fun](https://app.asena.fun) and choose **New bot**. Give it a name.
2. Scan the QR code with the bot's phone (*WhatsApp → Settings → Linked devices → Link a device*), or use a pairing code.
3. Copy the **session ID**. It is shown only once.

You can also pair on [asena.fun/pair](/pair) without an account and import the session ID into the dashboard later.

## 2. Deploy

Click **Deploy to Render** in the dashboard, or open:

```text
https://render.com/deploy?repo=https://github.com/shellhaki/asena
```

Render reads `render.yaml` from the repository and asks for:

| Setting | Value |
|---|---|
| `SESSION_ID` | The ID from step 1 |
| `OWNER_NUMBER` | Your number with country code, no `+`, e.g. `2348012345678` |

Render builds the Docker image (Debian with Bun, Node.js and FFmpeg) and starts the bot. Voice calls (`#remind call`, `#gcall`) work there too: the call audio runs in a small Node.js helper the bot starts by itself. In the logs you should see:

```text
✓ Session loaded from the Asena server
✓ Connected to WhatsApp
```

Prefer to set it up by hand? Create a **Web Service** from your fork, choose **Docker**, set the health check path to `/health`, and add the two environment variables.

## 3. Keep it awake

A free web service goes to sleep after 15 minutes without HTTP traffic. A sleeping bot does not answer WhatsApp.

The bot answers on `/health` at its Render URL (Render sets `PORT` and `RENDER_EXTERNAL_URL`, and the bot reports that URL to the dashboard). In the dashboard, open the bot and click **Add, every 10 min** under *Keep-alive jobs*. The Asena server then opens `https://<your-service>.onrender.com/health` every 10 minutes.

The small bars under a job show its last 30 runs. A red bar means the ping failed or timed out; Render can take up to a minute to wake a service, so an occasional red bar right after a deploy is normal.

Free instance hours are limited per month. One bot kept awake all month fits; several may not. A paid instance never sleeps, so it needs no keep-alive job.

## Restarts and redeploys

Every restart, redeploy or wake-up starts with an empty disk. The bot downloads its encrypted session, works on a local copy, and uploads changes every 20 seconds and when Render stops it. Notes, settings and the WhatsApp login all survive.

During a deploy Render briefly runs the old and new copy together. The new copy takes over the session and the old one stops by itself.

## If WhatsApp logs the bot out

If someone removes the device under *Linked devices*, the bot stops and prints:

```text
WhatsApp logged this session out (unlinked from the phone).
   Open https://app.asena.fun, choose Refresh session, and put the new SESSION_ID in your settings.
```

1. In the dashboard, open the bot and click **Refresh session**. Link WhatsApp again.
2. In Render, open the service → **Environment**, replace `SESSION_ID` with the new ID, and save. Render restarts the bot.

The bot keeps its name, metrics history and keep-alive jobs. Settings stored by the old session (notes, group settings) start fresh, because they were encrypted with the old ID.

## Troubleshooting

| Problem | Fix |
|---|---|
| Deploy fails health check | Check the logs for `Startup failed`. A wrong or revoked `SESSION_ID` stops the bot before it listens. |
| "This session was replaced by a newer one" | You refreshed the session. Put the new ID in Render. |
| Bot answers late or not at all | It was asleep. Add a keep-alive job, or check that the job's bars are green. |
| "This session is running on another machine" in a loop | Two services use the same `SESSION_ID`. Delete one, or give each bot its own session. |
