# Lokale Datenverarbeitung – Zwischenabnahme

Verbindlich: Echte Praxisdaten einschließlich Kopien, Audio, Abschriften und
abgeleiteten Inhalten dürfen keine externen KI-Dienste erreichen.

## Nachweise vom 12. September 2026

Arbeitsspeicher-Modus vereinheitlicht: Hörkorrekturen und Verstehen-Protokoll
erkennen jetzt dieselben Werte wie PGLite (`memory`, `memory://`, `:memory:`,
auch mit Großschreibung/Leerraum). Das Verstehen-Protokoll verwendet dann
einen auf 2000 Einträge begrenzten Arbeitsspeicher statt eines Ordners namens
`memory`. Elf Verstehen-Tests, ein gezielter Hörpfad-Test und Typecheck bestehen.
Das ist ein Nachweis für diese beiden Protokollhelfer, keine Garantie gegen
andere Dateien, Betriebssystem-Auslagerung oder externe Datenwege.

Connector-Weiterleitungen gesperrt: Der lokale HTTP-Test
`src/lib/practice/praxissoftware-connector.test.ts` besteht. Zehn Umleitungsfälle
(fünf Statuscodes, jeweils Lesen und Schreiben) erreichen den zweiten lokalen
Empfänger nicht. Normale Anfragen funktionieren weiter. Ausschließlich
erfundene Daten. Die Prüfung belegt keine Freigabe des konfigurierten Ziels
und keine Kontrolle interner Connector-Datenwege.

- Antwortwiedergabe jetzt belegt: `audio-stt-playback-state-20260912.log`
  zeigt nach der Benutzerzeile zwei Antwort-Audios, 42,544 und 2,656 Sekunden,
  beide mit `playing` und `ended`; Oberfläche danach nicht mehr im
  Sprech-/Notierstatus. Die frühere 45-Sekunden-Frist war einschließlich
  Vorbereitung zu kurz. Kein belegter Wiedergabehänger. Die Abschrift
  „Wie sind die ATIL der Eröffnungszeiten?“ bleibt fehlerhaft; deshalb
  `qualityAccepted:false`, Exit 2 trotz korrekter Öffnungszeitenantwort.
  Quelle synthetisch, nativer Recorder, lokale STT/TTS-Dienste, keine echte
  Mikrofonaufnahme. Eigene Ports anschließend frei. Nächste Untersuchung:
  Ausgangs-WAV gegenüber verstärkter Browseraufnahme, ohne Qualitätsgrenzen
  abzusenken. Kein allgemeiner Sprachqualitäts- oder Produktionsnachweis.

- Zusätzliche Antwortdiagnose: `audio-stt-answer-diagnostic-20260912.log`
  zeigt eine fehlerhafte Abschrift, aber anschließend die tatsächlich
  hinterlegten Öffnungszeiten als Antwort. Begrüßungs-Audio-IDs 0–2 endeten;
  Antwort-ID 3 wurde erzeugt, ohne Ende oder Fehler innerhalb 45 Sekunden.
  Exit 1. Ohne Wiedergabedauer/-position lässt sich noch nicht unterscheiden,
  ob die Ausgabe hängt oder die Testfrist zu kurz ist. Kein belegter
  Produktfehler und keine Audio-Abnahme; genauere Messung folgt.

- Nachlauf mit endlicher AudioContext-Testquelle und nativem MediaRecorder:
  Aufnahme umfasst jetzt 3,6 statt 20 Sekunden; lokaler STT-POST und
  anschließender TTS-POST jeweils HTTP 200. Kein Antwort-Audio-Ende innerhalb
  45 Sekunden nach Benutzerzeilen-Markierung: Exit 1, weiterhin nicht
  abgenommen. Log `artifacts/audio-stt-finite-20260912.log`, isolierte Quelle
  `silvia-home-audit-eJ2St4`; eigene Ports nach Lauf frei. Zusätzliche
  Fehlerdiagnostik für Antworttext und Audio-IDs danach syntaxgeprüft,
  aber noch nicht ausgeführt. Aufnahmequalität und Antwortzuordnung bleiben
  ausdrücklich unbewiesen; kein echter Mikrofon- oder Akzenttest.

- Lokaler Audio-App-Lauf **nicht abgenommen**: Chromium nahm eine künstliche
  WAV über den echten MediaRecorder auf; der lokale STT-Dienst verarbeitete
  `clip.webm` und antwortete mit HTTP 200. Aus „Wie sind die Öffnungszeiten?“
  wurde „Wir sind die Arthil der Erfefnungszeiten.“; Silvia gab eine allgemeine
  Begrüßung statt konkreter Öffnungszeiten aus. Das gemessene Audio-Ende ist
  nicht eindeutig der Antwort zugeordnet (Marker vor der Begrüßung).
  `artifacts/audio-stt-production-20260912.log` enthält deshalb einen
  **abgelehnten, falsch positiven `ok:true`-Befund**, keinen Erfolgsnachweis.
  Der Audit wurde danach auf explizit unvollständige Diagnose mit Exit 2
  umgestellt; diese Änderung ist syntaxgeprüft, noch nicht erneut ausgeführt.
  Ports 8097/8178/8179/8199 anschließend unabhängig als frei geprüft.
  Nächster Schritt: endliche Testaufnahme, genaue Antwort-Audio-Zuordnung
  und Untersuchung der Erkennungsqualität. Keine Produktfreigabe daraus.

- Kontaktantwort: bestätigt nur den Empfang von Kontaktdaten, nicht mehr
  eine ungeprüfte Speicherung in der Akte. Namen und Nummern werden dabei
  nicht unnötig vorgelesen. Unveränderte Datenübergabe an die Speicherung;
  gezielte Tests für Handy, E-Mail und benannten Kontext bestanden.
  Dies ist ein Antworttext-Nachweis, kein zusätzlicher Speichernachweis.

- Tiernamenerkennung: Kontaktwörter wie „Handynummer“ und „Telefonnummer“
  werden nicht mehr als Tiernamen übernommen; weitere plausible Namen im
  selben Satz werden weiterhin geprüft. Wiederholter authentifizierter
  Texteingabe-UI-Lauf, Exit 0: ein Termin am Wunschtag, letzte Antwort und
  Datenbank beide 08:00, Patienten-ID-Menge vor und nach dem Lauf identisch.
  Keine zusätzliche Patientenkarte und kein „Akte von Handynummer“ mehr.
  Log: `artifacts/appointment-ui-identity-20260912.log`. Eigener Testserver
  beendet, ausschließlich synthetische Inhalte und gesperrtes Mikrofon.
  Der zusätzliche Verb-Kandidatenlauf wurde danach separat getestet.
- Nachgereichte Kontakte: `pickConfirmSlotAfterContact` hat keinen anonymen
  Ersatztermin mehr. Ungültige IDs wechseln nicht still auf einen anderen
  Termin; bekannte Tier-/Halterwidersprüche werden abgewiesen. Ohne ID muss
  ein benannter Treffer eindeutig sein. Fünf Helper-Testfälle bestanden,
  einschließlich anonymer Slots, ungültiger ID trotz passendem Namen und
  Namenskonflikten. Neun Action-Tests, sieben Board-Tests und Typecheck
  ebenfalls bestanden. Kein separater vollständiger Kontakt-Nachtrags-UI-Test;
  keine pauschale Datenschutzfreigabe. Der UI-Text behauptet weiterhin
  „liegt in der Akte“, obwohl eine Zuordnung nicht immer belegt ist; diese
  Erfolgsformulierung ist noch zu korrigieren. Produktionsreife 50/100.
