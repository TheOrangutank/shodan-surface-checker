create extension if not exists pgcrypto;

create table if not exists passkey_credentials (
  id uuid primary key default gen_random_uuid(),
  credential_id text not null unique,
  public_key text not null,
  counter bigint not null default 0,
  transports text[],
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create table if not exists auth_challenges (
  id uuid primary key default gen_random_uuid(),
  challenge text not null unique,
  type text not null check (type in ('registration', 'authentication')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists auth_challenges_expires_at_idx
  on auth_challenges (expires_at);

create table if not exists app_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  csrf_hash text not null,
  user_agent text,
  ip text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists app_sessions_expires_at_idx
  on app_sessions (expires_at);

create table if not exists rate_limit_buckets (
  key text primary key,
  count integer not null,
  reset_at timestamptz not null
);

create or replace function check_rate_limit(
  bucket_key text,
  max_count integer,
  window_seconds integer
)
returns table(allowed boolean, retry_after integer)
language plpgsql
as $$
declare
  now_ts timestamptz := now();
  current_count integer;
  current_reset timestamptz;
begin
  delete from rate_limit_buckets where reset_at <= now_ts - interval '10 minutes';

  select count, reset_at
    into current_count, current_reset
    from rate_limit_buckets
    where key = bucket_key
    for update;

  if current_count is null or current_reset <= now_ts then
    insert into rate_limit_buckets(key, count, reset_at)
      values (bucket_key, 1, now_ts + make_interval(secs => window_seconds))
      on conflict (key) do update set
        count = 1,
        reset_at = excluded.reset_at;
    allowed := true;
    retry_after := 0;
    return next;
    return;
  end if;

  if current_count >= max_count then
    allowed := false;
    retry_after := greatest(1, ceil(extract(epoch from (current_reset - now_ts)))::integer);
    return next;
    return;
  end if;

  update rate_limit_buckets
    set count = current_count + 1
    where key = bucket_key;

  allowed := true;
  retry_after := 0;
  return next;
end;
$$;
