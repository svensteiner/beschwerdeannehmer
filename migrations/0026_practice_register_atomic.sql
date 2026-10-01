-- Registrierung bisher: Praxis, Benutzer und Sitzung wurden in drei einzelnen
-- Anweisungen angelegt, und die Pruefungen (Praxis schon vorhanden? E-Mail schon
-- vergeben?) liefen getrennt davon. Zwei Folgen:
--
--   1. Schlug eine spaetere Anweisung fehl, blieb eine halbe Registrierung
--      stehen (Praxis ohne Benutzer, Benutzer ohne Sitzung).
--   2. Zwei gleichzeitige Anfragen konnten beide die Pruefung bestehen und
--      danach kollidieren.
--
-- Diese Funktion legt alles in EINER Transaktion an und sperrt die
-- Registrierung gegen parallele Anfragen. Sie prueft E-Mail und
-- Ein-Ordination-Regel innerhalb derselben Sperre.
--
-- Rueckgabe: 'created' | 'email_taken' | 'second_practice'.
-- 'second_practice' gilt nur, wenn p_single_tenant gesetzt ist (PGLite: eine
-- Ordination je Datenordner).

create or replace function register_practice_atomic(
  p_practice_id text,
  p_user_id text,
  p_session_id text,
  p_practice jsonb,
  p_slug_base text,
  p_user_email text,
  p_password_hash text,
  p_token_hash text,
  p_expires_at timestamptz,
  p_single_tenant boolean default false
)
returns text
language plpgsql
volatile
as $$
declare
  v_slug text;
  v_try integer := 1;
begin
  -- Serialisiert gleichzeitige Registrierungen bis zum Ende der Transaktion.
  perform pg_advisory_xact_lock(918273645);

  -- Zuerst die E-Mail: sie ist die spezifischere Auskunft fuer die Anmeldende.
  if exists (select 1 from practice_users where email = p_user_email) then
    return 'email_taken';
  end if;

  if p_single_tenant and exists (select 1 from practices) then
    return 'second_practice';
  end if;

  -- Freien Slug finden; dieselbe Regel wie slugifyPractice plus Zaehler.
  v_slug := p_slug_base;
  while exists (select 1 from practices where slug = v_slug) loop
    v_try := v_try + 1;
    v_slug := left(p_slug_base, 44) || '-' || v_try::text;
    if v_try > 30 then
      v_slug := left(p_slug_base, 40) || '-' || left(p_practice_id, 6);
      exit;
    end if;
  end loop;

  insert into practices (
    id, name, owner_name, phone, email, bundesland, city, street, zip, pms, whatsapp,
    hours_json, nachtdienst_name, nachtdienst_phone, nachtdienst_note, location_hint, slug
  )
  values (
    p_practice_id,
    coalesce(p_practice->>'name', ''),
    coalesce(p_practice->>'owner_name', ''),
    coalesce(p_practice->>'phone', ''),
    coalesce(p_practice->>'email', ''),
    coalesce(p_practice->>'bundesland', ''),
    coalesce(p_practice->>'city', ''),
    coalesce(p_practice->>'street', ''),
    coalesce(p_practice->>'zip', ''),
    coalesce(p_practice->>'pms', ''),
    coalesce(p_practice->>'whatsapp', ''),
    coalesce(p_practice->>'hours_json', '[]'),
    coalesce(p_practice->>'nachtdienst_name', ''),
    coalesce(p_practice->>'nachtdienst_phone', ''),
    coalesce(p_practice->>'nachtdienst_note', ''),
    coalesce(p_practice->>'location_hint', ''),
    v_slug
  );

  insert into practice_users (id, practice_id, email, password_hash, name, role)
  values (p_user_id, p_practice_id, p_user_email, p_password_hash, coalesce(p_practice->>'owner_name', ''), 'inhaberin');

  insert into practice_sessions (id, user_id, token_hash, expires_at)
  values (p_session_id, p_user_id, p_token_hash, p_expires_at);

  return 'created';
end;
$$;
