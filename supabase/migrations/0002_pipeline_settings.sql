-- Pipeline schedule, editable from the dashboard. Paste into Supabase SQL Editor -> Run.
-- Vercel Cron fires every day; each invocation reads this row to decide whether to run.

create table pipeline_settings (
  id          int primary key default 1 check (id = 1),  -- single-row table
  frequency   text not null default 'weekly' check (frequency in ('daily', 'weekly', 'off')),
  weekly_day  int not null default 1 check (weekly_day between 0 and 6),  -- UTC day, 0 = Sunday
  updated_at  timestamptz not null default now()
);

insert into pipeline_settings (id) values (1);

alter table pipeline_settings enable row level security;
