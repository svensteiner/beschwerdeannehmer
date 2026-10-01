-- Serialize fact replacement with creation for the same practice.
create or replace function replace_practice_fact_atomic(
  p_id text,
  p_practice_id text,
  p_fact text
)
returns table(id text, fact text, duplicate boolean)
language plpgsql
volatile
as $$
declare
  source_id text;
  deleted_any boolean := false;
begin
  -- Match remember_practice_fact_atomic's lock order.
  perform 1 from practices where practices.id = p_practice_id for update;
  if not found then
    return;
  end if;

  select f.id into source_id
    from practice_facts f
    where f.id = p_id and f.practice_id = p_practice_id
    for update;
  if not found then
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

  return query select source_id, p_fact, deleted_any;
end;
$$;
