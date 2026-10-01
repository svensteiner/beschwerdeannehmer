-- Eine Reservierung der Outbox gilt fuenf Minuten. Bisher pruefte das spaetere
-- Speichern nicht, wem die Reservierung gehoert: ein langsamer oder paralleler
-- Prozess konnte das Ergebnis eines neueren Laufs ueberschreiben.
--
-- Diese Migration ergaenzt eine Besitzerkennung und schreibt Ergebnisse nur,
-- wenn die Reservierung noch dem aufrufenden Prozess gehoert.

alter table pms_outbox
  add column if not exists lease_owner text;

-- Reservieren: setzt Besitzer und Frist. Nur wartende oder abgelaufene
-- Reservierungen werden uebernommen, damit zwei Prozesse nicht denselben
-- Eintrag gleichzeitig bearbeiten.
create or replace function claim_pms_outbox(
  p_practice_id text,
  p_pms_kind text,
  p_now timestamptz,
  p_lease_until timestamptz,
  p_owner text,
  p_limit integer,
  p_only_id text default null
)
returns setof pms_outbox
language plpgsql
volatile
as $$
begin
  return query
  with candidates as (
    select id from pms_outbox
      where practice_id = p_practice_id and pms_kind = p_pms_kind
        and ((status = 'pending' and next_attempt_at <= p_now)
          or (status = 'processing' and next_attempt_at <= p_now))
        and (p_only_id is null or id = p_only_id)
      order by next_attempt_at asc
      limit p_limit
      for update skip locked
  )
  update pms_outbox o
     set status = 'processing',
         next_attempt_at = p_lease_until,
         lease_owner = p_owner,
         updated_at = p_now
    from candidates c
   where o.id = c.id
  returning o.*;
end;
$$;

-- Ergebnis schreiben: nur wenn die Reservierung noch diesem Besitzer gehoert.
-- Ein ueberholter Prozess bekommt false zurueck und aendert nichts.
--
-- Fehlende Felder bleiben auf dem bisherigen Wert: `attempts` und
-- `next_attempt_at` sind NOT NULL, ein Aufruf ohne diese Angaben darf die
-- Zeile nicht ungueltig machen.
create or replace function mark_pms_outbox(
  p_practice_id text,
  p_pms_kind text,
  p_id text,
  p_owner text,
  p_status text,
  p_attempts integer,
  p_next_attempt_at timestamptz,
  p_result jsonb,
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
     set status = coalesce(p_status, status),
         attempts = coalesce(p_attempts, attempts),
         next_attempt_at = coalesce(p_next_attempt_at, next_attempt_at),
         result = coalesce(p_result, result),
         lease_owner = null,
         updated_at = p_now
   where practice_id = p_practice_id
     and pms_kind = p_pms_kind
     and id = p_id
     and lease_owner is not distinct from p_owner;
  get diagnostics updated = row_count;
  return updated = 1;
end;
$$;
