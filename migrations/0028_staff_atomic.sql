-- Zwei Zugangs-Vorgaenge, die bisher aus mehreren getrennten Anweisungen
-- bestanden. Beide sind in einer einzigen Funktion zusammengefasst, damit sie
-- innerhalb EINER Transaktion laufen und die Sperre bis zum Ende haelt.

-- Bereich 2: die letzte Inhaberin atomar schuetzen.
--
-- Bisher: Rolle lesen, Inhaberinnen zaehlen, loeschen - drei Anweisungen.
-- Zwei gleichzeitige Loeschungen sahen beide zwei Inhaberinnen und loeschten
-- beide; danach blieb die Ordination ohne Inhaberin.
create or replace function remove_practice_staff(
  p_practice_id text,
  p_target_id text
)
returns text
language plpgsql
volatile
as $$
declare
  v_role text;
  v_owners integer;
begin
  -- Serialisiert Zugangsaenderungen dieser Ordination bis zum Transaktionsende.
  perform pg_advisory_xact_lock(hashtext('staff:' || p_practice_id));

  select role into v_role
    from practice_users
   where id = p_target_id and practice_id = p_practice_id;

  if v_role is null then
    return 'not_found';
  end if;

  if coalesce(v_role, '') = 'inhaberin' then
    select count(*) into v_owners
      from practice_users
     where practice_id = p_practice_id and role = 'inhaberin';
    if v_owners <= 1 then
      return 'last_owner';
    end if;
  end if;

  delete from practice_users
   where id = p_target_id and practice_id = p_practice_id;

  return 'removed';
end;
$$;

-- Bereich 3: Passwort setzen UND Sitzungen widerrufen in einem Schritt.
--
-- Bisher: `update password_hash` und `delete from practice_sessions` getrennt.
-- Schlug der zweite Schritt fehl, blieb das alte Passwort ersetzt, aber die
-- alten Sitzungen lebten weiter - genau der Fall, in dem ein widerrufenes
-- Geraet weiter Zugriff hat.
--
-- p_keep_token_hash: die Sitzung, die bestehen bleiben soll (die eigene beim
-- Passwortwechsel). NULL widerruft alle Sitzungen (Kollegin, Datei-Reset).
create or replace function set_practice_password(
  p_user_id text,
  p_practice_id text,
  p_password_hash text,
  p_keep_token_hash text default null
)
returns boolean
language plpgsql
volatile
as $$
declare
  updated integer;
begin
  update practice_users
     set password_hash = p_password_hash
   where id = p_user_id
     and (p_practice_id is null or practice_id = p_practice_id);
  get diagnostics updated = row_count;
  if updated <> 1 then
    return false;
  end if;

  delete from practice_sessions
   where user_id = p_user_id
     and (p_keep_token_hash is null or token_hash <> p_keep_token_hash);

  return true;
end;
$$;