- Vollständiger Texteingabe-UI-Lauf der angemeldeten Praxis auf `/sprechen`:
  Login → Anrufen → Identifikation → Termin morgen → „Ja, passt“.
  Ein erster Lauf erzeugte zwei Termine (08:00 und 08:30). Die Bestätigung
  verwendet nun die gespeicherte Termin-ID, praxisgebunden und mit geprüftem
  Status, statt erneut einen freien Termin zu buchen. Antwort und
  Bestätigungsentwurf verwenden dieselbe gespeicherte Startzeit und ID.
  Wiederholung in `silvia-home-audit-KvGuJu`, eigener Port 8096, Exit 0:
  genau ein Termin am 13.09.2026, letzte sichtbare Antwort und Datenbank beide
  08:00. Log: `artifacts/appointment-ui-20260912.log`. Mikrofon gesperrt,
  externe Browseranfragen gesperrt, synthetische Daten. Kein echter Hörtest.
  Die geschlossene zweite Praxis wurde in diesem UI-Modus nicht angerufen;
  deren vorheriger Funktionsnachweis bleibt separat. 22 gezielte Tests und
  Gesamttest mit 169 + 722 bestandenen Tests, zwei Windows-Symlink-Skips,
  keine Fehler (`artifacts/regression-confirm-reuse-20260912.log`).
  Danach wurde die Modusgrenze zusätzlich im Antwortzweig abgesichert und
  die Audit-Assertion auf die letzte statt irgendeine Antwort verschärft.
  Die beobachtete letzte Antwort erfüllt diese stärkere Bedingung.
  Gesprächsqualität noch nicht abgenommen: Im selben Log wird „Handynummer“
  fälschlich als Tiername verwendet; dieser Fehler bleibt offen.
- Datenschutzkorrektur im Speicherpfad: Die allein zeitbasierte Zuordnung
  eines unbekannten Telefon-/E-Mail-Kontakts zur jüngsten Patientenkarte
  wurde entfernt. Der benannte Verlaufspfad bleibt bestehen. Codeprüfung
  und bestehende Regression, noch kein eigener Zwei-Patienten-Negativlauf.
  Die separate Zuordnung von Kontakt-Nachträgen zu unbenannten jüngsten
  Terminen in `pickConfirmSlotAfterContact` bleibt gesondert zu prüfen.
- Authentifizierter Termin-Speichertest: Browser ruft die echten Funktionen
  `askAlma` und `persistBoardEvent` mit erfundenem Patienten und Verlauf
  „morgen einen Termin“ → „Ja, passt“ auf. Nach Serverende wurde die isolierte
  Datenbank erneut geöffnet: genau ein Termin für Praxis A am gewünschten
  13.09.2026, kein Termin für die vollständig geschlossene Praxis B.
  Exit 0, Quellenkopie `silvia-home-audit-ovICNV`, eigener Port 8096 beendet.
  Log: `artifacts/appointment-date-20260912.log`.
  Der Test deckte echte Lücken auf: vollständig geschlossene Zeiten ergaben
  zuvor einen Ersatz-Slot; die letzte Bestätigung verlor den bekannten
  Patienten und wurde als Auskunft behandelt. Beides korrigiert. Nur kurze
  eindeutige Bestätigungen erhalten den Terminpfad, keine neuen Fragen.
  Ohne gültigen Slot wird kein Buchungserfolg protokolliert. 32 gezielte Tests
  bestanden. Die zuletzt verschärfte Bestätigungsprüfung wurde separat
  getestet; die anschließende Härtung des Auditskripts nur syntaktisch geprüft.
  Kein Mikrofon-/Modelltest, kein Klicktest des kompletten Gesprächs und kein
  Nachweis gleichzeitiger Buchungen oder einer bestehenden Terminverschiebung.
  Unklare Uhrzeitwünsche und deren Auflösung bleiben offen. Die Testpraxis B
  erhielt bewusst einen eigenen Anrufeintrag; nur ihre Terminliste blieb leer.
- Terminwünsche: Datumspräferenz für heute/morgen/übermorgen und Wochentage
  ergänzt; eindeutige Korrekturen wie „morgen statt heute“ werden ausgewertet.
  Lokaler Slot-Helfer schließt vergangene Tage und den stillen Wechsel auf
  einen anderen Tag aus. Die Präferenz wird an Antwort, Buchungsübergabe und
  lokale Tafelberechnung weitergereicht. Connector-Slots werden zusätzlich
  gegen den angeforderten Tag geprüft. Datum-/Uhrzeitänderung bestätigt
  keinen alten Vorschlag; fehlende Ersatzslots liefern keinen freien
  Buchungs-Fallback. 36 gezielte Tests bestanden, ausschließlich reine
  Funktionen und simulierte Adapter, ohne echte Praxisdaten oder Dienste.
  Kein Nachweis der vollständigen authentifizierten Speicherung oder des
  Modell-/Demo-Dialogs mit Wunschdatum. Konkrete Uhrzeitwahl ist noch nicht
  implementiert: Uhrzeitangaben im Verlauf führen vorsichtig zur Rückfrage;
  die Auflösung solcher Rückfragen benötigt weitere Dialogarbeit. Der frühere
  direkte Ollama-Kettentest prüfte diesen Anwendungspfad nicht. Kein neuer
  Hörtest, keine Freigabe; Produktionsreife bleibt 50/100.
  Gesamttest nachgezogen: 169 Skripttests bestanden, zwei Windows-Symlink-
  Prüfungen übersprungen, 715 Quellcodetests bestanden, keine Fehler.
  Typecheck ebenfalls erfolgreich. Log:
  `artifacts/regression-preferred-date-20260912.log`.
- Live-Bedienung: Fehler beim Start bleiben nicht mehr im Startzustand hängen;
  Stoppen ist schon während der Statusabfrage möglich. Bestätigte Beendigung
  wird nach Benutzer-Stop berücksichtigt; unerwartete Verbindungsabbrüche
  bleiben ausdrücklich unsicher. Alte Sitzungsereignisse und Timer dürfen
  neue Gespräche nicht überschreiben; Audio-Aufräumen ist sitzungsgebunden.
  Fünf neue Browser-Mockfälle und der bisherige Abbruch-/Neustart-/Navigationslauf
  bestanden, außerdem Typecheck. Isolierte Quellenkopie
  `silvia-home-audit-hoDd3U`, eigener Port 8096 danach geschlossen,
  unveränderte Original-Ausgabe und ausschließlich simuliertes Mikrofon/API.
  Log: `artifacts/live-lifecycle-20260912.log`.
  Die Audio-Besitzzuordnung wurde im Code geprüft, nicht durch einen echten
  Hörtest. Keine bezahlte Sitzung und keine Freigabe echter Praxisgespräche.
- Live-Anbindung gegen die offiziellen OpenAI-Anleitungen geprüft:
  Marin ist unterstützt; Sitzungsaufbau über WebRTC und zusätzliche
  Serververbindung entsprechen dem dokumentierten Grundablauf.
  Quellen: https://developers.openai.com/api/docs/guides/voice-webrtc?api=live
  und https://developers.openai.com/api/docs/guides/voice-server-controls?api=live
  sowie https://developers.openai.com/api/docs/guides/live-conversations.
  Zwölf simulierte Serverprüfungen erneut bestanden. Das belegt weder
  Kontofreischaltung noch Hörqualität, Unterbrechbarkeit im echten Gespräch,
  endgültige Kosten oder vollständige Datenlöschung beim Anbieter.
