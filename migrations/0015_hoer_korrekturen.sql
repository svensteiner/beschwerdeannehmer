create table if not exists hoer_corrections (
  id text primary key,
  practice_id text not null references practices(id) on delete cascade,
  heard text not null,
  corrected text not null,
  created_at timestamptz not null,
  legacy_key text unique null
);

create index if not exists hoer_corrections_practice_created_idx
  on hoer_corrections (practice_id, created_at desc);

create table if not exists hoer_legacy_imports (
  source_key text primary key,
  imported_at timestamptz not null
);
