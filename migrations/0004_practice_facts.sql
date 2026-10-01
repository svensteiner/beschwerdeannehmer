create table if not exists practice_facts (
  id text primary key,
  practice_id text not null references practices (id) on delete cascade,
  fact text not null,
  created_at timestamptz not null default now()
);

create index if not exists practice_facts_practice_idx
  on practice_facts (practice_id, created_at desc);