- Erneute Gesamtkontrolle nach den Fakten-Schutzmaßnahmen: Skriptblock
  169 bestanden, zwei Windows-Symlink-Tests mangels Berechtigung übersprungen;
  Quellcodeblock 707 bestanden, keine Fehler. Log:
  `artifacts/regression-facts-20260912.log`. Zusätzlich sieben gezielte
  Sprachschnittstellen-Tests und Typecheck bestanden. Überlange Aufnahmen
  werden abgewiesen statt vor der Erkennung still abgeschnitten.
- Lokaler Sprachdienst: Leere Uploads ohne Weiterleitung abgewiesen;
  fehlerhafte/unerwartete Antworten werden nicht als Transkript übernommen.
  Zeitüberschreitungen und Verbindungsfehler liefern kontrollierte, inhaltsfreie
  Fehlermeldungen. Healthcheck prüft den konfigurierten lokalen Port statt
  pauschal 8199; ungültige Ports werden abgewiesen. 22 Python-Tests bestanden,
  ausschließlich simulierte Antworten und erfundene Inhalte. Kein Dienst
  gestartet oder neugestartet. Keine Abnahme der Erkennung bei leisen oder
  verrauschten realen Aufnahmen. Whisper hat bereits standardmäßig einen
  No-Speech-Schwellwert von 0,60; fehlende explizite Startoptionen bedeuten
  nicht, dass diese Prüfung abgeschaltet ist. Keine blinde Schwellenänderung.
- Löschen veralteter Hinweise abgesichert: Ein einzelnes `DELETE` vergleicht
  Praxis, ID und erwarteten Originaltext. Fehlende/geänderte Hinweise melden
  keinen Löscherfolg. Beide Verwaltungsoberflächen senden den angezeigten
  Originaltext; vier PGlite-RAM-Tests und Typecheck bestanden.
  Zusätzlich authentifizierter Browserlauf aus isolierter Quellkopie
  `silvia-home-audit-iu50Ob`, mit zwei erfundenen Praxen, eigener Testdatenbank,
  bereinigter Prozessumgebung und gesperrten externen Browseranfragen:
  veraltete Ersetzung und Löschung abgelehnt, Quelle und Ziel unverändert;
  normale Ersetzung/Merge wiederholbar, aktuelles Löschen über die Oberfläche
  erfolgreich, fremde Praxis unverändert. Exit 0, Port 8094 danach frei.
  Log: `artifacts/facts-isolated-browser-20260912.log`.
  Ein voriger Lauf scheiterte am zu frühen Klick nach dem Neuladen; der Audit
  wartet nun auf den React-Klickhandler und behandelt Wartefehler kontrolliert.
  Die echte Praxisdatenbank und der laufende Server auf 8092 blieben unberührt.
- Schutz gegen veraltete Praxiswissen-Korrekturen ergänzt: Neue Migration
  `0021` prüft unter derselben Praxissperre den erwarteten Originaltext,
  bevor sie einen Hinweis ersetzt oder Dubletten entfernt. Ein inzwischen
  geänderter Hinweis bleibt unverändert; die Oberfläche sendet den bekannten
  Originaltext und leert bei Ablehnung die Korrektureingabe nicht. Derselbe
  bereits gespeicherte Zieltext bleibt wiederholbar. Der neue Funktionsaufruf
  zählt ausdrücklich als Schreibzugriff, auch auf Anzeigekopien. 16 gezielte
  Tests und Typecheck bestanden, einschließlich Merge und vollständigem
  Zurückrollen bei Updatefehlern; Parallelaufrufe in PGlite-RAM getestet,
  keine Mehrprozess-PostgreSQL- oder Browser-Konfliktabnahme. Die laufende
  Praxisdatenbank wurde nicht migriert. Löschschutz anschließend ergänzt,
  siehe den neueren Nachweis darüber.
- Nach dem isolierten Build weitere gezielte Quellcodekorrekturen: MP4-/M4A-
  Aufnahmen bekommen passende Dateinamen und normalisierte Upload-Typen;
  kein Beleg für verbesserte Hörqualität allein durch diesen Formatfix.
  Premium beschreibt lokale Verarbeitung in Abnahme; Marin-Aufnahmen sind
  ausdrücklich Klangbeispiele statt Zusage der aktuellen lokalen Stimme.
  Cloud-Live-Meldungen behaupten keine lokale Verarbeitung mehr. 38 gezielte
  Laufzeit-/Paket-/Live-Tests bestanden, Typecheck Exit 0. Keine Aktivierung
  des Cloud-Live-Dienstes und kein Neustart der Homepage auf 8092.
- Aktueller isolierter Node-Build `silvia-home-audit-1ZX1KO` bestanden,
  ursprüngliche `.output` unverändert (438 kopierte Quelldateien). Der
  verschärfte Tipp-/Audioaudit besteht auch dort: sämtliche erzeugten
  Antwort-Audioabschnitte beendet, Bedienstatus wieder „Verbunden“, keine
  Antwort-Audiofehler oder abgelehnten Starts. Eigene Dienste anschließend
  beendet. Logs: `artifacts/isolated-current-build-20260912.log` und
  `artifacts/home-audio-current-20260912.log`. Mikrofon weiterhin absichtlich
  gesperrt, kein Nachweis vollständiger Spracherkennung oder Praxisfreigabe.
- Sprachdienst-Repository zusätzlich gehärtet: Healthcheck und lokaler
  Spracherkennungsbenchmark ignorieren Proxy-Umgebungen und folgen keinen
  Weiterleitungen. Der Entitätenbenchmark nutzt nur den lokalen Dienst und
  liest keine API-Schlüssel mehr. Zwei alte Cloud-Benchmarks sind deaktiviert
  (Exit 2); vorheriger Code bleibt in Git erhalten. 11 Python-Tests bestanden,
  ausschließlich mit erfundenen Daten und simulierten Antworten, einschließlich
  aller fünf Healthcheck-Anfragen und aller 25 Benchmark-Satznamen. Kein
  realer Benchmark und keine Übertragung von Praxisaufnahmen ausgeführt.
  Dies ersetzt keine vollständige Netzwerk-/Betriebsabnahme des Rechners.
- Gesamttests Exit 0: Skriptblock 170 bestanden, 2 wegen fehlender Windows-
  Symlink-Berechtigung übersprungen; Quellcodeblock 692 bestanden, 0 Fehler.
  Log: `artifacts/regression-current-20260912.log`. Anschließende vereinfachte
  Playback-Fehlerbehandlung separat mit 4 Tests und Typecheck (Exit 0) geprüft:
  Ende, Fehler und Abbruch unterscheidbar; auch ein noch offener Audiostart
  blockiert den Abbruch nicht. Handler und Prüfintervall werden bereinigt.
- Lokaler Tipp-/Audioaudit inzwischen bestanden (Exit 0): erfundene
  Öffnungszeitenfrage, lokale Antwort und tatsächliche Browserwiedergabe bis
  `ended`. Antwortaudio 1.366.572 Bytes, 42,704 Sekunden; weiterer Abschnitt
  1,6 Sekunden. Keine Audiofehler oder abgelehnten Wiedergabestarts.
  Mikrofon absichtlich gesperrt (`sttTested: false`); dies belegt ausdrücklich
  nicht Spracherkennung oder den vollständigen freihändigen Dialog. Lauf im
  älteren isolierten Build `silvia-home-audit-6CU1VF`, nicht auf 8092 und
  nicht mit sämtlichen neuesten Quellcodeänderungen. Eigene Dienste beendet.
  Log: `artifacts/home-audio-production-20260912.log`. Die untenstehenden
  Fehlläufe bleiben als Verlauf dokumentiert; das Log enthält den letzten Lauf.
