-- Idempotency key for one concrete UI correction. NULL keeps legacy callers valid.
alter table hoer_corrections add column if not exists request_id text;
create unique index if not exists hoer_corrections_practice_request_uidx
  on hoer_corrections (practice_id, request_id);
