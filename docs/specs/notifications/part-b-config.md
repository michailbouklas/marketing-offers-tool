# Part B — Configuration

Environment variables for the offer-notification digest (consumer). Add these to
`.env` (the `.env.example` file is credential-protected, so they are documented
here). The digest self-disables and logs a reason if the required ones are unset,
so this is safe to leave unconfigured in environments that shouldn't email.

| Var                        | Required | Default     | Purpose                                                                                                                  |
| -------------------------- | -------- | ----------- | ------------------------------------------------------------------------------------------------------------------------ |
| `SCRAPER_DATABASE_URL`     | yes      | —           | Read-only connection to the scraper Postgres (`aggregator_scraper`) holding `offer_notification_queue` and `restaurant`. |
| `SMTP_HOST`                | yes      | —           | SMTP server host for digest emails.                                                                                      |
| `SMTP_PORT`                | no       | `587`       | SMTP port.                                                                                                               |
| `SMTP_USER`                | no       | —           | SMTP username. Omit for relays that accept unauthenticated mail from trusted hosts.                                      |
| `SMTP_PASSWORD`            | no       | —           | SMTP password (used only when `SMTP_USER` is set).                                                                       |
| `SMTP_SECURE`              | no       | `false`     | `true` to use TLS on connect (typically port 465).                                                                       |
| `NOTIFICATIONS_FROM_EMAIL` | yes      | —           | `From` address for digest emails.                                                                                        |
| `NOTIFICATIONS_CRON`       | no       | `0 6 * * *` | Cron expression for the daily digest (in-process scheduler).                                                             |
| `NOTIFICATIONS_BATCH_SIZE` | no       | `500`       | Queue rows processed per batch; the cursor advances per batch.                                                           |
| `NOTIFICATIONS_ENABLED`    | no       | `true`      | Master switch; set `false` to keep the digest off even when configured.                                                  |

**"Required" means required for the digest to run.** When any of
`SCRAPER_DATABASE_URL`, `SMTP_HOST`, or `NOTIFICATIONS_FROM_EMAIL` is missing (or
`NOTIFICATIONS_ENABLED=false`), `hasNotificationsTransport()` returns false: the
scheduler does not start and the manual-trigger route returns a skip.

## Example `.env` block

```dotenv
# --- Offer Notification Digest (Part B) ---
SCRAPER_DATABASE_URL="postgresql://reader:password@scraper-host:5432/aggregator_scraper"
SMTP_HOST=""
SMTP_PORT="587"
SMTP_USER=""
SMTP_PASSWORD=""
SMTP_SECURE="false"
NOTIFICATIONS_FROM_EMAIL="offers@example.com"
NOTIFICATIONS_CRON="0 6 * * *"
NOTIFICATIONS_BATCH_SIZE="500"
NOTIFICATIONS_ENABLED="true"
```

## CLI (no auth)

Run the digest once from the terminal, bypassing the HTTP endpoint and its
session auth. Runs via `vite-node` with a script-only Vite config
(`vite.config.script.ts`) so SvelteKit's `$lib` / `$env` / `$app` modules
resolve outside the dev server.

```bash
bun run digest                 # send the digest now (advances the cursor)
bun run digest --dry-run       # preview who WOULD be emailed; sends nothing; cursor untouched
bun run digest --scraper-url=postgresql://user:pass@host:5432/aggregator_scraper
```

`--dry-run` reads + matches + consolidates and logs each would-be recipient, but
never sends mail and never moves the cursor — safe to run repeatedly. It needs
only `SCRAPER_DATABASE_URL` (+ the app `DATABASE_URL`), not SMTP.

`--scraper-url` overrides `SCRAPER_DATABASE_URL` for that run. Note: the
notification config reads `process.env` **ahead of** the `.env` file, so a real
environment value or this flag wins over a value pinned in `.env`.

## Manual trigger

`POST /api/admin/notifications/run-digest` (admin + `notifications:run` capability,
held by `superUser`) runs one digest cycle on demand and returns the run summary,
or `409` if a run is already in progress. Used for the verification checklist in
`instructions.md` §12.