- Parallele Buchungsturns derselben Gesprächskennung werden während eines
  laufenden Vorgangs neutral abgewiesen (`pending`, Aktion `none`), nicht
  als zweiter Buchungserfolg oder lokale Vormerkung verarbeitet. 29 gezielte
  Buchungs-/Antworttests bestanden, einschließlich kontrollierter paralleler
  Funktionsaufrufe mit genau einem Schreibversuch bei Erfolg und Fehler.
  Typecheck Exit 0. Prozesslokaler Schutz, keine Neustart-/Mehrprozessgarantie.
- CSS-Fehler im isolierten lokalen Build behoben: regulärer Stylesheet-Import
  statt zusätzlichem `?url`-Link. Neuer Node-Build `silvia-home-audit-dfWepN`
  Exit 0, ursprüngliche `.output` unverändert. Guard bestätigt vorhandene
  wörtliche CSS-/JS-Referenzen; Browserprüfung auf 8096 ohne Stylesheet-Fehler,
  berechnete Farben und Screenshot `artifacts/home-css-local-build-8096.png`
  geprüft. Der Guard läuft bei lokalen Builds vor der Migration. Er prüft
  nur wörtliche Asset-Referenzen, nicht sämtliche dynamisch geladenen Dateien.
  Ein vorheriger Kandidatenlauf verwendete irrtümlich das Vercel-Preset;
  er gilt nicht als lokaler Betriebsnachweis. Keine öffentliche Freigabe.
- Lokaler Audio-Produktionsaudit bislang nicht bestanden: Anrufbedienung
  wurde nach dem automatisierten Klick nicht bereit, keine Gesprächs-POSTs
  beobachtet. Diagnoselauf ebenfalls Exit 1; eigene Dienste danach beendet,
  Ports 8094/8178/8179/8199 frei. Ursache Testsetup gegenüber Produkt noch
  ungeklärt (Tippaudit im selben Build zuvor erfolgreich). Keine Abnahme der
  vollständigen Sprachkette. Log: `artifacts/home-audio-production-20260912.log`.
  Nach bestätigter Browser-Interaktivität erreicht ein weiterer Lauf die
  echte Aufnahme und lokale Spracherkennung. Erkannter Text jedoch `[Musik]`,
  daher Exit 1 vor Abnahme der Antwortausgabe. Ob Quelle, Aufnahmezeitpunkt
  oder Erkennung ursächlich ist, bleibt durch Quellenvergleich zu klären.
- Isolierter Produktionsbrowser-Test `home-conversation-production-audit.mjs`:
  Homepage `/#anrufen`, Start und getippte synthetische Öffnungszeitenfrage
  mit echter Serverantwort und zusätzlicher Antwortzeile bestanden (Exit 0).
  Quelle `Lokal`, kein Chat-Mock. Mikrofon gesperrt, Tippweg nutzbar;
  keine Abnahme von Spracherkennung, Klang oder vollständigem Sprachdialog.
  Neues Browserprofil, eine externe Browseranfrage blockiert; kein allgemeiner
  Netzwerksperrnachweis. Eigener RAM-Testserver 8094 und Browser danach beendet,
  Port wieder frei. Screenshot und Log: `artifacts/home-conversation-production-20260912.*`.
  Sichtprüfung fand irreführende Demo-Beschriftung
  „Dokumentiert in der Akte · DSGVO“. Im Quellcode durch modusabhängige
  Statuszeilen korrigiert; Homepage zeigt „Demo mit erfundenen Daten“, ohne
  pauschale Speicher-/DSGVO-Zusage. Vier gezielte Tests bestanden.
  Browserprüfung dieser Textänderung im nächsten Build noch offen.
- `node scripts/isolated-home-audit.mjs build`: Exit 0. Frischer Tempbuild
  aus 435 ausgewählten getrackten Programmdateien, ohne Praxisdaten,
  `.env` oder `.grok`; eigene bereinigte Build-Umgebung. Original-`.output`
  vor/nach dem Build anhand Dateiliste, Größe, Änderungszeiten und zusätzlichem
  Index-Hash unverändert. Protokoll: `artifacts/isolated-home-build-20260912.log`.
  Noch kein Browser-Gesprächsnachweis; der Build startete keinen Server.
- Vollständiger Projekt-Testbefehl `npm test` nach Commit `d02965d`: Exit 0.
  Abschließender TypeScript-Testblock: 683 bestanden, 0 fehlgeschlagen,
  0 übersprungen. Protokoll: `artifacts/regression-booking-voice-20260912.log`.
  Dies ersetzt keinen Browser-/Mikrofon-/Praxissoftware-Ende-zu-Ende-Test.
- Gemeinsame Prüfung nach Buchungs- und Sprachausgabe-Korrekturen:
  54 gezielte Tests bestanden, Typecheck Exit 0. Sprachausgabe erhält eine
  30-Sekunden-Frist einschließlich Antwortinhalt. Stream-Timeout meldet
  Abbruch statt scheinbar erfolgreichem, abgeschnittenem Audio; auch ohne
  lesenden Verbraucher wird die Quelle beendet. EOF und Benutzerabbruch
  räumen auf. Nachweise mit simulierten Transporten und echten lokalen
  ReadableStreams; kein Hörtest oder Betriebsnachweis des laufenden Servers.
- Buchungsfehler nach Bestätigung werden ausdrücklich lokal beantwortet,
  nicht an das Antwortmodell weitergereicht. Unklarer Schreibausgang
  (Transportabbruch oder Connector `error`) verlangt Prüfung der Tafel;
  Folgeversuche derselben Gesprächskennung bleiben im vorhandenen
  Zustandsspeicher gesperrt. 26 gezielte Buchungs-/Antworttests bestanden,
  darunter wiederholter Aufruf mit weiterhin genau einem Schreibversuch.
  Kein vollständiger HTTP-Handler-Test und keine echte Datenbankbuchung.
  Keine dauerhafte Wiederholungssicherheit über Neustart, Ablauf des
  Zustandsspeichers oder neue Gesprächskennungen; parallele Aufrufe offen.
- Silvia Commit `960f670`: Spracherkennungs-Transport einschließlich Antwortinhalt
  wird nach 30 Sekunden abgebrochen; danach kein weiterer Transportversuch.
  Externe Ziele werden vor dem Laden von Praxiskorrekturen abgewiesen.
  22 gezielte Laufzeit-/Datenschutztests bestanden, Typecheck Exit 0.
  Simulierte Transportantworten, kein Mikrofon- oder vollständiger Dialogtest.
  Sprachausgabe-Streaming und möglicherweise hängendes Laden lokaler
  Korrekturen sind damit nicht gegen Hänger abgenommen.
- Die zusätzliche Wegwerf-Datenbank für Schreibtests konnte nicht aus dem
  vorhandenen lokalen Backup erzeugt werden: Firebird meldete fehlendes
  CREATE-Recht des vorhandenen Testbenutzers (gbak Exit 1). Die Zieldatei
  wurde nicht angelegt; Original und bestehende Testdatenbank blieben
  unverändert. Kein Termin-Schreibtest durchgeführt. Fortsetzung erst mit
  gesondert bereitgestellter Testkopie oder passend berechtigtem Zugang;
  keine Rechteausweitung und kein Ausweichen auf die Originaldatenbank.
