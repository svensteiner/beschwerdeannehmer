-- Appointment writes share one per-practice lock.  The UI may have checked a
-- slot moments before, but only this statement is authoritative: it rechecks
-- overlap while holding the lock and then writes in the same transaction.

create or replace function reserve_appointment_slot_atomic(
  p_id text,
  p_practice_id text,
  p_start_at timestamptz,
  p_minutes integer,
  p_owner_name text,
  p_pet text,
  p_kind text,
  p_vet text,
  p_channel text,
  p_status text
)
returns text
language plpgsql
volatile
as $$
begin
  if p_minutes <= 0 then return 'invalid'; end if;

  -- All create/move calls for one Ordination meet here.  A PL/pgSQL function
  -- runs as one statement transaction in both PGlite and PostgreSQL.
  perform 1 from practices where id = p_practice_id for update;
  if not found then return 'practice_missing'; end if;

  if p_status <> 'abgesagt' and exists (
    select 1
    from appointments a
    where a.practice_id = p_practice_id
      and coalesce(a.status, 'gelegt') <> 'abgesagt'
      -- Same deliberate legacy exception as loadOccupiedSlots().
      and not (
        (btrim(coalesce(a.pet, '')) = ''
          or lower(btrim(coalesce(a.pet, ''))) in ('patient', 'hund', 'protokoll', 'nummer', 'handy', 'festnetz', 'email', 'mail'))
        and btrim(coalesce(a.owner_name, '')) in ('', 'Klientel')
      )
      and a.start_at < p_start_at + (p_minutes * interval '1 minute')
      and p_start_at < a.start_at + (coalesce(a.minutes, 20) * interval '1 minute')
  ) then
    return 'conflict';
  end if;

  insert into appointments (
    id, practice_id, start_at, minutes, owner_name, pet, kind, vet, channel, status
  ) values (
    p_id, p_practice_id, p_start_at, p_minutes, p_owner_name, p_pet, p_kind, p_vet, p_channel, p_status
  );
  return 'applied';
end;
$$;

create or replace function move_appointment_slot_atomic(
  p_id text,
  p_practice_id text,
  p_expected_start_at timestamptz,
  p_expected_status text,
  p_start_at timestamptz,
  p_next_status text
)
returns text
language plpgsql
volatile
as $$
declare
  current_start_at timestamptz;
  current_status text;
  current_minutes integer;
begin
  perform 1 from practices where id = p_practice_id for update;
  if not found then return 'practice_missing'; end if;

  select start_at, status, minutes
    into current_start_at, current_status, current_minutes
    from appointments
    where id = p_id and practice_id = p_practice_id
    for update;
  if not found then return 'missing'; end if;
  -- Do not overwrite a colleague's intervening move/status change.
  if current_start_at <> p_expected_start_at or current_status <> p_expected_status then
    return 'stale';
  end if;

  if p_next_status <> 'abgesagt' and exists (
    select 1
    from appointments a
    where a.practice_id = p_practice_id
      and a.id <> p_id
      and coalesce(a.status, 'gelegt') <> 'abgesagt'
      and not (
        (btrim(coalesce(a.pet, '')) = ''
          or lower(btrim(coalesce(a.pet, ''))) in ('patient', 'hund', 'protokoll', 'nummer', 'handy', 'festnetz', 'email', 'mail'))
        and btrim(coalesce(a.owner_name, '')) in ('', 'Klientel')
      )
      and a.start_at < p_start_at + (coalesce(current_minutes, 20) * interval '1 minute')
      and p_start_at < a.start_at + (coalesce(a.minutes, 20) * interval '1 minute')
  ) then
    return 'conflict';
  end if;

  update appointments
    set start_at = p_start_at, status = p_next_status
    where id = p_id and practice_id = p_practice_id;
  return 'applied';
end;
$$;
