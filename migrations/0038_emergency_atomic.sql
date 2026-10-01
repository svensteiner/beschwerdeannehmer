-- Notfall-Anlage und erster Nachweis sind EIN Datenbankvorgang. Frueher
-- legte board.ts zuerst die `emergencies`-Zeile an und schrieb danach den
-- ersten `emergency_audit`-Eintrag — schlug der Nachweis fehl, blieb ein
-- Notfall ohne Nachweis zurueck. Diese Funktion fasst beides in einer
-- Transaktion zusammen (eine PL/pgSQL-Funktion laeuft als eine
-- Statement-Transaktion in PGlite und Postgres) und bindet den Notfall an die
-- eigene Praxis (p_practice_id).
--
-- Kein Dedup: die Anruferin erzeugt pro Turn eine frische id (e-<callId>);
-- das bisherige Verhalten — jeder Aufruf legt einen eigenen Notfall samt
-- Nachweis an — bleibt unveraendert.

create or replace function create_emergency_atomic(
  p_id text,
  p_practice_id text,
  p_owner_name text,
  p_pet text,
  p_species text,
  p_summary text,
  p_routed_to text,
  p_actor text,
  p_audit_id text,
  p_note text
)
returns text
language plpgsql
volatile
as $$
begin
  perform 1 from practices where id = p_practice_id for update;
  if not found then return 'practice_missing'; end if;

  insert into emergencies (
    id, practice_id, owner_name, pet, species, summary, urgency, routed_to, status
  ) values (
    p_id, p_practice_id, p_owner_name, p_pet, p_species, p_summary, 'notfall', p_routed_to, 'verbunden'
  );

  insert into emergency_audit (id, practice_id, emergency_id, actor, status, note)
    values (p_audit_id, p_practice_id, p_id, p_actor, 'verbunden', p_note);

  return 'applied';
end;
$$;
