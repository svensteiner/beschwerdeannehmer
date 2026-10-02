# FritzBox: "IP-Telefon" fuer Silvia anlegen (Betreiber vor Ort)

Diese Anleitung beschreibt, wie Silvia als SIP-"IP-Telefon" an einer FritzBox
im eigenen LAN angebunden wird (gewaehlte Topologie: FritzBox + Festnetznummer).

**Sicherheitseinstufung:** pyVoIP arbeitet in diesem Gateway ohne TLS/SRTP.
Unverschluesseltes SIP/RTP ist daher nur **zu privaten LAN-Zielen** zulaessig
und bleibt zusaetzlich hinter dem menschlichen Opt-in
`SILVIA_PHONE_ALLOW_UNENCRYPTED_LAN=1`. Der Gateway prueft technisch, dass
`SIP_SERVER` auf eine private IP aufloest (RFC1918 / Loopback / Link-local /
`fritz.box`). Eine oeffentliche IP wird auch mit Opt-in hart abgelehnt. Die
oeffentliche Strecke (FritzBox -> Provider) verschluesselt die FritzBox/der
Provider - das ist der Grund, warum dieser Aufbau fuer einen echten Test
akzeptabel ist, solange der Anruf nicht mit echten Patientendaten gefuehrt wird.

## Einrichtung der FritzBox

1. FritzBox-Weboberflaeche oeffnen: `http://fritz.box` (oder die LAN-IP der
   FritzBox), als Administrator anmelden.
2. **Telefonie -> Telefoniegeraete -> Neues Gerät einrichten**.
3. Anschluss waehlen: **Telefon (mit und ohne Anrufbeantworter)** ->
   **LAN/WLAN (IP-Telefon)**.
4. Namen vergeben, z. B. `Silvia`.
5. Die FritzBox zeigt Zugangsdaten fuer das IP-Telefon an:
   - Benutzername (z. B. eine Nummer wie `621`)
   - Kennwort (von der FritzBox generiert)
   - Registrar: die LAN-IP der FritzBox, Port meist `5060`

## Gateway konfigurieren

Diese Werte in `C:\silvia-phone\.env` eintragen (`.env` nie committen):

```
SIP_SERVER=fritz.box            # oder die LAN-IP der FritzBox, z. B. 192.168.178.1
SIP_USER=<angezeigter Benutzername>
SIP_PASS=<angezeigtes Kennwort>
SIP_PORT=5060
SIP_LOCAL_PORT=5060
SILVIA_PHONE_ALLOW_UNENCRYPTED_LAN=1
SILVIA_API_URL=http://127.0.0.1:8080/api/telefon/antwort
SILVIA_PHONE_TOKEN=<identisch zu C:\silvia\.env>
```

`SIP_SERVER` muss ein privates LAN-Ziel sein. `fritz.box` gilt als lokal,
solange es nicht auf eine oeffentliche IP aufloest; alternativ direkt die
LAN-IP der FritzBox eintragen. Bei einer oeffentlichen IP verweigert der
Gateway den Start mit einem klaren Konfigurationsfehler.

## Rufnummern zuweisen

Unter **Telefonie -> Rufumleitung** bzw. **Anrufe fuer:** festlegen, welche
externe Rufnummer(n) an dieses IP-Telefon (Silvia) geleitet werden sollen.

## Start und manueller End-to-End-Test

Voraussetzung: STT (8178) und TTS (8179) aus `C:\silvia-voice` laufen, und
Silvia (`C:\silvia`) ist mit `SILVIA_PHONE_TOKEN` gestartet.

1. `python healthcheck.py` - zeigt, ob STT/TTS erreichbar sind und ob
   `SIP_SERVER` ein privates LAN-Ziel ist.
2. Gateway starten: `start-phone.cmd sip`. Bei korrekten Daten registriert sich
   Silvia bei der FritzBox ("Registriert. Warte auf Anrufe...").
3. Von einem Handy aus die Festnetznummer anrufen.
4. Erwartung: Silvia nimmt ab, spielt die Begruessung ab, transkribiert die
   Antwort des Anrufers (STT) und antwortet (Silvia-API oder lokaler Fallback).
   Der Anruf erscheint auf der Praxistafel (Quelle "telefon").
5. Auflegen: entweder "Auf Wiederhoeren" sagen, 8 s schweigen, oder einfach
   auflegen (Gegenseite haengt auf). Das Gateway meldet das Gespraechsende an
   Silvia (Zusammenfassung auf der Praxistafel).

## Fehlersuche

- Registrierung schlaegt fehl: die Fehlermeldung nennt den Grund (kein stiller
  Fehler). Haeufige Ursachen: falscher Benutzername/Kennwort, `SIP_SERVER` ist
  eine oeffentliche IP, oder das Opt-in ist nicht gesetzt.
- `[Konfigurationsfehler] SIP_SERVER zeigt auf eine oeffentliche IP`: Registrar
  ist kein privates LAN-Ziel - LAN-IP der FritzBox statt Hostname pruefen.
- Statuswechsel/Neustart: das Gateway protokolliert Registrierungsstatus und
  versucht bei `FAILED` einen Neustart mit Backoff.

**Nicht Teil dieser Anleitung:** die tatsaechliche Abnahme mit echten
Patientendaten. Dafuer ist eine verschluesselte Telefonie-Anbindung noetig
(siehe README "Sicherheitsstopp").
