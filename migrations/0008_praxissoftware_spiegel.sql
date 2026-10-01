create table if not exists praxissoftware_spiegel (
  id text primary key,
  practice_id text not null references practices (id) on delete cascade,
  pet text not null default '',
  owner_name text not null default '',
  phone text not null default '',
  email text not null default '',
  chip text not null default '',
  slot_start text not null default '',
  slot_reason text not null default '',
  slot_status text not null default '',
  vquadrat_ref text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists praxissoftware_spiegel_practice_idx
  on praxissoftware_spiegel (practice_id, created_at desc);
