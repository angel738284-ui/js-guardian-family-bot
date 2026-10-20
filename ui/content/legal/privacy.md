# Privacy policy

*Last updated: October 20, 2026*

This policy covers the services run at **asena.fun**: the website, the pairing page (asena.fun/pair), the dashboard (app.asena.fun) and the Asena server (api.asena.fun). It does not cover copies of Asena that other people host themselves.

Asena is open source. Everything described here can be checked in the [source code]({{github}}).

## The short version

- We never receive the text of your WhatsApp messages, your chats or your contacts.
- Your WhatsApp login is stored encrypted with a key made from your session ID. We keep only a hash of that ID, so we cannot decrypt it.
- We do not sell data, show ads or use analytics trackers.
- You can delete your bots and your account at any time.

## What we collect and why

### If you only run the bot on your own machine

If you link WhatsApp in the terminal and do not set a `SESSION_ID`, the bot never contacts our server. We receive nothing.

### When you pair on asena.fun/pair or in the dashboard

To link a device, our server briefly runs a WhatsApp client that shows you a QR code or pairing code. Once you link it, the server saves the login and disconnects. It does not read or send messages.

We store:

| Data | Why | How |
|---|---|---|
| WhatsApp login (device keys) | So your bot can sign in wherever it runs | Encrypted with AES-256-GCM, using a key derived from your session ID |
| Session ID | To recognize your bot | Only a SHA-256 hash; the ID itself is shown to you once and not kept |
| Phone number | To count unique users and show you which number a bot uses | A salted hash, plus a masked form such as `2348••••••78` |
| How you linked (QR or code) and when | Support and stats | Plain |

Session IDs that are never used are revoked after 24 hours, and their login is deleted.

### While a bot runs with a session ID

The bot uploads an **encrypted** copy of its login and its settings (for example notes, reminders and group settings) about every 20 seconds, so it can restart on a new machine. We cannot read this copy.

Every 30 seconds it also sends a heartbeat with:

- counts of messages received and sent, commands run and errors since the last heartbeat
- the names of the commands that ran (for example `sticker`), not who ran them or in which chat
- memory use, uptime, bot version, the kind of host (for example Render or Linux) and, if it has one, its public URL
- connection events such as connected, disconnected or logged out

These power the dashboard and the public [stats page](/stats). No message text, chat names, group names or contact numbers are sent.

### When you sign in to the dashboard

You sign in with GitHub or Google. We receive and store your account ID at that provider, your name, your email address (if the provider shares it) and your avatar URL. We do not get your password or access to anything else in your account.

We also store what you create: bot names, keep-alive jobs (the URLs you enter and their results) and your bots' metrics.

### Cookies

| Cookie | Purpose | Lifetime |
|---|---|---|
| `asena_login` | Keeps you signed in to the dashboard | 30 days, or until you sign out |
| `asena_oauth` | Protects the sign-in redirect | 10 minutes |

Both are strictly necessary. We use no advertising or analytics cookies.

### Technical data

Your IP address is used for rate limits (for example, how many pairings one network may start per hour) and is kept for at most an hour for that purpose. Our server logs may briefly contain IP addresses for security and troubleshooting.

## How long we keep it

| Data | Kept |
|---|---|
| Per-minute and per-hour metrics | 30 days |
| Bot activity log | 90 days |
| Keep-alive job results | 7 days |
| Encrypted session | Until you revoke the session, delete the bot, or it expires unused after 24 hours |
| Account | Until you delete it |

## Who else is involved

- **GitHub** and **Google**, only when you choose to sign in with them.
- Our **hosting provider**, which runs the servers and databases.
- **WhatsApp**, because your bot connects to it like WhatsApp Web does. WhatsApp's own privacy policy applies to that.

We do not sell or share your data with anyone else, except when the law requires it.

## Your choices

- **Revoke a session** in the dashboard: the running bot stops and its stored login is deleted.
- **Delete a bot**: its sessions are revoked and its metrics, activity log and jobs are deleted.
- **Delete your account** from the menu in the dashboard: everything above is deleted for all your bots, and you are signed out.
- **Unlink the device** in WhatsApp under *Linked devices* at any time.

To ask what we hold about you, or for anything this page does not cover, contact us at {{contact}}.

## Security

Logins are encrypted, session IDs are hashed, and phone numbers are stored as salted hashes. The dashboard cookie is `HttpOnly` and only accepted from our own pages. If you find a security problem, please [report it privately]({{github}}/security/advisories/new).

## Children

Asena is not meant for children under 13, and we do not knowingly collect their data.

## Changes

If we change this policy, we will update the date at the top. Important changes will also be shown in the dashboard.
