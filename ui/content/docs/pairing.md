# Pairing and session IDs

Linking (pairing) connects the bot to a WhatsApp account, the same way WhatsApp Web is linked. You can do it in the terminal or on [asena.fun/pair](/pair).

## Terminal or website?

| | Terminal | Website |
|---|---|---|
| Where you scan | The QR code printed by `bun start` | The QR code on asena.fun |
| Good for | Your own computer | Remote servers without an easy way to view a QR code |
| Talks to the pairing server | Never | Stores the encrypted session there and sends heartbeats |
| Setting | Leave `SESSION_ID` empty | `SESSION_ID=ASENA_...` |

## What happens when you pair on the website

1. The server starts a fresh WhatsApp client and shows its QR code or pairing code.
2. You link it from your phone. The server waits a few seconds so WhatsApp finishes setting up the device, then disconnects. It never reads or answers messages.
3. The login is saved **encrypted with a key derived from your session ID**. The server keeps only a hash of the ID, so it cannot decrypt anything without you.
4. You put the session ID in `.env` and run `bun start`. The bot downloads the encrypted session, decrypts it locally and connects.
5. While it runs, the bot uploads its login and settings (encrypted) every 20 seconds and when it stops.

Session IDs that are never used expire after 24 hours.

## Using the session ID

```env
SESSION_ID=ASENA_k3J9...
```

- **Every start:** the bot prints `Session loaded from the Asena server` and works on a local copy in `data/`.
- **Moving to another machine:** start the bot there with the same session ID. Nothing else to copy; your notes, settings and login come along.
- **One copy at a time:** if you start a second copy, it takes over and the first one stops by itself.
- `AUTH_DB` is ignored in this mode.

## Keep it secret

Anyone who has your session ID can run this WhatsApp account. Do not share it, paste it in chats, or commit `.env` to Git.

If a session ID leaks, unlink the device on your phone (*Linked devices*) and pair again. The old session stops working.

## Stats and heartbeats

Bots paired on the website send a heartbeat every minute with their version. That is how [the stats page](/stats) counts bots online. Phone numbers are stored only as salted hashes, plus a masked form (`2348••••••78`) for the operator.

Bots paired in the terminal never contact the server.

## Pairing problems

| Problem | What to try |
|---|---|
| QR code expired | It refreshes automatically. If pairing timed out, start again. |
| "This account requires a passkey" | Some accounts must confirm new devices with a passkey. That is not supported yet; pair in the terminal on a machine where you can complete the prompt, or use another number. |
| "Too many requests" | You can start 10 pairings per hour per network. Wait and try again. |
| Pairing code not accepted | Check the number includes the country code, and that you typed the code on the phone with that number. |
