-- Turn-Idempotenz (AP 59): ein Gateway-Retry desselben Turns wuerde sonst
-- doppeltes askAlma() und doppelte calls-Zeilen erzeugen. Der Schluessel ist
-- callId + Anzahl Anrufer-Aeusserungen (Turn-Nummer); ein Retry schickt die
-- identische Historie und trifft damit denselben Schluessel.
--
-- Ein eindeutiger Index erzwingt die Eindeutigkeit als letzte Verteidigung
-- (on conflict do nothing), falls zwei gleiche Turns trotz Vorab-Pruefung
-- gleichzeitig ankommen. NULL bleibt bewusst ausserhalb (Postgres behandelt
-- NULLs in Unique-Indizes als verschieden): Web-/sonstige Zeilen ohne
-- Telefon-callId schreiben hier NULL und werden nicht erfasst.

alter table calls add column if not exists idempotency_key text null;

create unique index if not exists calls_idempotency_key_idx
  on calls (practice_id, idempotency_key);
