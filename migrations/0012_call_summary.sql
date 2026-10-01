-- AP 52: Anruf-Zusammenfassung nach Gespraechsende — kurze, fuer die Tafel
-- lesbare Zusammenfassung je Anruf, erzeugt im Hintergrund nach Anrufende.
alter table calls add column if not exists summary text not null default '';
alter table calls add column if not exists summary_at timestamptz null;
