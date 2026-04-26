# Cron schedule

The app exposes seven scheduled endpoints under `/api/v1/cron/*`. Each is gated by `Authorization: Bearer ${CRON_SECRET}` (see `src/lib/auth/cron.ts`).

Set `CRON_SECRET` on Railway → Variables, then create one Cron Job per row below.

| Path                                 | Schedule (UTC)               | Purpose                                                                           | Service               |
| ------------------------------------ | ---------------------------- | --------------------------------------------------------------------------------- | --------------------- |
| `POST /api/v1/cron/inbox-sync`       | `*/5 * * * *`                | Pull unseen Zoho IMAP, attach replies to leads, halt cadences on reply.           | `inbox-sync.ts`       |
| `POST /api/v1/cron/cadences`         | `*/10 * * * *`               | Dispatch approved drip-cadence rows whose `scheduled_for` has arrived.            | `cadences.ts`         |
| `POST /api/v1/cron/post-meeting`     | `0 * * * *`                  | Send "thanks for the time" follow-up for meetings that ended in the last 90 min.  | `post-meeting.ts`     |
| `POST /api/v1/cron/reminders`        | `30 2 * * *` (08:00 IST)     | Bundle overdue `nextActionDue` leads into one email per founder.                  | `reminders.ts`        |
| `POST /api/v1/cron/daily-digest`     | `30 2 * * *` (08:00 IST)     | Morning briefing: meetings today, drafts pending, $ progress, latest questions.   | `daily-digest.ts`     |
| `POST /api/v1/cron/backup`           | `0 2 * * *` (07:30 IST)      | Gzipped JSON snapshot of every mission-critical table → R2 with 30-day retention. | `backup.ts`           |
| `POST /api/v1/cron/nda-expiry`       | `0 3 * * 1` (Mon, 08:30 IST) | Bundle NDAs approaching the 22-month mark into one renewal-review email.          | `nda-expiry.ts`       |
| `POST /api/v1/cron/pre-meeting`      | `0 * * * *`                  | 24-hour-out brief — investor context, recent questions, doc views.                | `pre-meeting.ts`      |
| `POST /api/v1/cron/link-expiry-warn` | `0 4 * * *` (09:30 IST)      | Email investors a fresh 14-day link at day 12 of the cookie TTL.                  | `link-expiry-warn.ts` |

## Sample Railway cron entry

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  https://investor-wornderland-production.up.railway.app/api/v1/cron/inbox-sync
```

## Local testing

`CRON_SECRET` falls back to a localhost-only bypass when unset, so:

```bash
curl -X POST http://localhost:3000/api/v1/cron/post-meeting
```

works against `pnpm dev` without configuring a secret.
