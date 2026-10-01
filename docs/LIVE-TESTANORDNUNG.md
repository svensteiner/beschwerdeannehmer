# GESPERRT — historische Live-Testanordnung

**Nicht ausführen.** Stand: 13.09.2026. Der nachfolgende Text ist nur noch
historische Dokumentation und keine Ablauf-, Betriebs- oder Abnahmeanweisung.

Er beschreibt eine inzwischen unzulässige Kombination aus Testkopie einer
echten Vquadrat-Datenbank, echtem Telefon und externer Spracherkennung. Damit
könnten Namen, Telefonnummern oder Gesprächsinhalte einen externen KI-Dienst
erreichen. Das widerspricht der verbindlichen Regel:

> Echte Praxisdaten gehen niemals an externe KI-Dienste.

Heute zulässig ist nur die sichere Checkliste in
[`GEMEINSAME-ABNAHME.md`](GEMEINSAME-ABNAHME.md): erfundene Angaben oder Svens
eigene Testnummer, keine Kopie von `DATEN.FDB`, keine Praxisanbindung und keine
Cloud-Live-Demo. Eine künftige Live-Abnahme braucht einen neuen, freigegebenen
Ablauf, der diese Trennung technisch und organisatorisch belegt.

## Historischer, gesperrter Text

Historischer Entwurf: 2026-09-08. Durchführung: später, am Stück, mit Sven am Telefon. Dauer etwa 90 Minuten.
Ziel: Silvia im Tagesbetrieb (`npm start`) mit echtem Telefon, echtem Vquadrat und Bridge, Ende zu Ende.

## 0. Regeln

- **Buchungen nur in die Testkopie** (`C:\silvia-connector\test\DATEN_TEST.FDB`), nie in `DATEN.FDB`.
  Die Live-Datenbank wird nur gelesen. Erst nach Abnahme und ausdrücklicher Freigabe der Inhaberin schreibt der
  Connector live.
- Die zweite Schreibfreigabe `SILVIA_BOOKING_LIVE_APPROVED=1` darf nur nach dieser
  dokumentierten Abnahme gesetzt werden; ohne sie bleibt jede Connector-Buchung gesperrt.
- Jeder Testfall hat ein Sollergebnis. Abweichung = Notiz mit Uhrzeit, Testfall-Nummer, Logauszug. Nicht nachbessern
  während des Tests, erst am Ende.
- Keine personenbezogenen Daten in Notizen oder Logs. Halter nur als Vquadrat-ID nennen.

## 1. Vorbereitung (30 min, ohne Telefon)

| Schritt | Befehl / Prüfung | Soll |
|---|---|---|
| 1.1 Repo aktuell | `git -C C:\silvia pull` auf `main` | keine lokalen Änderungen |
| 1.2 Firebird läuft | `sc query FirebirdServerDefaultInstance` | `RUNNING` |
| 1.3 Testkopie frisch | `DATEN_TEST.FDB` neu aus `DATEN.FDB` kopieren (Vquadrat vorher schließen) | Datei aktuell von heute |
| 1.4 Connector auf Testkopie | `connector.json`: `"testDatabase": true` | Datei gespeichert |
| 1.5 Connector starten | `cd C:\silvia-connector && set SILVIA_WRITE_TEST=1 && node src\server.mjs` | `listening on http://127.0.0.1:8765` |
| 1.6 Connector prüfen | `curl -H "Authorization: Bearer <SILVIA_PMS_TOKEN>" http://127.0.0.1:8765/health` | `"reachable":true` |
| 1.7 Sperre prüfen | `type C:\silvia\.silvia-data\silvia.lock` | Datei fehlt, oder der Prozess lebt nicht → Datei löschen |
| 1.8 `.env` prüfen | `SILVIA_PMS_URL`, `SILVIA_PMS_TOKEN`, `SILVIA_BOOKING=connector`, `SILVIA_PMS_SYNC_MINUTES=5`, `SILVIA_PHONE_LINE=<slug der Praxis>` | alle gesetzt |
| 1.9 Silvia starten | `cd C:\silvia && npm start -- --build` | `Listening on http://127.0.0.1:8080` |
| 1.10 Bridge live? | Serverlog nach dem ersten Aufruf von `/app` oder Anruf | `[bridge] Praxis … Adapter vquadrat (live), Bridge an` |
| 1.11 Scheduler aktiv? | Serverlog | `[pms-sync] Hintergrund-Sync aktiv, alle 5 min` |
| 1.12 Einstellungen | Als Inhaberin anmelden, Einstellungen öffnen | Zeilen "Praxissoftware: Vquadrat Veterinär — verbunden", "Termine: werden in Vquadrat eingetragen", "Bridge: … Halter …" |
| 1.13 Telefon-Gateway | `C:\silvia-phone` starten, Testnummer bereit | Gateway meldet Verbindung zu Silvia |

