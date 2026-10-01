-- Punkt 19: Aktive Nachrichtenverlaeufe vor vorzeitigem Loeschen schuetzen.
--
-- Die Bereinigung richtete sich nach `threads.created_at`. Ein Verlauf, der vor
-- 100 Tagen begann und gestern ergaenzt wurde, fiel damit unter die Frist und
-- wurde geloescht - samt der neuen Nachricht.
--
-- Regel: die Frist zaehlt ab der LETZTEN Aenderung, nicht ab der Anlage.
--
-- Umgesetzt mit einem Trigger statt in jeder Anweisung: es gibt mehrere
-- Schreibpfade (Board, Protokoll, Gelesen-Markierung), und ein kuenftiger
-- Schreiber wuerde die Regel sonst vergessen.

alter table threads add column if not exists updated_at timestamptz;

-- Bestandszeilen: die letzte bekannte Aenderung ist die Anlage.
update threads set updated_at = created_at where updated_at is null;

alter table threads alter column updated_at set default now();
alter table threads alter column updated_at set not null;

-- Jede Aenderung an einem Verlauf gilt als Aktivitaet. `greatest` verhindert,
-- dass eine Uhr, die rueckwaerts laeuft, den Zeitstempel zurueckzieht.
create or replace function threads_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := greatest(coalesce(new.updated_at, now()), now());
  return new;
end;
$$;

drop trigger if exists threads_touch_updated_at on threads;
create trigger threads_touch_updated_at
  before update on threads
  for each row
  execute function threads_touch_updated_at();

create index if not exists threads_practice_updated_idx
  on threads (practice_id, updated_at desc);
