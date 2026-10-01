-- AP 53: Einwilligungsansage — konfigurierbarer Zusatz nach der Begruessung,
-- Schalter je Praxis, Zeitstempel am Anruf wann sie gesagt wurde.
alter table practices add column if not exists consent_note text not null default 'Das Gespräch wird zur Terminvereinbarung verarbeitet.';
alter table practices add column if not exists consent_enabled boolean not null default true;
alter table calls add column if not exists consent_announced_at timestamptz null;
