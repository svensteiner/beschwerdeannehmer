alter table calls add column if not exists external_call_id text null;
create index if not exists calls_external_call_id_idx on calls (practice_id, external_call_id);
