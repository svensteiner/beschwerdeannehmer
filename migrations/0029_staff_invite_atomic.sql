-- Zwei Punkte der Zugangsverwaltung.
--
-- Punkt 1: Die Acht-Zugaenge-Grenze war nicht gegen gleichzeitige Einladungen
-- gesichert. Gezaehlt und angelegt wurde getrennt; zwei parallele Anfragen
-- sahen beide sieben Zug-nge und legten beide an - neun statt acht.
--
-- Punkt 4: Die Vorpruefung 'E-Mail schon vergeben?' verhinderte keinen
-- anschliessenden Datenbankkonflikt: Zwei gleichzeitige Einladungen mit
-- derselben Adresse kamen beide durch die Pruefung, und die zweite scheiterte
-- erst am unique-Index mit einer unverstaendlichen Meldung.
--
-- Beides liegt jetzt in EINER Funktion mit EINER Sperre.
--
-- Punkt 3: Die Sperre wirkt JE PRAXIS. Zwei verschiedene Ordinationen koennen
-- dieselbe Adresse gleichzeitig einladen; keine der beiden Sperren greift fuer
-- die andere, beide bestehen die E-Mail-Pruefung und der zweite Insert
-- scheitert erst am unique-Index - mit einer rohen Datenbankmeldung statt einer
-- verstaendlichen Antwort.
--
-- Der Ausnahmefall faengt genau diesen Konflikt ab, unabhaengig davon, welche
-- Praxis zuerst schreibt.
--
-- Rueckgabe: 'invited' | 'full' | 'email_taken'.

create or replace function invite_practice_staff(
  p_practice_id text,
  p_user_id text,
  p_name text,
  p_email text,
  p_password_hash text,
  p_role text,
  p_max_staff integer
)
returns text
language plpgsql
volatile
as $$
declare
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtext('staff:' || p_practice_id));

  select count(*) into v_count
    from practice_users
   where practice_id = p_practice_id;
  if v_count >= p_max_staff then
    return 'full';
  end if;

  if exists (select 1 from practice_users where email = p_email) then
    return 'email_taken';
  end if;

  begin
    insert into practice_users (id, practice_id, email, password_hash, name, role)
    values (p_user_id, p_practice_id, p_email, p_password_hash, p_name, p_role);
  exception
    when unique_violation then
      return 'email_taken';
  end;

  return 'invited';
end;
$$;

-- Punkt 6: sicherheitsrelevante Zugangsaktionen nachvollziehbar machen.
-- Bewusst OHNE Geheimnisse: kein Passwort, kein Hash, kein R-cksetzcode.
-- Die E-Mail ist Bestand der Ordination selbst, nicht fremde Nutzdaten.
create table if not exists practice_staff_audit (
  id text primary key,
  practice_id text not null references practices (id) on delete cascade,
  actor_id text not null,
  action text not null,
  target_id text not null default '',
  target_email text not null default '',
  at timestamptz not null default now()
);

create index if not exists practice_staff_audit_practice_idx
  on practice_staff_audit (practice_id, at desc);
