# FACE Prep — Invoicing & Collections Platform

A mobile-friendly, password-protected receivables dashboard where the sales team logs
collection follow-ups (contact person, deadline, next steps, conversation log) against
each outstanding invoice.

## How follow-up data survives sheet refreshes (the key design)
- The **Google Sheet** is the source of truth for **financials** (scraped/refreshed, read-only here).
- A **separate Supabase database** is the source of truth for **team follow-ups** (read/write).
- They are joined by the **Proforma Invoice #** — verified unique and present on every row.
- On load, the app fetches fresh sheet data **and** all follow-ups, then merges them by key.
  Re-scraping the sheet updates the money figures but never touches the follow-up tables,
  so every note, deadline and conversation stays attached to the same invoice.

## Files
- `index.html`          — dashboard + invoice follow-up drawer
- `login.html`          — branded sign-in
- `api/auth.js`         — login: verifies password, sets signed session cookie
- `api/updates.js`      — follow-up read/write (Supabase)
- `middleware.js`       — gates everything behind login
- `supabase_schema.sql` — run once to create the two tables
- `vercel.json`         — static config + security headers

## Setup
1. **Supabase**: create a project → SQL Editor → paste & run `supabase_schema.sql`.
   From Project Settings → API, copy the **Project URL** and the **service_role key**.
2. **Vercel**: deploy this folder (Framework Preset: Other, no build command).
3. **Vercel → Settings → Environment Variables**, add:
   - `DASHBOARD_PASSWORD`   — team login password
   - `SESSION_SECRET`       — long random string (`openssl rand -base64 32`)
   - `SUPABASE_URL`         — your Supabase Project URL
   - `SUPABASE_SERVICE_KEY` — your service_role key (server-only; never in the browser)
4. **Redeploy**.

When the DB env vars are present, the header shows "● Saving to database" and edits persist.
Opened without them (or locally / in preview), it runs in "Demo mode" — the UI works but
changes are not saved.

## Notes & next steps
- Login is one shared team password. For per-user attribution and an audit trail,
  switch to Supabase Auth and stamp the logged-in user onto each note (the activity
  table already has an `author` column ready for this).
- The conversation log is append-only (separate `invoice_activity` table), so two reps
  logging at once won't overwrite each other.
