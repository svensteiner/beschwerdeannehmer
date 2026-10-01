-- Warteliste: Anruferin, deren gewuenschter Tag ausgebucht ist, wird fuer einen
-- Rueckruf vorgemerkt, sobald wieder ein Termin frei wird. Gehoert zur Tafel
-- (local board), nicht zur Praxissoftware-Bridge.
create table if not exists waitlist (
  id text primary key,
  practice_id text not null references practices (id) on delete cascade,
  at timestamptz not null default now(),
  caller text not null default '',
  phone text not null default '',
  pet text not null default '',
  concern text not null default '',
  requested_date text not null default '',
  status text not null default 'offen',
  created_at timestamptz not null default now()
);

create index if not exists waitlist_practice_idx on waitlist (practice_id, at desc);
