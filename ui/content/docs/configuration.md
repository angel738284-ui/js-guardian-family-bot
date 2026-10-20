# Configuration

All settings live in `.env`. Bun loads it automatically.

| Variable | Default | Description |
|----------|---------|-------------|
| `OWNER_NUMBER` | _(empty)_ | Owner phone number(s), comma-separated, with country code and no `+`. Needed for the system group. |
| `SUDO` | _(empty)_ | Extra trusted numbers. You can also add them later with `#sudo`. |
| `PREFIX` | `#` | Command prefix |
| `BOT_MODE` | `public` | Start mode, used only on first start: `public` or `private` |
| `BOT_LANG` | `en` | Start language: `en`, `id` or `hi` |
| `AUTH_DB` | `sqlite` | Where the WhatsApp login is stored: `sqlite`, `postgres`, `redis` or `mongodb`. With `postgres`, bot settings go there too; otherwise they stay in `data/bot.db`. Ignored with `SESSION_ID`. |
| `AUTH_DB_URL` | _(empty)_ | Connection URL for `postgres`, `redis` or `mongodb` (add `?sslmode=require` for hosted Postgres) |
| `DATABASE_URL` | _(empty)_ | Old name for `AUTH_DB_URL`. A `postgres://` URL here still selects Postgres. |
| `DATA_DIR` | `./data` | Folder for the SQLite files |
| `SESSION_ID` | _(empty)_ | Session ID from [asena.fun/pair](https://asena.fun/pair). When set, the login and settings are stored on the Asena server, encrypted with this ID. |
| `ASENA_SERVER` | `https://api.asena.fun` | Server used with `SESSION_ID` (change it if you run your own) |
| `SESSION_SYNC_SECONDS` | `20` | How often a `SESSION_ID` bot uploads changes |
| `SESSION_HEARTBEAT_SECONDS` | `30` | How often a `SESSION_ID` bot reports metrics to the dashboard |
| `PORT` | _(empty)_ | Answer HTTP on this port (`/health`), so hosts like Render see the bot as up and keep-alive jobs can wake it. Render sets it for you. |
| `PUBLIC_URL` | `RENDER_EXTERNAL_URL` | The bot's public address, shown in the dashboard to suggest a keep-alive job |
| `PAIRING_NUMBER` | _(empty)_ | Use a pairing code in the terminal instead of a QR code |
| `STICKER_PACKNAME` / `STICKER_AUTHOR` | `Asena` | Default sticker pack info |
| `REMOVEBG_API_KEY` | _(empty)_ | API key for `#removebg` |
| `ENABLE_EVAL` | `false` | Turn on `#eval` (owner numbers only). See [Testing with #eval](#testing-with-eval). |
| `LOG_LEVEL` | `info` | Bot logs: `error`, `warn`, `info` or `debug` |
| `ZAPO_LOG_LEVEL` | `error` | zapo logs: `trace`, `debug`, `info`, `warn` or `error` |
| `JOB_CONCURRENCY` | `1` | How many heavy media jobs (YouTube) run at the same time |
| `ERROR_ALERT_THRESHOLD` | `8` | Errors per minute before an alert goes to the system group |
| `TENANT_ID` | `default` | Label used in metrics and backups |
| `ADMIN_HTTP_PORT` / `ADMIN_HTTP_HOST` / `ADMIN_HTTP_TOKEN` | off / `127.0.0.1` / _(required)_ | Optional admin HTTP API |

## Storage

| `AUTH_DB` | WhatsApp login | Bot settings |
|---|---|---|
| `sqlite` (default) | `data/session.db` | `data/bot.db` |
| `postgres` | `zapo_*` tables | `bot_kv` table |
| `redis` | `asena:*` keys | `data/bot.db` |
| `mongodb` | collections in the URL's database (default `asena`) | `data/bot.db` |
| any, with `SESSION_ID` | Asena server, encrypted (local working copy in `data/`) | same |

SQLite and Postgres use drivers that ship with Bun, so nothing needs to be compiled. With Redis, turn on persistence (AOF or RDB) and do not use an eviction policy, or the login can disappear.
