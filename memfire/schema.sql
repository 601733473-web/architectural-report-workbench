create table if not exists public.architectural_report_projects (
  id text primary key,
  title text not null,
  status text not null check (status in ('active', 'archived')),
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index if not exists architectural_report_projects_updated_at_idx
  on public.architectural_report_projects (updated_at desc);

create table if not exists public.architectural_report_reference_libraries (
  library_key text primary key,
  status text not null default 'connected',
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.architectural_report_projects enable row level security;
alter table public.architectural_report_reference_libraries enable row level security;

-- The application accesses these tables through its server route with the
-- service-role key. Do not expose the service-role key to the browser.
