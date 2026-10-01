-- Anruf-Zusammenfassungen: vier Probleme, eine Ursache.
--
-- Punkt 1: Die Zuordnung lief ueber `mail.subject.includes(callId)`. Eine
-- Anrufkennung "12" steckt auch in "3124" - ein Entwurf fuer 3124 liess den
-- Anruf 12 faelschlich als erledigt gelten.
--
-- Punkt 2: Pruefen und Speichern waren getrennt. Zwei gleichzeitige Laeufe
-- bestanden beide die Pruefung und schrieben beide eine Zusammenfassung.
--
-- Punkt 3: Zusammenfassung und Mailentwurf waren zwei Anweisungen. Schlug der
-- Entwurf nach der Zusammenfassung fehl, sah die Wiederholungspruefung
-- summary_at und versuchte nie wieder - der Entwurf fehlte dauerhaft.
--
-- Punkt 8: Die Anrufkennung stand nur im Betrefftext. Sie bekommt eine eigene
-- Spalte; der Betreff bleibt fuer die Menschen lesbar.

alter table mails add column if not exists call_id text not null default '';

-- Eine Kennung darf je Ordination nur einmal vorkommen. Traegt die Spalte leer
-- (aeltere Zeilen, gewoehnliche Mails), greift der Index nicht.
create unique index if not exists mails_call_id_idx
  on mails (practice_id, call_id)
  where call_id <> '';

-- Zusammenfassung und Mailentwurf in EINER Transaktion.
--
-- Punkt 4: "stored" heisst, dass WIRKLICH beide Teile entstanden sind. Vorher
-- legte der Insert bei einem bestehenden Entwurf nichts an (on conflict do
-- nothing) und die Funktion meldete trotzdem "stored" - die Zusammenfassung
-- galt als gespeichert, ohne dass ein passender neuer Entwurf entstand.
--
-- Reihenfolge: zuerst pruefen, dann den Entwurf anlegen, dann die
-- Zusammenfassung aneignen. Findet der Entwurf keinen Platz, wurde noch NICHTS
-- geschrieben und die Funktion meldet das ehrlich.
--
-- Rueckgabe: 'stored' | 'already' | 'missing'.
create or replace function finalize_call_summary(
  p_call_row_id text,
  p_summary text,
  p_call_id text,
  p_subject text,
  p_body text,
  p_mail_id text
)
returns text
language plpgsql
volatile
as $$
declare
  v_practice_id text;
  v_pet text;
  v_summary_at timestamptz;
  v_mail_id text;
  v_claimed integer;
begin
  select practice_id, pet, summary_at
    into v_practice_id, v_pet, v_summary_at
    from calls where id = p_call_row_id;
  if v_practice_id is null then
    return 'missing';
  end if;
  if v_summary_at is not null then
    return 'already';
  end if;

  -- Entwurf ZUERST: laesst der eindeutige Index ihn nicht zu, ist noch nichts
  -- geschehen und ein spaeterer Lauf darf es erneut versuchen.
  insert into mails (id, practice_id, to_addr, subject, body, pet, call_id)
  values (p_mail_id, v_practice_id, '', p_subject, p_body, v_pet, p_call_id)
  on conflict do nothing
  returning id into v_mail_id;

  if v_mail_id is null then
    return 'already';
  end if;

  -- Aneignung: nur ein Lauf bekommt die Zeile.
  update calls
     set summary = p_summary,
         summary_at = now()
   where id = p_call_row_id
     and summary_at is null;
  get diagnostics v_claimed = row_count;
  if v_claimed <> 1 then
    -- Ein anderer Lauf war schneller. Den eben angelegten Entwurf zuruecknehmen,
    -- damit kein Entwurf ohne Zusammenfassung stehen bleibt.
    delete from mails where id = v_mail_id;
    return 'already';
  end if;

  return 'stored';
end;
$$;

-- Fuer die Wiederholungspruefung: erledigte Anrufe exakt vergleichen.
create index if not exists calls_summarized_external_idx
  on calls (practice_id, external_call_id)
  where summary_at is not null;
