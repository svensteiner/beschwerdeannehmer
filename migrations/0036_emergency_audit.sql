-- Nachweiskette fuer Notfaelle: jede Eskalation (Silvia erkennt und routet) und
-- jede Statusaenderung durch die Praxis wird mit Zeitstempel und Akteur festgehalten.
-- Damit ist der Notfall-Verlauf (erkannt -> verbunden -> uebernommen -> abgeschlossen)
-- lueckenlos nachvollziehbar — das fehlte bisher ("Notfall-Eskalation mit Nachweis").
create table if not exists emergency_audit (
  id text primary key,
  practice_id text not null references practices (id) on delete cascade,
  emergency_id text not null references emergencies (id) on delete cascade,
  at timestamptz not null default now(),
  actor text not null default '',
  status text not null default '',
  note text not null default ''
);

create index if not exists emergency_audit_emergency_idx on emergency_audit (emergency_id, at asc);
