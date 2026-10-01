-- Serialize capped hearing-correction writes per practice.
create or replace function save_hoer_korrektur_atomic(
  p_id text,
  p_practice_id text,
  p_heard text,
  p_corrected text,
  p_created_at timestamptz,
  p_request_id text
)
returns boolean
language plpgsql
volatile
as $$
declare
  existing_heard text;
  existing_corrected text;
  current_count integer;
begin
  perform 1 from practices where practices.id = p_practice_id for update;
  if not found then return false; end if;

  if p_request_id is not null then
    select heard, corrected into existing_heard, existing_corrected
      from hoer_corrections
      where practice_id = p_practice_id and request_id = p_request_id
      for update;
    if found then
      return existing_heard = p_heard and existing_corrected = p_corrected;
    end if;
  end if;

  select count(*) into current_count from hoer_corrections where practice_id = p_practice_id;
  if current_count >= 2000 then return false; end if;

  insert into hoer_corrections (id, practice_id, heard, corrected, created_at, request_id)
    values (p_id, p_practice_id, p_heard, p_corrected, p_created_at, p_request_id);
  return true;
end;
$$;
