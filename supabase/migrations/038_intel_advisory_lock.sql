-- 038_intel_advisory_lock.sql
-- Helper to acquire per-question advisory locks (transaction scoped).

create or replace function intel_advisory_lock(question_id uuid)
returns void
language plpgsql
as $$
declare
  lock_key bigint;
begin
  -- Derive a stable 64-bit key from UUID using md5 (first 16 hex chars)
  lock_key := ('x' || substr(md5(question_id::text), 1, 16))::bit(64)::bigint;
  perform pg_advisory_xact_lock(lock_key);
end;
$$;
