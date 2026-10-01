-- Punkt 13: unklare Buchungsergebnisse dauerhaft sichern.
--
-- Der Schutz vor blindem Wiederholen lag nur im Arbeitsspeicher und verfiel
-- nach 30 Minuten oder einem Neustart. Genau dann - nach einem Neustart oder
-- einer spaeteren Wiederholung - konnte derselbe Termin ein zweites Mal
-- geschrieben werden, obwohl der erste Ausgang unbekannt war.
--
-- Diese Tabelle traegt den unklaren Zustand in der gemeinsamen Datenbank.

create table if not exists booking_guards (
  practice_id text not null references practices (id) on delete cascade,
  call_id text not null,
  slot_start text not null default '',
  /** 'uncertain' = Schreibversuch mit unbekanntem Ausgang, nicht wiederholen. */
  reason text not null default 'uncertain',
  created_at timestamptz not null default now(),
  primary key (practice_id, call_id)
);

create index if not exists booking_guards_practice_idx
  on booking_guards (practice_id, created_at desc);
