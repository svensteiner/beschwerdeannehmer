-- Share the practice row lock with save_hoer_korrektur_atomic.
-- Reject oversized batches atomically: never mark an incomplete import done.
create or replace function import_hoer_legacy_atomic(p_source text, p_time timestamptz, p_rows jsonb)
returns integer language plpgsql volatile as $$
declare
  practice_key text;
  existing_count integer;
  incoming_count integer;
  inserted_count integer;
begin
  insert into hoer_legacy_imports(source_key, imported_at) values(p_source, p_time)
    on conflict(source_key) do nothing;
  if not found then return 0; end if;

  for practice_key in
    select p.id from practices p
    where p.id in (select r->>'practiceId' from jsonb_array_elements(p_rows) r)
    order by p.id for update
  loop
    select count(*) into existing_count from hoer_corrections where practice_id = practice_key;
    select count(distinct r->>'legacyKey') into incoming_count
      from jsonb_array_elements(p_rows) r
      where r->>'practiceId' = practice_key
        and not exists(select 1 from hoer_corrections c where c.legacy_key = r->>'legacyKey');
    if incoming_count > 0 and existing_count + incoming_count > 2000 then
      raise exception 'Sprachkorrektur-Import überschreitet die Grenze von 2000 Einträgen pro Ordination. Quelldatei unverändert; Import nicht abgeschlossen.';
    end if;
  end loop;

  insert into hoer_corrections(id, practice_id, heard, corrected, created_at, legacy_key)
    select r->>'id', r->>'practiceId', r->>'heard', r->>'corrected',
      (r->>'ts')::timestamptz, r->>'legacyKey'
    from jsonb_array_elements(p_rows) r
    join practices p on p.id = r->>'practiceId'
    on conflict(legacy_key) do nothing;
  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;
