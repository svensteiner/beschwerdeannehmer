-- AP 14: Löschroutine. Aufbewahrung Anrufe/Protokolle in Tagen, Default 90 (7–3650, siehe settings-form.ts).
alter table practices add column if not exists retention_days integer not null default 90;
