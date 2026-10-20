# Security Policy

## Supported versions

| Version | Supported |
|---------|-----------|
| `1.x` (`main`, Bun + zapo) | Yes |
| X-Asena 4.x and older (Baileys) | No, see [X-Asena](https://github.com/Neeraj-x0/X-Asena) |

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security problems.

Report privately to:

- **GitHub:** [private security advisory](https://github.com/shellhaki/asena/security/advisories/new)
- Or use GitHub **Private vulnerability reporting** on this repository if enabled

Include:

1. Description of the issue and impact
2. Steps to reproduce or a proof of concept
3. Affected version / commit if known
4. Any suggested fix (optional)

You should receive an acknowledgement within **7 days**. We will work on a fix
and coordinate disclosure when appropriate.

## Please do not

- Share session files (`data/session.db`, `data/bot.db`), auth keys, or `.env` contents
- Post exploit details in public issues, Discord, or PRs before a fix
- Use vulnerabilities against third-party WhatsApp accounts or bots

## Hardening tips for operators

- Keep `OWNER_NUMBER` set; use `#mode private` when the bot is not meant for the public
- Restrict `#broadcast`, `#backup`, and admin HTTP (`ADMIN_HTTP_TOKEN`, bind `127.0.0.1`)
- Never commit `.env`, session DBs, or backup JSON with secrets
- Rotate tokens if a log or backup may have leaked
