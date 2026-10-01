-- Silvia product schema: one tenant per practice, staff sessions, live board.

create table if not exists practices (
  id text primary key,
  name text not null,
  owner_name text not null,
  street text not null default '',
  zip text not null default '',
  city text not null default '',
  bundesland text not null default '',
  phone text not null default '',
  whatsapp text not null default '',
  email text not null,
  pms text not null default '',
  plan text not null default 'start',
  created_at timestamptz not null default now()
);

create table if not exists practice_users (
  id text primary key,
  practice_id text not null references practices (id) on delete cascade,
  email text not null unique,
  password_hash text not null,
  name text not null,
  role text not null default 'inhaberin',
  created_at timestamptz not null default now()
);

create index if not exists practice_users_practice_idx on practice_users (practice_id);

create table if not exists practice_sessions (
  id text primary key,
  user_id text not null references practice_users (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists practice_sessions_user_idx on practice_sessions (user_id);
create index if not exists practice_sessions_expires_idx on practice_sessions (expires_at);

create table if not exists leads (
  id text primary key,
  practice_name text not null,
  contact text not null,
  email text not null,
  phone text not null default '',
  bundesland text not null default '',
  pms text not null default '',
  message text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists leads_created_idx on leads (created_at desc);

create table if not exists patients (
  id text primary key,
  practice_id text not null references practices (id) on delete cascade,
  chip text not null default '',
  name text not null,
  species text not null default '',
  breed text not null default '',
  born text not null default '',
  owner_name text not null default '',
  phone text not null default '',
  last_vaccine text not null default '',
  rabies text not null default '',
  registered boolean not null default false,
  notes text not null default '',
  last_visit text,
  next_due text,
  warnings text,
  source text not null default 'telefon',
  last_call_at timestamptz,
  last_call_note text,
  created_at timestamptz not null default now()
);

create index if not exists patients_practice_idx on patients (practice_id, name);

create table if not exists calls (
  id text primary key,
  practice_id text not null references practices (id) on delete cascade,
  at timestamptz not null default now(),
  channel text not null default 'telefon',
  caller text not null,
  pet text not null,
  species text not null default '',
  concern text not null default '',
  status text not null default 'offen',
  duration_sec integer not null default 0,
  transcript jsonb not null default '[]'::jsonb,
  action text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists calls_practice_idx on calls (practice_id, at desc);

create table if not exists appointments (
  id text primary key,
  practice_id text not null references practices (id) on delete cascade,
  start_at timestamptz not null,
  minutes integer not null default 20,
  owner_name text not null,
  pet text not null,
  kind text not null default 'Termin',
  vet text not null default '',
  channel text not null default 'telefon',
  created_at timestamptz not null default now()
);

create index if not exists appointments_practice_idx on appointments (practice_id, start_at);

create table if not exists emergencies (
  id text primary key,
  practice_id text not null references practices (id) on delete cascade,
  at timestamptz not null default now(),
  owner_name text not null,
  pet text not null,
  species text not null default '',
  summary text not null default '',
  urgency text not null default 'notfall',
  routed_to text not null default '',
  status text not null default 'neu',
  created_at timestamptz not null default now()
);

create index if not exists emergencies_practice_idx on emergencies (practice_id, at desc);

create table if not exists threads (
  id text primary key,
  practice_id text not null references practices (id) on delete cascade,
  name text not null,
  pet text not null default '',
  preview text not null default '',
  unread integer not null default 0,
  intern boolean not null default false,
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists threads_practice_idx on threads (practice_id, created_at desc);

create table if not exists mails (
  id text primary key,
  practice_id text not null references practices (id) on delete cascade,
  at timestamptz not null default now(),
  to_addr text not null,
  subject text not null,
  body text not null,
  pet text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists mails_practice_idx on mails (practice_id, at desc);
