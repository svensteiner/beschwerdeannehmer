alter table leads add column if not exists request_id text;
alter table leads add column if not exists request_payload_hash text;
create unique index if not exists leads_request_id_unique on leads (request_id);
