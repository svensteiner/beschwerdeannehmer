-- Optimistic, tenant-serialized replacement for an already existing fact.
-- The expected value is part of the write contract: a stale editor may not
-- delete a newer target fact while attempting its merge.
create or replace function replace_practice_fact_guarded(
  p_id text,
  p_practice_id text,
  p_fact text,
  p_expected_fact text
)
returns table(id text, fact text, duplicate boolean, conflict boolean)
language plpgsql
volatile
as $$
declare
  source_id text;
  current_fact text;
  deleted_any boolean := false;
begin
  -- Keep the same practice -> source lock order as migrations 0017/0018.
  perform 1 from practices where practices.id = p_practice_id for update;
  if not found then
    return;
  end if;

  select f.id, f.fact
    into source_id, current_fact
    from practice_facts f
   where f.id = p_id and f.practice_id = p_practice_id
   for update;
  if not found then
    return;
  end if;

  -- A missing expected value is never an unconditional overwrite.
  if p_expected_fact is null then
    return query select source_id, current_fact, false, true;
    return;
  end if;

  -- The same desired value is an idempotent retry.  Do not touch any row.
  if current_fact = p_fact then
    return query select source_id, current_fact, false, false;
    return;
  end if;

  -- The editor saw an older value.  In particular, do not delete a target
  -- duplicate belonging to the newer state.
  if current_fact <> p_expected_fact then
    return query select source_id, current_fact, false, true;
    return;
  end if;

  delete from practice_facts as target
   where target.practice_id = p_practice_id
     and target.id <> source_id
     and lower(target.fact) = lower(p_fact);
  deleted_any := found;

  update practice_facts as source
     set fact = p_fact
   where source.id = source_id
     and source.practice_id = p_practice_id;

  return query select source_id, p_fact, deleted_any, false;
end;
$$;