Wenn 1.10 "Stub" zeigt: abbrechen. Ursache in `.env` oder Build (siehe `docs/PMS-BRIDGE.md`, Betriebshinweise).

## 2. Testfälle mit Telefon (45 min)

Gateway sendet ended:true beim Auflegen.

Vor jedem Anruf: Uhrzeit notieren. Nach jedem Anruf: Serverlog und Connector-Log auf die genannten Zeilen prüfen.

### T1 Bekannter Halter, Termin buchen
- Anruf von einer Nummer, die in Vquadrat als Halter hinterlegt ist.
- Sagen: "Ich brauche einen Termin für meinen Hund, so bald wie möglich." Vorschlag bestätigen.
- **Soll:** Silvia nennt einen Slot in der Zukunft, trägt ihn ein. Connector-Log: `/owners`, `/owners/<id>/patients`,
  `/slots`, `/appointments` 201. Tafel zeigt den Termin mit "in Vquadrat eingetragen (Nr. …)". Vquadrat (Testkopie)
  zeigt den Termin im Kalender.

### T2 Gleicher Halter, zweiter Anruf innerhalb einer Stunde
- Wie T1, anderer Wunsch (zum Beispiel Impfung).
- **Soll:** Silvia kennt den Halter ohne neuen `/owners`-Aufruf im Connector-Log (Treffer aus der Bridge).
  Slots kommen trotzdem live (`/slots`).

### T3 Halter über Zweitnummer
- Anruf von der zweiten Nummer eines Halters mit zwei Nummern in Vquadrat.
- **Soll:** Halter wird erkannt.

### T4 Unbekannte Nummer
- Anruf von einer Nummer, die nicht in Vquadrat steht. Namen und Tier nennen.
- **Soll:** Silvia bucht nichts in Vquadrat, legt den Termin nur auf der Tafel an ("vorgemerkt"), fragt Rückrufnummer.

### T5 Konflikt
- Zwei Anrufe kurz nacheinander (zwei Telefone oder zweiter Anruf über Gateway-Skript) auf denselben Slot.
- **Soll:** Der zweite bekommt "Der Termin ist gerade vergeben worden … wäre frei", Outbox-Zeile `conflict`,
  kein Retry, kein Doppeltermin in Vquadrat.

### T6 Connector fällt aus
- Connector-Fenster mit Strg+C beenden. Anruf wie T1 mit bekanntem Halter.
- **Soll:** Silvia erkennt den Halter aus der Bridge, kann keine Slots nennen und fällt auf die Tafel zurück
  ("werden nur vorgemerkt"). Kein Absturz, Antwortzeit unter 5 Sekunden. Buchung liegt in der Outbox `pending`.

### T7 Connector kommt zurück
- Connector wieder starten. Bis zu 5 Minuten warten (oder Inhaberin klickt Sync in den Einstellungen,
  `POST /api/pms-sync`).
- **Soll:** Serverlog `[pms-sync] Praxis … Stammdaten ok, Outbox ok`. Die Buchung aus T6 steht in Vquadrat.
  Statuszeile: Outbox 0 offen.

### T8 Notfall und Rückruf (Regression, ohne Bridge)
- Anruf: "Mein Hund hat etwas Giftiges gefressen."
- **Soll:** Notfallpfad wie bisher, keine Bridge-Aufrufe im Connector-Log außer `/owners`.

