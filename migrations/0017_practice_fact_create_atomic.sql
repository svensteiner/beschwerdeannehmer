-- Serialize fact creation per practice.  The lock is held for the statement's
-- transaction, so duplicate and 40-row-cap checks cannot race across clients.
create or replace function remember_practice_fact_atomic(
  p_practice_id text,
  p_fact text,
  p_id text
)
returns table(id text, fact text, duplicate boolean, at_capacity boolean)
language plpgsql
-- VOLATILE keeps each invocation's internal statements on a fresh snapshot;
-- see PostgreSQL function-volatility semantics.
volatile
as $$
declare
  duplicate_row record;
  fact_count integer;
begin
  -- requirePractice() guarantees this row exists.  Locking it gives all
  -- concurrent fact-creation calls for this practice one serialization point.
  perform 1 from practices where practices.id = p_practice_id for update;
  if not found then
    raise exception 'Praxis nicht gefunden.';
  end if;

  select f.id, f.fact into duplicate_row
    from practice_facts f
    where f.practice_id = p_practice_id
      and lower(f.fact) = lower(p_fact)
    order by f.created_at desc
    limit 1;
  if found then
    return query select duplicate_row.id, duplicate_row.fact, true, false;
    return;
  end if;

  select count(*)::integer into fact_count
    from practice_facts f where f.practice_id = p_practice_id;
  if fact_count >= 40 then
    return query select null::text, null::text, false, true;
    return;
  end if;

  insert into practice_facts (id, practice_id, fact)
    values (p_id, p_practice_id, p_fact);
  return query select p_id, p_fact, false, false;
end;
$$;
