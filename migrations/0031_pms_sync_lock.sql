-- Punkt 17: Parallel laufende Server koordinieren.
--
-- Die Sperre `running` im Scheduler gilt nur INNERHALB eines Prozesses. Zwei
-- Server auf derselben Datenbank starteten denselben Stammdatenabgleich
-- gleichzeitig: doppelte Connector-Abfragen, doppelte Aufraeumlaeufe und zwei
-- Laeufe, die dieselben Outbox-Eintraege anfassen.
--
-- Diese Tabelle traegt eine Reservierung je (Ordination, Praxisprogramm) mit
-- einer Frist. Sie laeuft in der gemeinsamen Datenbank und wirkt damit ueber
-- Prozessgrenzen.

create table if not exists pms_sync_lock (
  practice_id text not null references practices (id) on delete cascade,
  pms_kind text not null,
  owner text not null,
  lease_until timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (practice_id, pms_kind)
);

-- Reservieren: gelingt nur, wenn die Frist abgelaufen ist oder die Reservierung
-- schon diesem Prozess gehoert (dann laeuft er selbst weiter).
--
-- `row_count` ist 0, wenn die `where`-Bedingung des Konflikts nicht greift -
-- also genau dann, wenn ein anderer Prozess noch haelt.
create or replace function try_claim_pms_sync(
  p_practice_id text,
  p_pms_kind text,
  p_owner text,
  p_now timestamptz,
  p_lease_until timestamptz
)
returns boolean
language plpgsql
volatile
as $$
declare
  v_claimed integer;
begin
  insert into pms_sync_lock (practice_id, pms_kind, owner, lease_until, updated_at)
  values (p_practice_id, p_pms_kind, p_owner, p_lease_until, p_now)
  on conflict (practice_id, pms_kind) do update
     set owner = excluded.owner,
         lease_until = excluded.lease_until,
         updated_at = excluded.updated_at
   where pms_sync_lock.lease_until <= p_now
      or pms_sync_lock.owner = p_owner;

  get diagnostics v_claimed = row_count;
  return v_claimed = 1;
end;
$$;

-- Freigeben: nur die eigene Reservierung, damit ein spaeter Prozess sie nicht
-- versehentlich entfernt.
create or replace function release_pms_sync(
  p_practice_id text,
  p_pms_kind text,
  p_owner text
)
returns boolean
language plpgsql
volatile
as $$
declare
  v_released integer;
begin
  delete from pms_sync_lock
   where practice_id = p_practice_id
     and pms_kind = p_pms_kind
     and owner = p_owner;
  get diagnostics v_released = row_count;
  return v_released = 1;
end;
$$;