### T9 Kassa-Vorschau und Tafel-Stimme
- Im Browser als Kassa `/sprechen` öffnen. Sprechen, nicht nur tippen: Uhrzeit und Handy nennen.
- **Soll:** Keine Connector-Aufrufe (Vorschau bleibt Tafel-only). Transkription über `gpt-transcribe`
  (nicht Chrome SpeechRecognition). Toast bei STT-Fehler `#sprechen-stt-fail` **Keine Spracherkennung**,
  nie „Kein Whisper“. TTS-Fehler `#sprechen-tts-fail`. Begrüßung nennt die Tafel, nicht Huber.
  Lange Antwort: erster Satz ertönt, bevor der Rest fertig ist (keine `[pause]`-Silbe).
  Dazwischen sprechen legt Silvia still (Barge-in) und behält denselben Mic-Stream,
  dann wieder `gpt-transcribe`.

### T10 Gateway nutzt `/api/stimme/*`
- `C:\silvia-phone` auf `POST /api/stimme/hoeren` und `POST /api/stimme/sprechen` stellen
  (Bearer `SILVIA_PHONE_TOKEN`, nur LAN). Denselben Satz wie in T9 sprechen.
- **Soll:** Dieselbe Zahlenkorrektur wie auf der Tafel (Uhrzeit `09:15`, Handy als Ziffern).
  Kein zweites Whisper am Gateway. Auth ohne Token: 401. Öffentliche IP: 401.
  Optional `Accept: audio/mpeg`: Roh-Stream, nicht JSON-Base64. Ohne Accept bleibt JSON.
  Optional `{ "saetze": true }`: nur der erste Satz als Audio, Rest in `rest` bzw. Header
  `x-silvia-rest` — Gateway holt den Rest mit dem nächsten POST (wie die Tafel-Sätze).
  Kein Live-Audio in CI — nur dieser manuelle Schritt.

## 3. Kontrollen nach dem Telefonteil (10 min)

| Prüfung | Soll |
|---|---|
| Einstellungen, Bridge-Zeile | Halter- und Patientenzahl gestiegen, "Outbox 0 offen", keine Achtung-Warnung |
| Vquadrat Testkopie | genau die Termine aus T1, T2, T5 (einer), T7. Keine Termine in der Vergangenheit |
| Serverlog | keine Zeile `[pms-sync] Lauf fehlgeschlagen`, keine `[bridge] … fehlgeschlagen` |
| Tafel | alle Anrufe als Protokoll, Termine mit Vquadrat-Nummer |
| `npm test` in `C:\silvia` | alle grün (Stand heute 499) |

## 4. Rückbau (5 min)

1. Silvia beenden (Fenster schließen oder Strg+C), prüfen dass `silvia.lock` weg ist.
2. Connector beenden, `connector.json` zurück auf `"testDatabase": false`.
3. `SILVIA_PMS_SYNC_MINUTES` in `.env` auf den Betriebswert setzen (Empfehlung 15).
4. Testkopie behalten für den nächsten Durchgang.

## 5. Abnahme

| Ergebnis | Bedeutung |
|---|---|
| T1 bis T10 bestanden | Bridge und Stimme-Kern freigegeben für Live-Schreibbetrieb nach Unterschrift der Inhaberin |
| T6 oder T7 nicht bestanden | kein Live-Betrieb, Outbox/Scheduler prüfen |
| T1 nicht bestanden | Stopp, Grundpfad kaputt |

Unterschrift Inhaberin: ____________________  Datum: __________

Bekannte offene Punkte vor dem Test (STATUS.md auf dem Desktop):
- Zeile 49 (vergangene Uhrzeiten) ist behoben: Slots vor jetzt + 15 min werden verworfen, Suche bis 7 Tage
  nach vorn. In T1 mit prüfen: angebotene Uhrzeit liegt in der Zukunft.
- Connector läuft nicht als Dienst; für den Test reicht das Konsolenfenster.