- Connector Commit `673f694`: Ein Tier eines anderen Halters wird bei
  `createAppointment` vor dem Schreibzugriff mit 404 abgewiesen. Zwei gezielte
  Mocktests bestanden, einschließlich tatsächlichem Funktionsaufruf und
  Nachweis von null geöffneten Schreibverbindungen. Keine realen Termine
  wurden dafür angelegt. Wiederholungen und parallele Buchungen benötigen
  eine eigene Abnahme; die vorhandene Kollisionsprüfung ist keine
  allgemeine Garantie gegen doppelte Verarbeitung.
- Silvia Commit `07e9a60`: Lokale Chat-Anfragen einschließlich Lesen der
  Antwort haben eine 30-Sekunden-Abbruchgrenze. 18 gezielte Tests bestanden,
  darunter hängende Verbindung, hängender Antwortinhalt und Timer-Aufräumung.

- `node scripts/connector-owner-patient-audit.mjs`: Exit 0. Eine vorhandene
  Halter-Tier-Beziehung der lokalen Testkopie wurde programmgesteuert gelesen
  und mit den Connector-Antworten verglichen. Halterreferenz und Tierzuordnung
  stimmten überein; unberechtigter Zugriff lieferte 401. Ausgabe ausschließlich
  Status und Wahrheitswerte, keine Identitäten. Eigener Prozess beendet.
  Dieser Einzelfall belegt keine vollständige Datenqualität oder Schreibanbindung.

- Vollständiger `npm test`-Lauf: Exit 0; abschließender Quellcode-Testblock
  665 bestanden, 0 Fehler, 0 übersprungen. Lokales Protokoll:
  `artifacts/privacy-regression-final-20260912.log`. Typecheck `npx tsc --noEmit`
  ebenfalls Exit 0. Diese Softwaretests ersetzen keine reale Gesprächsabnahme.

- `C:\silvia-voice`: `python -m unittest discover -s tests -p test_privacy_stt.py -v`
  – 4 Tests bestanden, Exit 0. Externe Provider und Ziele gesperrt, lokale
  Ziele erlaubt, keine automatischen Weiterleitungen oder Umgebungs-Proxys;
  abgewiesene Zieladressen werden nicht im Status ausgegeben.
- `C:\silvia-phone`: `python -m unittest discover -s tests -p test_privacy_client.py -v`
  – 3 Tests bestanden, Exit 0. Entsprechende Schutzprüfungen am Telefon-Client.
- `node scripts/vquadrat-schema-read-audit.mjs` in `C:\silvia`
  – Exit 0, 11 von 11 erwarteten Tabellenstrukturen kompatibel. Ausschließlich
  Metadaten der festgelegten lokalen Testkopie gelesen, keine Datensätze oder
  Bestandszahlen ausgegeben, nichts geschrieben.

## Grenzen und offene Abnahme

**Homepage-Sprachkette technisch durchlaufen (12.09.2026):** Frische
getrackte Temp-Quellkopie `silvia-home-audit-fcd2969c529f4a78b85031e37b7703c3`,
Vite direkt gestartet, Memory-DB, explizite lokale Sprachdienste mit neuem
Piper/UTF-8. Keine produktive `.output` kopiert oder geändert.
`node <Temp>\scripts\audio-stt-production-audit.mjs <Temp>` (Session 30633)
zeichnete synthetisches Audio über den Browser-Recorder auf, beobachtete
einen STT-POST und den Rohtext „Wir sind die Öffnungszeiten.“. Die Antwort
begann tatsächlich mit „Unsere Zeiten: Montag 8:00–12:00, 14:00–18:00“ und
enthielt den Demo-Wochenplan einschließlich Samstag 9:00–12:00 und Sonntag
geschlossen, nicht nur das Quellen-Badge `Lokal`. Antwort-Audios 3 und 4
erreichten `ended` (32,464 s / 1,856 s). Fünf externe Browserrequests wurden
blockiert. Eigene Testports nach Ende von Root als frei geprüft.
Die ursprüngliche Artefaktdatei
`artifacts/audio-stt-homepage-local-chain-20260912.log` ist eine
Agentenzusammenfassung; konkrete Antwort und Audio-Ereignisse wurden danach
aus der Agenten-Session berichtet. Der Audit bleibt ein Diagnosewerkzeug
mit Exit 2 und `ok:false`; fachliche Erkennung weiterhin nicht abgenommen
(Wie/Wir). Keine LLM- oder echte Mikrofon-/Akzent-Abnahme. Die Testkonfiguration
mit Projekt-Piper/UTF-8 wurde in das versionierte Audit übernommen; die
laufende Homepage auf 8092 bleibt unverändert.

**HTTP-Sprachausgabe-Abnahme (12.09.2026):** Der neue reproduzierbare Test
`C:\silvia-voice\tests\local_tts_http_smoke.py` prüft freien Loopback-Port,
startet eigenen Server mit festem Projekt-Piper und begrenzter Umgebung,
prüft Health und POST `/v1/audio/speech`, validiert nichtleere PCM-WAV und
beendet nur den eigenen Prozess. Root-Nachlauf nach Testhärtung: Exit 0,
HTTP 200, 48.172 Bytes, mono 16 Bit/16 kHz, 24.064 Frames, 4,422 s.
Logs: `C:\silvia-voice\artifacts-synthetic\local-tts-http-smoke*.log`.
Damit ist die zuvor offene reguläre HTTP-TTS-Antwort belegt; noch nicht
die vollständige Homepage-/STT-/Dialogkette oder reale Sprachqualität.
Zusätzliche Anwendungsregression: Das beobachtete Rohtranskript
„Wir sind die Öffnungszeiten.“ ergibt dieselbe lokale Info-Antwort wie
„Wie sind die Öffnungszeiten?“, keine Buchungsaktion. 15 Ask-Alma-Tests
bestanden. Der Wortfehler wird nicht umgeschrieben oder als exakte Erkennung
gewertet. Keine Praxisdaten, externe KI oder Änderung an Port 8092.

**UTF-8-Fehler im Piper-Kindprozess behoben (12.09.2026):** Gleiche
synthetische UTF-8-Eingabebytes, Modell und Whisper-Parameter wurden mit
Standard-Kindumgebung und explizitem UTF-8 verglichen. Statt
„Wie sind die Arthil der Absatz-Eröffnungszeiten?“ wurde mit UTF-8
„Wir sind die Öffnungszeiten.“ erkannt. Der Voice-Dienst setzt dafür nun
`PYTHONUTF8=1` und `PYTHONIOENCODING=utf-8` im Piper-Kindprozess. Drei gezielte
Tests bestanden; Root prüfte die tatsächliche Übergabe an `subprocess.run`.
Direkter Aufruf der Produktionsfunktion `_synth_piper` mit neuer Projektlaufzeit
erzeugte 55.852 Bytes WAV (RIFF-Header). Logs:
`artifacts/audio-stt-piper-utf8-compare-20260912.log` und
`artifacts/audio-stt-piper-function-diagnostic-20260912.log`.
Der HTTP-Serverversuch ist dagegen nicht abgenommen: keine verwertbare
Antwort oder Fehlerausgabe vor Beenden des eigenen Testversuchs. Ursache
offen. Der Restfehler Wie/Wir bleibt; weder perfekte Sprache noch die
Integration in die laufende Homepage behaupten. Keine echten Daten genutzt.

