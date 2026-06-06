-- Run once in Supabase → SQL Editor.
-- Follow-up data is keyed by Proforma Invoice # so it survives every sheet refresh.

create table if not exists invoice_updates (
  key            text primary key,         -- Proforma Invoice #
  stage          text default 'New',
  contact_person text default '',
  deadline       date,
  next_followup  date,
  next_step      text default '',
  updated_at     timestamptz default now()
);

create table if not exists invoice_activity (
  id      bigserial primary key,
  key     text not null,                    -- Proforma Invoice #
  ts      timestamptz default now(),
  author  text default 'Team',
  who     text default '',                  -- person spoken to at the client
  note    text not null
);
create index if not exists idx_activity_key on invoice_activity(key);

-- The API uses the service key from server env vars, so Row Level Security
-- is bypassed safely. Keep RLS ON and add no public policies:
alter table invoice_updates  enable row level security;
alter table invoice_activity enable row level security;

-- If the tables already existed before this field was added, run:
-- alter table invoice_updates add column if not exists next_followup date;

-- Cache of the latest Google-Sheet pull (single row, id = 1).
create table if not exists sheet_cache (
  id        int primary key default 1,
  data      jsonb,
  synced_at timestamptz default now()
);
alter table sheet_cache enable row level security;
