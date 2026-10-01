-- A status click must not overwrite a colleague's intervening change.  Slot
-- moves/reactivations stay in move_appointment_slot_atomic(), because only
-- those transitions need a new overlap check.

create or replace function update_appointment_status_atomic(
  p_id text,
  p_practice_id text,
  p_expected_start_at timestamptz,
  p_expected_status text,
  p_next_status text
)
returns text
language plpgsql
volatile
as $$
declare
  current_start_at timestamptz;
  current_status text;
begin
  perform 1 from practices where id = p_practice_id for update;
  if not found then return 'practice_missing'; end if;

  select start_at, status
    into current_start_at, current_status
    from appointments
    where id = p_id and practice_id = p_practice_id
    for update;
  if not found then return 'missing'; end if;
  if current_start_at <> p_expected_start_at or current_status <> p_expected_status then
    return 'stale';
  end if;

  update appointments
    set status = p_next_status
    where id = p_id and practice_id = p_practice_id;
  return 'applied';
end;
$$;