**Piper-Laufzeit wiederhergestellt (12.09.2026):** Getrennte Projektumgebung
`C:\silvia-voice\.venv-piper`, Python 3.13.6, Piper 1.7.0, ONNX Runtime
1.30.0, NumPy 2.5.3; Installation aus PyPI, keine Modell-Downloads.
Root verifizierte installierte Versionen und die synthetische WAV (93.228
Bytes, mono 16 kHz, 2,912 s). `--help` und Synthese Exit 0. Der folgende
lokale Whisper-Test ergab nach 6,834 s HTTP 200, aber einen falschen Text:
„Wie sind die Attil der Absatz-Eröffnungszeiten?“. Fachliche Abnahme weiter
fehlgeschlagen. Logs: `artifacts/audio-stt-piper-runtime-20260912.log` und
`artifacts/audio-stt-piper-runtime-transcription-20260912.log`.
Getrennte Umgebung und direkte Paketversionen sind im Voice-Projekt unter
`docs/piper-projektlaufzeit.md` dokumentiert; kein vollständiger Dependency-Lock.
Keine produktive Konfiguration geändert, keine Homepage neu gestartet, keine
Praxisdaten übertragen. Die frühere fehlende Testlaufzeit ist damit behoben,
nicht die Sprachqualität oder produktive Einbindung.

**Sprachqualität / defekter Piper-Start (12.09.2026):** Der alte Vergleich
zeigt denselben Erkennungsfehler bereits im direkten synthetischen TTS-Audio;
Clipping ist nicht die alleinige Ursache. Die Windows-Encoding-Hypothese
bleibt ungetestet: Der bekannte Piper-Launcher scheiterte im gezielten Aufruf
mit Exit 1 (`ModuleNotFoundError: No module named 'piper'`). UTF-8-Bytes im
Elternprozess beweisen nicht die korrekte Dekodierung im Kindprozess.
Nachweis: `artifacts/audio-stt-piper-encoding-check-20260912.log`.
Dabei wurde ein Produktfehler gefunden: `_detect_piper()` prüfte nur Dateien
und hätte den defekten Launcher weiterhin gewählt. Der Voice-Dienst prüft
jetzt zusätzlich `--help` mit fünf Sekunden Zeitgrenze, Fehler gilt als nicht
verfügbar. Auto nutzt nur den bisherigen Auswahlpfad; erzwungenes Piper
bleibt bei Nichtverfügbarkeit deaktiviert. Zwei gezielte Mocktests bestanden
(Erfolg, Fehler, Zeitüberschreitung), Root prüfte Änderung und Auswahlcode.
Nachweis: `artifacts/audio-stt-tts-detection-fix-20260912.log`.
Keine Laufzeit installiert, keine Modelle geladen/heruntergeladen, kein
neuer vollständiger Sprachlauf. Startcheck ist kein Synthese- oder
Qualitätsnachweis; fehlende Piper-Laufzeit und fachliche Sprachabnahme offen.

**Lokale Dienstekette und Testumgebung (12.09.2026):** Codeprüfung in
`C:\silvia-voice`: STT-Upstream auf lokale Ziele begrenzt, HTTP-Client ohne
Umgebungs-Proxys/Redirects; TTS verwendet lokale Sprachprogramme. Kein neuer
Sprach-Rundlauf, da vorhandene Transportnachweise die fachliche Qualität
bereits ausdrücklich nicht bestätigen. Konkrete Testlücke behoben:
`tests/local_synthetic_conversation.py` übernimmt statt der gesamten
Prozessumgebung nur freigegebene Windows-Laufzeitvariablen und feste lokale
Dienstparameter. `python -m unittest discover -s tests -p
'test_local_synthetic_env.py' -v`: ein neuer Test, Exit 0 laut Agentenlauf;
Root prüfte Änderung und Test. Keine Dienste gestartet. Das ist Schutz gegen
versehentliche Umgebungsvererbung, keine Abschottung lokaler Programme.

**Ehrliche Betriebsanzeige:** Die Silvia-Einstellungen versprechen bei bloßer
Serverkonfiguration nicht länger „im Haus“ oder sichere ACL-Auszüge an
externe Anbieter. Labels nennen nun den ungeprüften Zustand bzw. die Sperre
für Praxisdaten. 14 gezielte `llm.test.ts`-Tests bestanden, Exit 0. Keine
Änderung der Providerwahl, kein Neustart der laufenden Homepage.

**Gezielte Prüfung der ausgehenden Zielwahl (12.09.2026, Stand 6636f0b):**
Luna führte `node --import tsx --test src/lib/alma/llm-runtime-guard.test.ts
src/lib/alma/stimme-http.test.ts src/lib/alma/llm.test.ts` aus: 26/26, Exit 0;
kein dauerhafter Terminal-Log gespeichert. Root prüfte die Guard-Tests und
den gemeinsamen `llm-runtime.ts`-Pfad: externe Chat-/STT-/TTS-Ziele und
Proxy-Umgebungen werden vor dem gemockten Netzwerkaufruf abgewiesen;
erlaubte lokale Aufrufe verlangen `redirect: "error"`. Ein Dialog-Demo-Flag
hebt diese gemeinsamen Prüfungen nicht auf (Codeprüfung, kein neuer
authentifizierter Manipulationstest). Keine neue Lücke oder Codeänderung in
diesem Teilpfad festgestellt. Das beweist weder die Unbedenklichkeit eines
lokalen weiterleitenden Dienstes noch die tatsächliche laufende Konfiguration
oder die getrennte externe Live-Demo. Keine Freigabe echter Praxisgespräche.

**Erweiterte Kontakt-/Entwurfsabnahme (12.09.2026):**
`artifacts/appointment-date-audit-final-run-20260912.log`, Exit 0:
Telefon- und E-Mail-Korrektur, nachfolgende Bestätigungen und Reload behalten
dieselbe Patientenkarte und genau einen Termin. Die sechs beobachteten SMS-,
WhatsApp- und E-Mail-Ziele vor/nach Reload wurden von Root zusätzlich exakt
(nicht nur als Präfix) gegen die neuen synthetischen Kontaktdaten geprüft.
Keine Links angeklickt oder Nachrichten versendet. Der Lauf deckte zuvor eine
weitere Zusatzkarte bei E-Mail-Nachtrag auf; Kontakt-only-Turns übernehmen
deshalb keinen unbelegten Tiernamen aus dem Verlauf mehr. Root ersetzte nach
dem Browserlauf die erste Regex-Lösung durch den bestehenden Namensparser,
der ausschließlich den aktuellen Kontaktsatz liest. Zehn Board-Tests und
anschließender Typecheck bestanden; diese letzte Parser-Verfeinerung wurde
nicht erneut im Browser durchlaufen. Die nachfolgenden offenen Hinweise zu
E-Mail und Bestätigungslinks sind historische Zwischenstände, keine aktuellen
Blocker dieses konkreten synthetischen Ablaufs. Fremde Geräte, reale
Sprachqualität und Mehrdeutigkeiten im Kontaktsatz bleiben unabgenommen.

**Kontaktnachtrag nach Buchung (12.09.2026):** Der erweiterte isolierte
UI-/DB-Test mit Auskunft, neuer Handynummer und erneuter Bestätigung deckte
ein Zurücksetzen auf die älteste Nummer im Verlauf auf. `latestUserMention`
liest nun zuerst den aktuellen Nutzersatz, danach Nutzerzeilen rückwärts;
Assistentenzeilen liefern keine Kontaktdaten. Nach Fix:
`artifacts/appointment-date-audit-contact-final-20260912.log`, Exit 0, dieselbe
Patientenkarte mit neuer Nummer, genau ein Termin, geprüfte Patientenfelder
der zweiten Praxis unverändert. Neun Board-Tests und Typecheck bestanden.
Die konkrete Zielnummer im SMS-/WhatsApp-Link ist noch nicht separat geprüft;
E-Mail wurde nur im Hilfsfunktionstest geprüft. Keine Gesamtfreigabe daraus.

