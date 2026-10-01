-- Notfall-Statuswechsel und Nachweis sind EIN Datenbankvorgang. Frueher
-- aktualisierte updateEmergencyStatus zuerst `emergencies` und schrieb danach
-- `emergency_audit` — schlug der zweite Schritt fehl, blieb ein Status ohne
-- Nachweis zurueck. Diese Funktion fasst beides in einer Transaktion zusammen
-- (eine PL/pgSQL-Funktion laeuft als eine Statement-Transaktion in PGlite und
-- Postgres) und bindet den Notfall zugleich an die eigene Praxis
-- (where id = p_id and practice_id = p_practice_id): eine Praxis kann keinen
-- Notfall einer anderen Praxis aendern.
--
-- Idempotenz: ein Retry mit demselben Zielstatus legt keinen zweiten Nachweis
-- an — nur ein echter Statusuebergang schreibt einen Audit-Eintrag.

create or replace function update_emergency_status_atomic(
  p_id text,
  p_practice_id text,
  p_status text,
  p_actor text,
  p_audit_id text
)
returns text
language plpgsql
volatile
as $$
declare
  current_status text;
begin
  perform 1 from practices where id = p_practice_id for update;
  if not found then return 'practice_missing'; end if;

  select status into current_status
    from emergencies
    where id = p_id and practice_id = p_practice_id
    for update;
  if not found then return 'missing'; end if;

  -- Retry mit demselben Ziel: kein neuer Nachweis.
  if current_status = p_status then
    return 'unchanged';
  end if;

  update emergencies
    set status = p_status
    where id = p_id and practice_id = p_practice_id;

  insert into emergency_audit (id, practice_id, emergency_id, actor, status, note)
    values (p_audit_id, p_practice_id, p_id, p_actor, p_status, '');

  return 'applied';
end;
$$;
