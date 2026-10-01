-- Reservierung vor jeder Uebertragung erneut pruefen.
--
-- flushOutbox reserviert alle faelligen Eintraege GEMEINSAM fuer fuenf Minuten
-- und verarbeitet sie danach nacheinander. Dauert die Runde laenger als fuenf
-- Minuten (langsamer Connector, viele Eintraege), laeuft die Reservierung
-- spaeterer Eintraege waehrend der Verarbeitung ab. Ein zweiter Prozess darf
-- sie dann uebernehmen - derselbe Termin wird zweimal gebucht.
--
-- renew_pms_outbox_lease verlaengert die Frist eines Eintrags, den dieser
-- Prozess haelt, und meldet, ob er ihn ueberhaupt noch haelt:
--
--   true  -> die Reservierung gilt weiter (und ist wieder fuenf Minuten gueltig)
--   false -> ein anderer Prozess hat den Eintrag uebernommen; dieser Lauf
--            darf ihn NICHT mehr uebertragen.

create or replace function renew_pms_outbox_lease(
  p_practice_id text,
  p_pms_kind text,
  p_id text,
  p_owner text,
  p_lease_until timestamptz,
  p_now timestamptz
)
returns boolean
language plpgsql
volatile
as $$
declare
  updated integer;
begin
  update pms_outbox
     set next_attempt_at = p_lease_until,
         updated_at = p_now
   where practice_id = p_practice_id
     and pms_kind = p_pms_kind
     and id = p_id
     and status = 'processing'
     and lease_owner is not distinct from p_owner;
  get diagnostics updated = row_count;
  return updated = 1;
end;
$$;