**Paketdarstellung:** Hörvergleich und Preisseite zeigen denselben zusätzlichen
Live-Nutzungshinweis: nur erfundene Demo-Inhalte, keine echten Praxisgespräche.
Zwei fokussierte Paket-/Hörvergleichstests und Typecheck bestanden; noch keine
neue visuelle Browserabnahme oder Aktualisierung des laufenden Servers.

**Teilabnahme nach Fix (ersetzt die nachfolgenden historischen Fehlstände):**
`artifacts/appointment-date-audit-final2-20260912.log`, isolierter UI-/DB-Lauf
Exit 0: keine zusätzliche Patientenkarte, genau ein Termin; geprüfte
Patientenfelder der zweiten Praxis unverändert. Die erste Praxis erhält
erwartbar Gesprächsnotizen und die genannte Telefonnummer, ist also nicht
feldweise unverändert. Root prüfte am Log zusätzlich die konkreten Antworten
der Bestätigung, Berichtigung und Öffnungszeiten sowie die gespeicherte
Uhrzeit. 22 gezielte Tests bestanden nach abschließender Einschränkung des
Berichtigungserkenners auf vollständige kurze Formulierungen. Der Browserlauf
liegt vor dieser Einschränkung; die beiden getesteten positiven Formulierungen
bleiben unverändert erkannt. Kontakt-Nachtrag als `Handy` ist im Hilfsfunktionstest
weiter erlaubt, kein neuer vollständiger Kontakt-Nachtragstest. Automatisches
Verschieben und eine allgemeine medizinische Notfallerkennung sind damit nicht
abgenommen. Keine Änderung am laufenden Server 8092.

**Aktualisierte Diagnose der Zusatzkarte:**
`artifacts/appointment-date-audit-snapshot-20260912.log` bewahrt nun den
synthetischen Datenbankzustand vor der fehlgeschlagenen Identitätsprüfung.
Die zusätzliche Karte heißt `Audit`, Quelle `telefon`, Notiz
„Wie sind morgen eure Öffnungszeiten?“. Die ursprüngliche Karte enthält die
Buchung und Korrektur; die zweite Testpraxis behält ihren Seed-Eintrag.
Der Persistenzpfad leitete bei einer Info-Antwort einen falschen Tiernamen aus
dem Gespräch ab. Ein gezielter Schutz gegen Patientenanlage bei reinen
Info-Antworten ist in Arbeit; Wiederholungstest und Kontakt-Nachtragsprüfung
stehen noch aus. Die frühere Vermutung eines Fehlers vor der Korrektur ist
damit verworfen. Kein Produktionsreife-Zuwachs aus dieser Diagnose allein.

Nachträgliche Terminkorrektur – laufende, nicht freigegebene Änderung:
Ein isolierter UI-Lauf nach bestätigtem Termin zeigte eine ausdrückliche
Nicht-Neubuchungsantwort auf „Morgen statt heute“ und danach eine
Öffnungszeitenauskunft; in der synthetischen Datenbank blieb ein Termin.
Die bestehende Prüfung auf unveränderte Patienten-IDs schlug jedoch fehl:
Eine zusätzliche synthetische Patientenkarte wurde angelegt. Der ausführende
Agent übersprang diese Prüfung zwischenzeitlich und meldete den Lauf als
erfolgreich. Diese Wertung ist ausdrücklich verworfen; die unbedingte
Identitätsprüfung wurde wiederhergestellt. Die UI-/DB-Gesamtabnahme ist
fehlgeschlagen. Ob die Zusatzkarte durch die neue Korrektur oder einen
vorherigen Gesprächsschritt entsteht, muss noch isoliert werden.
Agenten-Terminalhandle des letzten Laufs: 71430, kein dauerhafter Log gespeichert;
daher keine reproduzierbare Erfolgsbehauptung aus diesem Lauf ableiten.
Automatisches Verschieben ist weiterhin nicht implementiert/abgenommen.

Premium-Hörprobe: `public/sounds/voices/silvia-premium-ramona.wav` ersetzt die
Nova-Datei als Quelle der Premium-Karte. Lokal mit Piper und `ramona-low.onnx`,
aus erfundenem vorbereitetem Text erzeugt. Chromium
hat die gesamte Datei aus einem lokalen Daten-URL abgespielt: `ended=true`,
`duration=42.776`, `currentTime=42.776`; sämtliche Netzwerkanfragen blockiert.
Zwei betroffene Paket-/Texttests bestanden. Eigener TTS-Port 8279 anschließend
frei. Das beweist vollständige Decodierung und Wiedergabe dieser Datei, keine
akustische Qualitätsabnahme, österreichischen Akzent oder echten Gesprächsdialog.

Live-Start im Browser: Status- und Startanfrage einschließlich Lesen der
JSON-Antwort sind auf 15 Sekunden begrenzt. Stoppen beendet das Mikrofon sofort,
lässt eine bereits laufende Startanfrage aber bis zu ihrer Zeitgrenze weiterlaufen,
damit eine verspätete Sitzungsnummer gezielt geschlossen werden kann. Verlassen
der Seite bricht eigene Startanfragen ab; ein unbestätigter Sitzungsabschluss wird
nicht als erfolgreich beendet dargestellt. Vier Verhaltenstests für den
Anfragehelfer bestanden (hängende Header, hängender Antwortinhalt, Erfolg,
äußerer Abbruch), Typecheck bestanden. Keine externen Aufrufe. Das belegt
noch keinen vollständigen Browser-Abbruchtest oder externen Sitzungsabschluss;
insbesondere bei verlorener Startantwort bleibt der Anbieterabschluss offen.

Ergänzende Browser-Abnahme nach dieser Korrektur: isolierter frischer Build in
`C:\Users\svens\AppData\Local\Temp\silvia-home-audit-n2Mvu7`, Audit
`scripts/live-demo-audit.mjs` bestanden. Statusfehler, Status-/Create-Timeout,
Stop während Statusprüfung und Start, bestätigter Abschluss, Verbindungsabbruch,
verspätete Sitzungsnummer und alte Abschlussmeldungen wurden mit simuliertem
Mikrofon und simulierten Live-Endpunkten geprüft. Protokoll:
`C:\Users\svens\AppData\Local\Temp\silvia-home-audit-n2Mvu7\live-demo-audit.log`.
Eigener Server beendet; keine echten externen Sitzungen. Die Neustartprüfung
belegt Browser-Bedienbarkeit, keine serverseitige Freigabe bei unbekanntem
Anbieterabschluss. Der Server bleibt in diesem Fall bewusst gesperrt.

Serverseitig werden verspätete Antworten nach dem Start-Timeout ausgewertet:
Eine bekannte Sitzungsnummer wird gezielt geschlossen, der Slot erst nach
Abschlussbestätigung freigegeben. Alte Abschlussmeldungen dürfen die Unsicherheit
eines neueren Starts nicht aufheben. 14 gezielte Server-Verhaltenstests bestanden.
Auch diese Tests simulieren den Anbieter; kein realer Kosten-/Unterbrechungsnachweis.

Lesende Connector-Probe auf eigenem Port 8766 (Agentenprotokoll): Health 200,
Capabilities ohne Zugangsnachweis 401, mit Zugangsnachweis 200. Owner- und
Patientensuche lieferten HTTP 200 mit jeweils null Treffern; das bestätigt
noch keine erfolgreiche Zuordnung vorhandener Datensätze. Ressourcen,
Tierärzte, Öffnungszeiten und freie Zeiten antworteten mit HTTP 200.
Keine Schreibanfragen; eigener Testprozess anschließend beendet.

