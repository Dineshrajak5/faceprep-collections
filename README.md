# FACE Prep — Invoicing & Collections Platform

Mobile-friendly, password-protected receivables platform. The Google Sheet feeds the
financials; the sales team logs collection follow-ups (stage, contact, payment deadline,
next follow-up date, conversation log) against each invoice. Follow-ups live in Supabase
and are joined to invoices by Proforma Invoice #, so a sheet refresh never erases them.

## Files
- `index.html`          — dashboard (Overview / Follow-up Tracker / Reminders) + follow-up drawer
- `login.html`          — branded sign-in
- `middleware.js`       — gates everything behind login (allows /login, /api/auth, /api/cron)
- `package.json`        — declares CommonJS (silences the build warning)
- `vercel.json`         — clean URLs, security headers, daily cron
- `supabase_schema.sql` — run once to create the tables
- `lib/sheetParse.js`   — server-side sheet fetch + parse + cache
- `api/auth.js`         — login: verifies password, sets signed session cookie
- `api/logout.js`       — clears the session cookie
- `api/sheet.js`        — GET cached invoices; POST = manual refresh (Outstanding tab)
- `api/collections.js`  — GET cached transactions; POST = manual refresh (Collections tab)
- `api/cron.js`         — daily auto-refresh (Vercel Cron)
- `api/updates.js`      — follow-up read/write (add / edit / delete notes, save meta)

## Environment variables (Vercel → Settings → Environment Variables)
| Variable | Value |
|---|---|
| `SUPABASE_URL` | Supabase Project URL, `https://….supabase.co` (no trailing slash) |
| `SUPABASE_SERVICE_KEY` | Supabase secret key (`sb_secret_…`) — server only |
| `DASHBOARD_PASSWORD` | team login password |
| `SESSION_SECRET` | long random string (`openssl rand -base64 32`) |
| `SHEET_CSV_URL` | published CSV link of the **Outstanding** tab (Publish to web → CSV) |
| `SHEET_COLLECTIONS_CSV_URL` | published CSV link of the **Collections** tab (same workbook, that tab's CSV) |
| `CRON_SECRET` | long random string; Vercel sends it to the daily cron so only it can trigger refresh |

After changing any variable, **redeploy** (variables only apply to new deployments).

## Setup
1. Supabase → SQL Editor → run `supabase_schema.sql` (creates invoice_updates,
   invoice_activity, sheet_cache).
2. Publish the sheet tab to the web as CSV; put that link in `SHEET_CSV_URL`.
3. Set all six env vars above, redeploy.
4. Log in → the data loads from the backend sheet automatically (no manual connect).

## Sheet refresh
- **Automatic:** the cron in `vercel.json` runs daily. Schedule `31 18 * * *` is **UTC**,
  which equals **12:01 AM IST**. Change it if you're in another timezone.
  (On Vercel Hobby, cron runs roughly once a day and timing may not be exact; Pro is precise.)
- **Manual:** the **⟳ Refresh** button in the header pulls the sheet on demand.
- The header shows **last synced** time and whether it's on the live sheet or the offline snapshot.

## Notes
- Login is one shared team password; the "logged by" name on notes is typed, not verified.
  Supabase Auth would add real per-user identity later (the activity table has an `author` column ready).
- Conversation notes are append-only rows, with edit/delete per entry.
- If you created the tables before `next_followup` existed:
  `alter table invoice_updates add column if not exists next_followup date;`
