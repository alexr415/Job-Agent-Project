-- Phase 0 schema. Paste into Supabase dashboard -> SQL Editor -> Run.

create table companies (
  id           bigint generated always as identity primary key,
  name         text not null,
  slug         text not null,            -- board token, e.g. "stripe" in boards-api.greenhouse.io/v1/boards/stripe
  ats_provider text not null check (ats_provider in ('greenhouse', 'lever', 'ashby')),
  active       boolean not null default true,
  added_by     text not null default 'manual' check (added_by in ('manual', 'scout')),
  created_at   timestamptz not null default now(),
  unique (ats_provider, slug)
);

-- One row per pipeline run (Phase 6 cron, or a manual run).
create table runs (
  id                 bigint generated always as identity primary key,
  started_at         timestamptz not null default now(),
  finished_at        timestamptz,
  status             text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  postings_fetched   int not null default 0,
  postings_new       int not null default 0,
  postings_extracted int not null default 0,
  companies_added    int not null default 0,
  input_tokens       bigint not null default 0,
  output_tokens      bigint not null default 0,
  cost_usd           numeric(10, 4) not null default 0,
  error              text
);

create table postings (
  id                bigint generated always as identity primary key,
  company_id        bigint not null references companies (id) on delete cascade,
  source_job_id     text not null,        -- the ATS's own job ID, used for dedup
  title             text not null,
  location          text,
  url               text,
  description       text,                 -- plain text, HTML stripped
  posted_at         timestamptz,
  first_seen_run_id bigint references runs (id),
  first_seen_at     timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),
  unique (company_id, source_job_id)
);

-- One row per posting; a missing row means "not extracted yet".
create table extracted_fields (
  posting_id          bigint primary key references postings (id) on delete cascade,
  required_skills     text[] not null default '{}',
  nice_to_have_skills text[] not null default '{}',
  years_experience    numeric,
  responsibilities    text[] not null default '{}',
  tech_stack          text[] not null default '{}',
  seniority_signal    text,
  model               text not null,
  extracted_at        timestamptz not null default now()
);

create table resume_skills (
  id         bigint generated always as identity primary key,
  skill      text not null unique,
  category   text,                         -- e.g. "language", "framework", "tool"
  created_at timestamptz not null default now()
);

create table reports (
  id         bigint generated always as identity primary key,
  run_id     bigint references runs (id) on delete set null,
  model      text not null,
  content_md text not null,                -- the readable report
  data       jsonb,                        -- stats and gaps the report was built from
  created_at timestamptz not null default now()
);

-- Turn on row-level security with no policies: the public (anon) key can read
-- nothing, and only the server-side secret key can access these tables.
alter table companies        enable row level security;
alter table runs             enable row level security;
alter table postings         enable row level security;
alter table extracted_fields enable row level security;
alter table resume_skills    enable row level security;
alter table reports          enable row level security;
