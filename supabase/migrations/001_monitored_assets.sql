create table if not exists monitored_assets (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('domain', 'ip')),
  value text not null,
  label text,
  last_queried_at timestamptz,
  last_result jsonb,
  last_summary jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (type, value)
);

create or replace function set_monitored_assets_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists monitored_assets_updated_at on monitored_assets;

create trigger monitored_assets_updated_at
before update on monitored_assets
for each row
execute function set_monitored_assets_updated_at();
