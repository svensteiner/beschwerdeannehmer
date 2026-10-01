-- AP 42: Bridge-DB — herstellerneutrale Praxis-Datenbank, gebridged zur
-- Praxissoftware (siehe docs/PLAN_PMS_Bridge.md Abschnitt 4.2). Jede Tabelle
-- trägt practice_id (Mandant) + pms_kind (Adapter) + external_id (Vendor-ID),
-- deren Tripel eindeutig ist. external_hash erlaubt No-Op-Upserts (nur
-- schreiben, wenn sich die Fachfelder wirklich geändert haben). raw enthält
-- das vollständige Connector-Wire-Objekt, damit das Repository es unverändert
-- zurückgeben kann — keine PII in Logs, nur in dieser Spalte.

create table if not exists pms_owners (
  id text primary key,
  practice_id text not null references practices (id) on delete cascade,
  pms_kind text not null,
  external_id text not null,
  external_hash text not null,
  name text not null default '',
  phone text not null default '',
  phone_norm text not null default '',
  email text,
  raw jsonb not null,
  synced_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists pms_owners_practice_kind_external_idx
  on pms_owners (practice_id, pms_kind, external_id);

create index if not exists pms_owners_practice_phone_idx
  on pms_owners (practice_id, phone_norm);

create table if not exists pms_patients (
  id text primary key,
  practice_id text not null references practices (id) on delete cascade,
  pms_kind text not null,
  external_id text not null,
  external_hash text not null,
  owner_external_id text not null default '',
  name text not null default '',
  species text,
  chip text,
  raw jsonb not null,
  synced_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists pms_patients_practice_kind_external_idx
  on pms_patients (practice_id, pms_kind, external_id);

create index if not exists pms_patients_practice_owner_idx
  on pms_patients (practice_id, owner_external_id);

create table if not exists pms_resources (
  id text primary key,
  practice_id text not null references practices (id) on delete cascade,
  pms_kind text not null,
  external_id text not null,
  external_hash text not null,
  name text not null default '',
  raw jsonb not null,
  synced_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists pms_resources_practice_kind_external_idx
  on pms_resources (practice_id, pms_kind, external_id);

create table if not exists pms_vets (
  id text primary key,
  practice_id text not null references practices (id) on delete cascade,
  pms_kind text not null,
  external_id text not null,
  external_hash text not null,
  name text not null default '',
  raw jsonb not null,
  synced_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists pms_vets_practice_kind_external_idx
  on pms_vets (practice_id, pms_kind, external_id);

-- Eine Zeile je Praxis + Adapter (kein external_id — Öffnungszeiten sind kein
-- Vendor-Datensatz mit eigener ID).
create table if not exists pms_hours (
  id text primary key,
  practice_id text not null references practices (id) on delete cascade,
  pms_kind text not null,
  external_hash text not null,
  hours jsonb not null,
  synced_at timestamptz not null default now()
);

create unique index if not exists pms_hours_practice_kind_idx
  on pms_hours (practice_id, pms_kind);

create table if not exists pms_sync_runs (
  id text primary key,
  practice_id text not null references practices (id) on delete cascade,
  pms_kind text not null,
  scope text not null,
  started_at timestamptz not null,
  finished_at timestamptz,
  ok boolean not null default false,
  stats jsonb not null default '{}'::jsonb,
  error text
);

create index if not exists pms_sync_runs_practice_scope_idx
  on pms_sync_runs (practice_id, pms_kind, scope, started_at desc);

create table if not exists pms_outbox (
  id text primary key,
  practice_id text not null references practices (id) on delete cascade,
  pms_kind text not null,
  kind text not null default 'appointment',
  payload jsonb not null,
  status text not null default 'pending',
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pms_outbox_practice_status_idx
  on pms_outbox (practice_id, status, next_attempt_at);