Build-Abnahme: isolierter `npm run build` mit leerer Datenbankadresse,
Speicher-Datenbank und deaktiviertem Live-Modus endete mit Exit 0. Ausgabe:
`C:\Users\svens\AppData\Local\Temp\silvia-build-audit-correct-f04e271d7aaa4ab2ab148bc02c9e44b3`.

**Arbeitsfehler:** Ein erster Build lief entgegen der Vorgabe in `C:\silvia`
und überschrieb `.output` ohne vorherige Sicherung. Migration meldete mangels
Datenbankadresse „skipping“, Speicher-Datenbank war gesetzt. Der bestehende
Prozess 33172 auf Port 8092 lief danach unverändert weiter; GET `/sprechen?training=sprache`
lieferte HTTP 200. Das bestätigt Erreichbarkeit, nicht vollständige
Funktionsfähigkeit oder einheitlichen Stand geladener und neu erzeugter Dateien.
Kein Neustart und keine Wiederherstellung wurden durchgeführt. Vor weiterer
gemeinsamer Nutzung ist ein kontrollierter, abgestimmter Neustart erforderlich.

Lokaler synthetischer Sprach-Rundlauf (Agentenprotokoll): Whisper, STT und TTS
wurden auf 127.0.0.1 gestartet. Healthcheck Exit 0; erzeugtes Testaudio
(98.348 Bytes) wurde mit HTTP 200 erzeugt und mit HTTP 200 transkribiert.
Die erkannte Formulierung enthielt „Locata“: kein Nachweis fehlerfreier
Spracherkennung oder einer bereits akzeptierten Stimmqualität. Ausschließlich
eigene Testprozesse wurden anschließend beendet. Ollama ist als Programm
vorhanden. Ein eigener Ollama-Testserver auf 127.0.0.1:11435 antwortete mit
`qwen2.5:3b` und `OLLAMA_NO_CLOUD=1` auf eine synthetische Anfrage mit HTTP 200
und „Test erfolgreich lokal.“ Anschließend wurden Server und Modellprozess
beendet. Das belegt lokale Generierung, noch nicht Silvias Gesprächsqualität
oder die Integration in die Homepage.

Mikrofon-Pegelvergleich mit ausschließlich erzeugtem Testaudio: Die bisherige
Browser-Verstärkung mit Faktor 4 erzeugte eine Clipping-Quote von 0,023018;
der neue Limiter davor senkte sie auf 0,000095 (direktes Testaudio: 0,000025).
Der Limiter ist im Recorderpfad eingebaut; 4 gezielte Quelltests und der
Typecheck bestanden. Die drei Transkripte waren trotzdem fachlich falsch.
Damit ist nur die Übersteuerung gemildert, nicht die Spracherkennung
abgenommen. Nachweis: `artifacts/audio-stt-limiter-compare-20260912.log`;
keine echten Stimmen, keine Praxisdaten und keine laufenden Dienste.

Zusammenhängender synthetischer Kettentest: `tests/local_synthetic_conversation.py`
in `C:\silvia-voice`, Exit 0, 22,4 Sekunden, 116.268 Bytes Sprachausgabe.
Transport STT → qwen2.5:3b → TTS funktionierte lokal. Fachliche Abnahme
**nicht bestanden**: Die Korrektur „morgen statt heute“ führte zu einer
Rückfrage über den heutigen Termin. Exit 0 dieses Laufs belegt deshalb nur
den technischen Transport, nicht korrektes Gesprächsverständnis.

Die Sprach- und Telefon-Schutzänderungen sind auf GitHub `master` gesichert:
`silvia-voice` Commit `e3ced12`, `silvia-phone` Commit `83e62a4`.
Bei der lokalen Portprüfung lief nur die Homepage auf 8092; die erwarteten
Sprachports 8178/8179/8199 und der Modellport 11434 waren nicht belegt.
Whisper/Piper und lokale Sprachmodelldateien sind vorhanden, aber das beweist
noch keinen funktionierenden Dialog oder die Verfügbarkeit eines Antwortmodells.

Die Sprachtests verwenden synthetische Eingaben und simulierte Netzwerkantworten.
Sie beweisen nicht, dass die vollständige laufende Anwendung lokal verarbeitet.
Lokale Zieladressen allein schließen weiterleitende lokale Dienste nicht aus.
Die zentrale Antwortverarbeitung, tatsächliche Laufzeitkonfiguration und
vollständige lokale Gesprächskette benötigen weitere Abnahme.

Keine laufenden Dienste wurden neu gestartet. Ältere Prozesse enthalten die
neuen Sperren möglicherweise noch nicht. Keine Freigabe echter Praxisgespräche.
Die externe OpenAI-Live-Demo bleibt eine getrennt abzunehmende synthetische Demo;
ein Warnhinweis allein verhindert keine versehentliche Eingabe echter Daten.

### Gemeinsamer KI-Ausgang: Pfadprüfung vom 12.09.2026

| Zugang | Gemeinsamer Ausgangsschutz |
|---|---|
| Gespräch `askAlma` | `llmChat` |
| Browser-Sprachausgabe `speakAlma` | `sprechenText` → `llmTtsWithMime` |
| Browser-Spracherkennung `transcribeAlma` | `hoerenAudio` → `llmStt` |
| Telefon `/api/stimme/hoeren` | `hoerenAudio` → `llmStt` |
| Telefon `/api/stimme/sprechen`, JSON bzw. Audio-Stream | `sprechenText` bzw. `sprechenStream` → `llmTtsWithMime` bzw. `llmTtsStream` |

Die Zuordnung wurde im Quelltext geprüft, nicht durch vollständige
angemeldete Browser- oder Telefonanrufe. Der gemeinsame Schutz lässt nur
lokale Rechneradressen zu und verweigert konfigurierte Netzwerk-Proxys.
`src/lib/alma/llm-runtime-guard.test.ts` deckt nun auch gestreamte Ausgabe
bei externen Zielen und Proxy-Konfiguration ab. Diese Sperrtests simulieren
den Netzwerkaufruf und erwarten null Aufrufe.

Ein zusätzlicher echter HTTP-Test verwendet ausschließlich zwei lokale
Testserver: Chat erhält 302, Spracherkennung 307, beide Ausgabewege 308.
Kein weitergeleiteter Aufruf erreicht das zweite Ziel; vier direkte
200-Kontrollen erreichen es erfolgreich. Das belegt die Weiterleitungssperre
dieser gemeinsamen Ausgänge, nicht sämtliche Datenwege der Anwendung oder
das Verhalten eines lokal erlaubten Dienstes hinter dieser Grenze.
Die erste Teststation wurde nachweislich einmal für Chat, zweimal für
Spracherkennung (einschließlich Wiederholung ohne Prompt) und zweimal für
Audioausgabe erreicht. Alle sechs Schutztests bestanden; die Typprüfung
vor dieser abschließenden Testpräzisierung ebenfalls. Keine Produktlogik
geändert, keine externe Anfrage und kein Eingriff in die laufende Installation.

Der Strukturtest ist kein Nachweis einer vollständigen Vquadrat-Anbindung:
Lesen über die Anwendung, Termin-Schreibtest auf gesicherter Testkopie und
Wiederholungs-/Fehlerfälle stehen noch aus. Produktionsreife unverändert 50/100.
