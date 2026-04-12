-- 042 — Helper functions for the ingestion layer

CREATE OR REPLACE FUNCTION increment_dedup_member_count(group_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE signal_dedup_groups
  SET member_count = member_count + 1
  WHERE id = group_id;
END;
$$;
