# Homepage: funktionale Abnahme

Stand 12.09.2026. Erste Priorität vor Vquadrat und Telefonabnahme.
„Geprüft“ gilt nur für den genannten Ablauf und Teststand, nicht für jede
Browser-/Gerätekombination oder eine vollständige Produktionsfreigabe.

| Ablauf | Vorhandener Nachweis | Verbleibende Abnahme |
|---|---|---|
| Navigation, FAQ, Dialog und Mobilmenü | `scripts/homepage-controls-audit.mjs`, `artifacts/homepage-honesty-controls-final.log` | Gezielte Wiederholung bei Änderungen an diesen Bedienelementen |
| Produktfilm | `scripts/homepage-product-film-audit.mjs`: Start, Zeitfortschritt, Pause/Fortsetzen, sichtbares Springen, Ton aus/an, Ende bei 32 Sekunden, Neustart und Tonstopp beim Seitenwechsel bestanden | Weitere Browser/Geräte und menschliche Klangbeurteilung |
| Zwei Paket-Hörproben bei 320/1440 Pixeln | `scripts/homepage-acceptance-audit.mjs`; erweiterter Fehleraudit bei 320 Pixeln: beide frühen Ladefehler, Reload, Nachladen und Seitenwechsel bestanden | Weitere Browser/Geräte und menschliche Klangbeurteilung |
| Demo-Anfrage mit verlorenem/fehlgeschlagenem Speichern | `scripts/lead-request-audit.mjs`, `artifacts/lead-request-audit-final.log` | Kein Nachweis einer externen E-Mail-Zustellung |
| Kurze gesprochene Demozeile korrigieren | `scripts/homepage-correction-audit.mjs`, `artifacts/homepage-correction-marker-regression-20260912.log` | Echte Mikrofon-/Akzentqualität, keine automatische Terminverschiebung |
| Praxiswissen und getrenntes Sprachtraining | `scripts/training-retry-audit.mjs` mit `AUDIT_ENTRY=homepage`: Speicherfehler, Korrektur-Retry, getrennte Speicherung und Rückwechsel bestanden | Echte Aufnahmequalität und weitere Wissensregeln separat prüfen |
| Eigene Demo-Begrüßung | `scripts/homepage-greeting-audit.mjs`: Homepage → Praxiswissen → Speichern → Reload → neuer Anruf, echte lokale Audio-Wiedergabe bestanden | Klang, österreichische Wirkung und reale Mikrofonqualität gemeinsam beurteilen |
| Natürliches lokales Gespräch | Synthetischer Aufnahme-/Antwort-/Audiopfad im Korrekturaudit | Verständlichkeit, Antwortzeit und Gesprächsfluss gemeinsam hören |
| Unterbrechbares Live-Gespräch | Lokale Implementierung, deaktiviert | Kostenfreigabe, tatsächliches Gespräch und Unterbrechung prüfen |

Nachtrag 14.09.2026: Der vollständige isolierte Homepage-Audit besteht erneut
mit allen zwölf Szenarien. Dabei wurde ein Produktfilmfehler gefunden und
behoben: Ein `HEAD`-Teilabruf der lokalen Tondatei lieferte `200` statt `206`.
GET und HEAD mit Bytebereich werden nun beide im gebauten Server geprüft;
unerwartete externe Anfragen blieben bei null.

## Abnahmeregel

### Isolierter Homepage-Buildstarter (13.09.2026)

`scripts/build-homepage-audit.mjs` akzeptiert nur eine per `realpath`
aufgelöste Tempkopie direkt unter dem System-Tempordner mit dem Präfix
`silvia-home-audit-`. Projektpfade sowie dorthin zeigende Junctions werden
vor dem Start abgewiesen. Der Starter ruft den verifizierten npm-Client direkt
ohne Shell auf, verwendet ausschließlich eine kleine Umgebungs-Whitelist und
setzt `SILVIA_LOCAL_NITRO=1`; er startet keinen Server. Sein Test simuliert
den Build: Ablehnung vor Spawn, korrekter Temp-Kontext, Fehlerweitergabe und
den echten CLI-Ablehnungsweg – kein tatsächlicher Build wurde ausgeführt.

### Automatische Homepage-Abnahme (13.09.2026)

`npm run audit:homepage` erzeugt eine einzige isolierte Tempkopie, baut nur
diese und führt darin nacheinander Bedienung, Hörprobenfehler, Produktfilm,
Begrüßung, Training/Korrektur, Wissensverwaltung/Kapazität, Terminnegation,
Auflegen/Unterbrechen und Live-Demo aus. Die Kopie enthält weder `.env`, Praxisdaten, Backups,
Artefakte noch Cloud-Schlüssel; Port 8092 bleibt ausgeschlossen. Bei einem
Fehler stoppt der Ablauf, nach Abschluss wird die Tempkopie entfernt. Der
frühere deaktivierte Sammeltest wurde entfernt.

### Lokaler Sprachdienst-Check (15.09.2026)

`npm run audit:voice-local` prüft die bereits laufenden lokalen Dienste auf
`127.0.0.1:8178` und `:8179`: Health, einen festen erfundenen Satz über TTS
und dessen anschließende STT-Erkennung. Der Test nutzt weder Mikrofon noch
Praxisdaten, schreibt keine Datei und gibt keinen Text aus. Der aktuelle Lauf
bestand mit HTTP 200 für beide Dienste sowie TTS-WAV und STT-Transkript.
Voraussetzung bleibt eine unterstützte Node-Version ab 22.12.

### Homepage: Notfall, Nacht und Termine (13.09.2026)

Die FAQ nennt nur die aktuell fest hinterlegten Demo-Schlagwörter; eine
Verwaltung dieser Liste über die Oberfläche gibt es noch nicht. Nachtbetrieb
und öffentliche Telefonie sind nicht abgenommen: Die Demo zeigt Hinweise und
Terminwünsche auf der Praxistafel, versendet keine Nachrichten automatisch und
die Tierarzthelferin öffnet den Nachtdienstkontakt selbst. Beide
Homepage-Anzeigemodi nennen zudem Terminwünsche, nicht automatisches
Verschieben oder Stornieren. Der Texttest deckt diese Grenzen ab; er ersetzt
keine Telefon- oder medizinische Abnahme.

### Initiale Freigabe der Live-Hörprobe (13.09.2026)

Die Hörprobe prüft beim Anzeigen zuerst den lokalen Status und bietet den
Start erst bei vollständiger Freigabe an. Gesperrte, deaktivierte oder nicht
prüfbare Zustände bleiben sichtbar; die erneute Prüfung fordert weder
Mikrofon noch Live-Verbindung an. Auch der Klick auf Start prüft den Status
noch einmal. Der isolierte `scripts/live-demo-audit.mjs` deckt diese Zustände,
Retry und einen inzwischen gesperrten Status mit synthetischen Browser-Mocks
ab; er belegt keine Cloud- oder Audioqualität.

### Erweiterte Bedienungsprüfung (13.09.2026)

Der isolierte Controls-Audit protokolliert alle Prüfungen als bestanden:
Demo-Dialog per Escape schließen und Fokus zum auslösenden Button zurückgeben,
Kalenderzeilen per Maus/Enter/Leertaste öffnen sowie Teamkarte per
Maus/Enter/Leertaste/Escape bedienen. Für die Fokus-Rückgabe wurde eine
optionale Trigger-Referenz ergänzt; direkte Dialognutzer behalten den
Standardmechanismus. Keine vollständige Barrierefreiheitsabnahme.

Rohprotokoll: `artifacts/homepage-greeting-audit.raw.log`, Lauf ab
`2026-09-12T22:13:25Z`; Screenshots in
`C:\Users\svens\AppData\Local\Temp\silvia-homepage-controls-2026-09-12T22-13-27-057Z`.
874 lokale GET-Anfragen, keine blockierten externen/Schreibanfragen.
Kein separat erfasster numerischer Audit-Exitcode; die Matrix belegt die
ausgeführten Assertions. Typprüfung laut Agent erfolgreich.

Wichtig: Beim anschließenden Build wurde versehentlich die Originalausgabe
überschrieben. Siehe `docs/LOCAL-BUILD-INCIDENT-20260913.md`.
Dies ist keine Betriebs- oder Neustartfreigabe.

### Lokale Film-Sprungabnahme (13.09.2026)

Beim erweiterten lokalen Browseraudit wurde die gewünschte Sprachposition
nach einem Sprung nicht erreicht: Filmposition 6 Sekunden, Sollposition der
bei 3,2 Sekunden beginnenden Aufnahme 2,8 Sekunden, tatsächlich nahe 0.
Der Browser meldete für die ausgelieferte Aufnahme einen suchbaren Bereich
von nur `[0, 0]`; die Antwort enthielt keine Range-Header. Der neue dedizierte
Audio-Endpunkt behebt dies: Browserbereich `[0, 8.76]`, tatsächlicher Start
bei 2,803 Sekunden nach dem kontrollierten Direktsprung. Nachweis unten.
Frühere grüne Bedienläufe belegen diesen Fall nicht. Nicht in der laufenden
Homepage aktiviert; keine vollständige Produktionsfreigabe.

### Ergänzender Browsernachweis vom 12.09.2026

Isolierte Produktionskopie, Build und Audioaudit jeweils Exit 0. Der Audit
belegt die Interaktivität durch Öffnen/Schließen des Demo-Dialogs vor dem
Test und erneut nach dem Neuladen. Eine simulierte HTTP-404 ausschließlich
für die Premium-Datei erzeugt einen sichtbaren Hinweis; Neuladen stellt
die Hörprobe wieder her. Beide Hörproben stoppen jeweils die andere.
Der Homepage-Schalter öffnet das Training; Wissen und Sprache sind auswählbar.
Der Rückwechsel wird angeklickt, sein Endzustand noch nicht ausdrücklich geprüft.
Der anschließende Sprachretry-Audit prüft diesen Endzustand nun ausdrücklich:
Trainingsbereich verborgen, danach erneut auswählbar; korrigierter Fachbegriff
bleibt gespeichert, Praxiswissen unverändert. Finaler Lauf Exit 0:
`C:\Users\svens\AppData\Local\Temp\silvia-training-retry-fLn6vE\audit.json`.

Ergebnis: `ok=true`, genau ein 404-Eingriff, Audiofehlercode 4,
`readyState=0`, `networkState=3`, keine aufgezeichneten JavaScript-Fehler.
Rohbeleg und zwei geprüfte Screenshots liegen lokal unter
`C:\Users\svens\AppData\Local\Temp\silvia-home-audio-error-oY6g6m`.
Nur lokale GET-Anfragen waren zugelassen. Keine Produktänderung erforderlich;
der anfängliche Stopptest lief zu früh vor vollständiger Interaktivität.

### Erweiterte Hörproben-Abnahme

Der Fehleraudit prüft jetzt beide Dateien vor vollständiger Interaktivität:
20 Skriptanfragen werden zurückgehalten, beide WAV-Anfragen liefern simulierte
HTTP-404 und native Audiofehlercode 4. Nach Freigabe der Skripte erscheinen
zwei verständliche Hinweise; ein echtes Neuladen stellt beide Proben wieder her.
Eine verzögerte Metadatenantwort der zweiten Probe unterbricht die laufende
erste nicht mehr. Beim internen Wechsel auf „Preise“ wird die gehaltene,
zuvor spielende Probe nachweislich pausiert; kein vollständiger Seitenreload.

Korrektur: vorhandene native Audiofehler beim Einhängen übernehmen und die
Audiobereinigung nur beim Entfernen der Komponente ausführen. Dabei werden
die ursprünglichen Audioelemente behalten, auch wenn ihre Referenzen später
geleert werden. Isolierter Build, Browseraudit und Typecheck bestanden;
keine aufgezeichneten JavaScript-Fehler. Rohbeleg und Screenshots:
`C:\Users\svens\AppData\Local\Temp\silvia-home-audio-error-DWiYgl`.

### Gelernte Begrüßung – Nachweis

Behoben: Die Homepage-Demo ignorierte bisher eine gespeicherte Begrüßungsregel
und verwendete stets den Standardgruß. Sie übernimmt jetzt die neueste gültige
Regel im Format „Bei der Begrüßung sagen Sie: …“. Der bestehende Datenabgleich
bleibt erhalten; echte Praxisanrufe und deren Einwilligungsansage sind unverändert.

Fünf Helfertests, Typecheck, isolierter Build und Browseraudit bestehen.
Der Browser speichert die erfundene Regel über eine echte lokale Schulungsantwort,
lädt neu und startet einen neuen Anruf. Dessen sichtbare Begrüßung entspricht
den zwei tatsächlich abgefangenen TTS-Textteilen (Gruß und Datenabgleich).
Ein lokaler Schulungsaufruf, keine erlaubten externen Anfragen.
Der optionale Modus `REAL_LOCAL_TTS=1` prüft jetzt auch den echten Weg vom
App-Server über den lokalen Piper-Dienst zur Browser-Wiedergabe. Beide
Abschnitte laden Audio-Metadaten und erreichen ohne Audiofehler das Ende
(2,350 bzw. 2,752 Sekunden). Browser-Autoplay bleibt unverändert; nur das
Mikrofon ist simuliert. Das ist kein menschlicher Hörqualitätsnachweis.
Aktueller Rohbeleg: `artifacts/homepage-greeting-audit.json` (Exit 0,
`audioPlaybackVerified=true`); Ablaufprotokoll:
`artifacts/homepage-greeting-audit-real-local-tts.raw.log`.
Das Protokoll enthält außerdem AbortError-Ausgaben beim Abbruch von
Browser-Anfragen. Der Lauf ist damit kein Nachweis eines vollständig
fehlerfreien Serverprotokolls. Beide eigenen Server wurden beendet.

Nachprüfung der Abbruchmeldung (12.09.2026): Der Stack verweist auf den
Node-Request-Adapter im isolierten Serveraufbau. Dieser löst beim Schließen
einer noch nicht vollständig gesendeten Antwort ein Abbruchsignal aus
(`ServerResponse.close`, `!res.writableEnded`). Das passt zu einem getrennten
Browseraufruf; das vorhandene Protokoll enthält jedoch keine Zuordnung zu
einer konkreten Anfrage. Daher weder als bewiesener TTS-Fehler noch als
pauschal harmlos eingestuft. Keine globale Fehlerunterdrückung eingebaut.
Die erfolgreiche Audiowiedergabe belegt nur den dokumentierten Ablauf;
für eine genaue Fehlerzuordnung fehlt ein gezielter Abbruch-Nachweis.

Der Audio-Nachweis gilt für die isolierte Build-Kopie von `0c6e892`.
Anschließend wurde nur der nachweislich unbenutzte `opts.onFail`-Zweig aus
`voice()` entfernt. Verhalten ohne Option unverändert, Typecheck bestanden;
kein erneuter Build allein für diese Bereinigung.

Wiederholung ohne Neubau, wenn die isolierte Kopie aktuell ist:
`node scripts/run-homepage-audit.mjs <isolierte-Tempkopie> homepage-greeting-audit.mjs`.
Der Starter verwendet nur eine geprüfte Tempkopie, eine reduzierte Umgebung
ohne Schlüssel, eine flüchtige Datenbank und einen eigenen Server auf 8183.
Er beendet die selbst gestarteten Prozesse. Die ursprüngliche Installation bleibt unberührt.
Für reale lokale Audioausgabe zusätzlich `REAL_LOCAL_TTS=1` setzen. Dieser
Modus verwendet die vorhandene Piper-Installation und startet sie auf 8184;
er lädt keine Modelle herunter und liest keine `.env`-Datei.

### Produktfilm – Pause und Fortsetzen

Behoben: Pausieren setzte die laufende Tonspur auf den Anfang zurück;
Fortsetzen startete danach nur die Filmzeit. Die Tonposition bleibt jetzt
beim Pausieren erhalten und wird beim Fortsetzen wiedergegeben. Springen,
Neustart und Ende setzen Audio weiterhin zurück.

Isolierter Neubau und gezielter Browseraudit bestanden: Filmzeit während
der Pause stabil, echte lokale Sprachdatei pausiert und wieder gestartet,
Ende bei 32 Sekunden tatsächlich abgewartet, Neustart erfolgreich. Der
sichtbare Regler springt vor und zurück, ein pausierter Film bleibt pausiert,
Ton aus/an setzt den echten Audiozustand und ein Seitenwechsel hält alle
Filmtonspuren an. Der lokale, fest auf Klingeln und Ara begrenzte
Audio-Endpunkt liefert echte Bytebereiche (200, 206, 416 und HEAD); ein
kontrolliert verzögert geladener Direktsprung auf Filmsekunde 6 startet Ara
bei etwa 2,8 Sekunden, nicht wieder bei null. Keine aufgezeichneten
JavaScript-Fehler. Browseranfragen lokal begrenzt; zusätzliche lokale
HTTP-Prüfungen testen HEAD und die Ablehnung von POST sowie fremden Datei-IDs.
Beleg: `C:\Users\svens\AppData\Local\Temp\silvia-home-product-film-91LJGf\audit.json`.
Wiederholung: `node scripts/run-homepage-audit.mjs <isolierte-Tempkopie> homepage-product-film-audit.mjs`.

Der Film ist ausdrücklich als erfundenes Beispiel gekennzeichnet. Aussagen
über eine bereits erfolgte Notdienstübergabe, gesetzesgenaue Feiertage und
fertige Praxisanbindung wurden entfernt. Zwei gezielte Textregressionen
bestanden. Die laufende Originalinstallation wurde nicht verändert.

### Weiteres Vorgehen

### Praxiswissen – korrigieren und später beantworten

Der erweiterte `scripts/homepage-greeting-audit.mjs` prüft zusätzlich eine
erfundene Parkplatzregel über die Homepage: Speichern, über „Korrigieren“
Innenhof durch „vor dem Haus“ ersetzen, Training beenden, Sprachbereich
öffnen, neu laden und einen neuen Demoanruf starten. Die echte lokale
Serverantwort und die sichtbare Antwort enthalten die neue Regel; die
ersetzte Regel fehlt. Eine anschließende Öffnungszeitenfrage liefert Zeiten
statt Parkplatzwissen. Vier lokale Gesprächsaufrufe, keine erlaubten externen
Anfragen. Beleg: `artifacts/homepage-knowledge-audit.json`, Exit 0.
Dieser Lauf simuliert Audiofehler und belegt keine neue Hörqualität;
der frühere echte lokale Audiobeleg bleibt separat erhalten.

Behoben: Allgemeine Wörter wie „haben“ allein lösen keine fachfremde
Praxisregel mehr aus. Die Liste gelernter Praxisregeln erscheint nur im
Wissensbereich, nicht beim Sprachtraining. Elf Helfertests und Typecheck
bestanden. Widersprüche zwischen separat hinzugefügten Regeln und freie
sprachliche Umschreibungen bleiben Grenzen des lokalen Wortabgleichs.
Eine allgemeine automatische Konfliktauflösung ist nicht nachgewiesen.

### Speichern von Demo-Praxiswissen

Anlegen und Ersetzen melden nun einen Fehler, wenn der Browser die echte
Speicherung ablehnt. Der vorherige Wissensstand wird im Arbeitsspeicher
wiederhergestellt, auch wenn dieser Rücksetzversuch erneut nicht gespeichert
werden kann. Die Eingabe bleibt erhalten; beim Anlegen wird auch die falsche
Bestätigung im Gespräch durch einen Fehlerhinweis ersetzt. Ungültig kurze
Regeln und fehlender Browserspeicher gelten nicht als Erfolg.

Zwei direkte Storetests belegen dauerhaft abgewiesene Schreibversuche für
Anlegen und Ersetzen, unveränderte alte Fakten und gespeicherte Werte sowie
Wiederholung ohne Doppelregel. Typecheck bestanden. Die zusätzliche Prüfung
der tatsächlich konfigurierten Speicheranbindung wurde nach dem isolierten
Browser-Build ergänzt und durch den direkten Test abgedeckt.

Der finale Browserlauf mit `AUDIT_STORAGE_FAIL_ONCE=1` besteht auch mit
je einem echten Schreibfehler beim Anlegen und Korrigieren: alte Regel bzw.
Eingabe bleiben erhalten, erneutes Senden gelingt, nach Reload wird die
korrigierte Regel beantwortet. Beleg:
`artifacts/homepage-knowledge-storage-audit.json`, fünf lokale Gesprächsaufrufe,
keine erlaubten externen Anfragen. Audio wurde in diesem Lauf nicht abgenommen.

### Demo-Meldungen

Demo-Erfolgstexte nachgeschärft: Notfälle werden als vermerkt angezeigt,
nicht als telefonisch verbunden. Neu erzeugte Demo-Notfalleinträge tragen
den Status „dokumentiert“. Nachrichten werden als Entwürfe statt als bereits
versendet bezeichnet. 16 gezielte Quelltext-/Protokolltests bestanden;
dies ist kein Nachweis einer tatsächlichen Telefonverbindung oder Zustellung.
Auch die sichtbaren Seedfälle der Demo sind daran angeglichen: Notfallhinweise
nennen nur den hinterlegten, manuell zu prüfenden Kontakt. „Als bearbeitet“
setzt ausschließlich den lokalen Demo-Status, nicht eine Karteispeicherung.
Die Termin-Dialogzeile nennt keinen SMS-Versand mehr. `data-copy.test.ts`
prüft diese Texte und die unveränderte Statusform; kein Telefon-, Versand- oder
medizinischer Ablauf wurde dadurch abgenommen.

### Nächste Abnahmen

Gezielter Datenschutz-Gatecheck am Stand `76e07ba`: Die gemeinsame Laufzeit
für Chat, Spracherkennung und Sprachausgabe verwirft externe Zieladressen
vor dem Abruf. Lokale Abrufe verbieten Weiterleitungen; erkannte Proxy-
Konfigurationen werden blockiert. Fünf Tests in
`src/lib/alma/llm-runtime-guard.test.ts` erneut bestanden, ohne echte Daten
oder Anbieteraufrufe. Das ist kein vollständiger Datenflussnachweis:
Ein kombinierter Serverfunktions-Test mit manipulierten Demo-Flags fehlt
noch. Ebenso ist nicht bewiesen, dass jeder separat laufende lokale Dienst
seinerseits niemals Daten weitergibt. Die eigenständige Live-Demo ist von
dieser lokalen Laufzeitsperre zu unterscheiden und bleibt freigabepflichtig.

Modus-Schalter vereinheitlicht: `askAlma` wertete bisher etwa den Text
`"false"` als aktivierten Demo-/Trainingsmodus aus. Beide Gesprächsflags
akzeptieren nun ausschließlich den Wahrheitswert `true`; die bereits strenge
Spracherkennung verwendet denselben Helfer. Helfertest und Typecheck bestanden.
Das belegt die Flag-Auswertung, nicht den weiterhin offenen kombinierten
HTTP-Test mit Anmeldung, Praxisdatenzugriff und externer Ausgangssperre.

Teilnachweis über HTTP ergänzt: `scripts/privacy-demo-flag-audit.mjs` sendet
acht echte Anfragen an die aus dem isolierten Produktionsmanifest aufgelöste
Gesprächsfunktion. Bei festem `demo:true` aktiviert nur `train:true` die
Lernbestätigung; `false`, die Texte `"true"`/`"false"`, 1, 0, Objekt und null
liefern normale Öffnungszeiten-Auskunft. Keine simulierten Handlerantworten,
alle Antworten melden die lokale Quelle. Ergebnis:
`artifacts/privacy-demo-flag-audit.json`, Exit 0. Der HTTP-Client folgt keinen
Weiterleitungen und begrenzt jede Anfrage auf zehn Sekunden.
Das belegt den Trainingsschalter, nicht den Demo-Schalter bei angemeldeter
Praxis, die Vokabulartrennung oder sämtliche externen Übertragungswege.

Weitere Teilabnahme: `scripts/run-privacy-practice-facts-audit.mjs` erzeugt
eine eigene temporäre Datenbank mit aktuellen Migrationen, zwei erfundenen
Praxen und vorbereiteten Sitzungen. Sechs echte HTTP-Aufrufe belegen:
`demo:true` mit Praxis-A-Sitzung verwendet ausschließlich den mitgegebenen
Demo-Hinweis; `demo:false` verwendet A statt Demo/B. Die Texte `"true"`,
`"false"` und die Zahl 1 bleiben im Praxis-A-Weg. Eine B-Sitzung liefert
ausschließlich B. Alle Antworten sind lokal. Beleg:
`artifacts/privacy-practice-facts-audit.json`, Exit 0.

Der Starter schließt die Datenbank vor dem Serverstart und entfernt danach
seinen geprüften eigenen Tempordner. Andere Audits bleiben standardmäßig
im flüchtigen Speicher; eine Datenbankfixture ist nur für diesen Test und
nur unter dem vorgesehenen Temp-Unterordner zugelassen. Keine echte
Anmeldung oder Passwortprüfung getestet: Die Sitzungen sind vorbereitet.
Die Abnahme betrifft Praxisfakten im Gespräch, nicht sämtliche Datentypen,
die Spracherkennungs-Vokabulare oder die eigenständige Cloud-Live-Demo.

Spracherkennungs-Vokabulare zusätzlich geprüft: Derselbe Fixture-Starter
mit dem Argument `privacy-practice-stt-audit.mjs` erzeugt A/B-Hörkorrekturen
und einen eigenen lokalen Testdienst. Vier echte `transcribeAlma`-Aufrufe
liefern dessen erwartete Antwort. Die tatsächlich an ihn übertragenen
Erkennungshinweise enthalten jeweils nur Demo, A oder B. Auch mit zusätzlich
mitgesendeten Demo-Begriffen behalten Praxisaufrufe ausschließlich ihr
Praxisvokabular; der Text `demo:"true"` wird nicht als Demo aktiviert.
Beleg: `artifacts/privacy-practice-stt-audit.json`, Exit 0.
Testdienst und synthetische Datenbank anschließend beendet bzw. entfernt.
Die 256 Testbytes sind keine echte Aufnahme; der Dienst gibt einen festen
Testtext zurück. Dies belegt Datenzuordnung, keine Spracherkennungsqualität
oder Datenschutzgarantie für andere Dienste.

Mikrofonbereinigung verbessert: `stopListen()` beendet die gehaltenen
Mikrofonspuren direkt, statt ausschließlich auf das spätere `onstop`-Ereignis
des Recorders zu warten. Auflegen und Entfernen der Gesprächskomponente
verwenden diesen Pfad. Die verspätete Recorderbereinigung löscht nur ihre
eigene Streamreferenz, nicht die einer neuen Aufnahme.
Drei Helfer-/Sitzungstests und Typecheck bestanden. Der neue Test prüft
die Stop-Aufrufe des Helfers, nicht den vollständigen Browser-Auflegeablauf
oder das Erlöschen der Mikrofonanzeige auf echter Hardware; diese Abnahme bleibt offen.

Ergänzender Browsernachweis: `scripts/homepage-call-teardown-audit.mjs`
prüft jetzt die tatsächliche Homepage-Bedienung gegen einen isolierten Neubau.
Mikrofonspuren und Recorder sind ausdrücklich simuliert. Das Recorder-Endereignis
wird bis nach der Prüfung zurückgehalten: Nach Auflegen sind alle drei erzeugten
Spuren bereits beendet und ein Recorder gestoppt. Eine erst nach Auflegen
freigegebene Mikrofonprobe wird ebenfalls beendet; auch nach Ablauf des
ursprünglichen Klingelzeitraums startet kein Recorder.
Beleg: `artifacts/homepage-call-teardown-audit.json`, Exit 0.
Nur lokale Seitenaufrufe; Sprachausgabe simuliert fehlgeschlagen, sonstige
Schreibanfragen und externe Ziele blockiert. Der Test belegt weder echte
Hardware noch Audioabbruch, Seitenwechsel oder sämtliche verspäteten Antworten.

Erweiterter Lauf desselben Audits belegt jetzt zusätzlich Audioabbruch und
internen Seitenwechsel: Ein synthetischer viersekündiger WAV-Ton aus der
simulierten Sprachantwort wird vom echten Chromium-Audioelement abgespielt.
Auflegen pausiert bei 0,186284 Sekunden; der interne Wechsel auf „Preise“
bei 0,241637 Sekunden. Beide Zeitstände bleiben weitere 450 Millisekunden
unverändert. Vorhandene simulierte Mikrofonspuren sind beendet, keine
aufgezeichneten JavaScript-Fehler. Isolierter Neubau und Browserlauf bestanden.
Der aktualisierte Beleg liegt weiterhin in `artifacts/homepage-call-teardown-audit.json`.
Das ersetzt keine Beurteilung der Stimme, echter Mikrofonhardware oder Live-API.

Zusätzlich entfernt `stopAudio()` die End-/Fehlerhandler vor dem Pausieren;
die statische Begrüßung prüft vor neuer Aufnahme ihre Audio- und Gesprächsidentität.
Fünf Wiedergabe-Helfertests bestanden. Der künstliche Callback-Test ist
kein Nachweis, dass eine bestimmte Browser-Ereignisreihenfolge tatsächlich auftrat.

STT-Timeout und Wiederholung (13.09.2026): Derselbe isolierte Browseraudit
hält einen lokalen STT-Request fest. Der Produktwert von 35 Sekunden wird
nur im Test auf 25 Millisekunden verkürzt; Chromium meldet den ersten Request
als abgebrochen. Eine kontrolliert danach freigegebene Altantwort erscheint
nicht. Die zweite Aufnahme erreicht einen zweiten STT-Aufruf und ihr Satz
steht im DOM. Beleg: `artifacts/homepage-call-teardown-audit.json`
(`transcribeCalls: 4`, `transcribeAborts: 3`), Audit Exit 0; der Produktcode wurde mit
Typecheck Exit 0 geprüft. `allTextContents` prüft DOM-Text, nicht Sichtbarkeit.
Der ergänzte Lauf hält für Auflegen und internen Seitenwechsel je einen
weiteren STT-Request bei normalem 35-Sekunden-Timer fest: beide werden
abgebrochen. Eine danach kontrolliert freigegebene Altantwort fügt weder eine
Gesprächszeile hinzu noch startet sie eine weitere Alma-Anfrage. Das bleibt
ein lokaler Browsernachweis mit synthetischem Transport, keine echte
Aufnahme- oder Spracherkennungsabnahme.

Gesprächsantwort-Deadline (13.09.2026): Auch ein hängender Browserrequest an
`askAlma` wird nach einer clientseitigen 35-Sekunden-Grenze abgebrochen. Der
Browser zeigt danach den Hinweis, dass eine Speicherung unklar sein kann und
die Tafel vor einem weiteren Versuch geprüft werden soll. Der Test verkürzt
nur diese Browsergrenze auf 25 Millisekunden, belegt den abgebrochenen Request
und eine wieder freigegebene Eingabe. Ein zweiter, bei normaler Grenze
aufgelegter Request wird ebenfalls abgebrochen. Kontrolliert späte Antworten
ändern weder die Gesprächszeilen noch lösen sie eine weitere Anfrage aus.
Beleg: `artifacts/homepage-call-teardown-audit.json` (`askCalls: 3`,
`askAborts: 2`), Exit 0. Der Browserabbruch sagt ausdrücklich nicht, ob eine
Serveraktion bereits gespeichert wurde; es gibt keinen automatischen Retry.

TTS-Deadline und Abbruch (13.09.2026): Jeder gestartete lokale TTS-Chunk
erhält eine eigene, an die Gesprächsgeneration gebundene 35-Sekunden-Grenze.
Auflegen, Verlassen der Komponente, neue Sprachausgabe und eine erkannte
Unterbrechung brechen die zugehörigen Browseranfragen ab. Der isolierte
Browseraudit hält die dynamische Ara-Begrüßung fest und verkürzt nur im Test
deren Browsergrenze auf 25 Millisekunden: Chromium meldet den Abbruch, der
Sprechstatus endet und eine anschließend kontrolliert freigegebene Altantwort
startet kein WAV-Audio. Ein zweiter Lauf mit normaler 35-Sekunden-Grenze
belegt denselben Abbruch beim Auflegen. Beleg:
`artifacts/homepage-call-teardown-audit.json` (`speakCalls: 15`,
`speakAborts: 3`), Exit 0, keine Browserfehler. Das ist kein Nachweis einer
echten Stimme oder eines Anbieterdiensts. Ergänzend erzwingt derselbe Audit
eine trainierte Begrüßung mit zwei längeren Sprachchunks: Der erste lokale WAV
spielt nachweislich bis 0,279771 Sekunden, während der exakt korrelierte zweite
Request gehalten wird. Auflegen bricht ihn ab; eine danach freigegebene
Altantwort startet kein weiteres WAV und erzeugt keine unbehandelte Promise.
Der Unterbrechungsfall durch hereinsprechende Anrufende ist separat unten
mit einem lokalen Analyser-Signal geprüft.

Barge-in bei lokaler SprechenCall-Ausgabe (13.09.2026): Ein eigener isolierter
Browseraudit hält den TTS-Request bei normaler 35-Sekunden-Grenze fest und
liefert dem bestehenden `startBargeWatch()`-Pfad über echtes RAF-/Analyser-
Polling erst Stille und dann ein synthetisches RMS-Signal von 0,1. Nach mehr
als 750 Millisekunden Stille gibt es weder Abbruch noch Recorderstart. Das
laute Signal bleibt über die eingebaute Schwelle; der TTS-Request wird
abgebrochen und die Aufnahme erhält exakt den zuletzt analysierten
Barge-Stream, ohne eine weitere Mikrofonfreigabe. Eine danach freigegebene
lokale Altantwort erzeugt kein Audio und keine unbehandelte Promise. Beleg:
`artifacts/homepage-barge-audit.json` (Exit 0; `speakCalls: 1`,
`speakAborts: 1`, keine Browserfehler). Das ist weder eine Hardware- oder
Sprachqualitätsabnahme noch ein Nachweis für GPT-Live-1.

STT-Protokollschutz (13.09.2026): Frei gelieferte MIME-Werte werden nur als
feste Formatklasse (`webm`, `wav`, `ogg`, `mpeg` oder `unknown`) protokolliert.
Der Catch-Pfad schreibt ausschließlich `fehler=runtime`, nie die ursprüngliche
Fehlermeldung. Ein synthetischer Marker mit Zeilenumbruch wird weder in der
Format- noch in der Fehlerzeile ausgegeben. `stimme-http.test.ts` (8 Tests)
und Typecheck bestanden. Das betrifft nur diese STT-Betriebszeilen, nicht die
gesamte Protokollierung der Anwendung.

Jeder neue Fehler erhält einen reproduzierbaren Ablauf. Zuerst beheben, dann
denselben Ablauf prüfen. Vorhandene unveränderte Nachweise wiederverwenden.

Demo-Regelverwaltung ergänzt (12.09.2026): Die bisher auf fünf Hinweise
begrenzte Liste zeigt jetzt alle gespeicherten Regeln in einem scrollbaren
Bereich. Ein einzelner veralteter Hinweis lässt sich nach Gesprächsende
löschen; während Klingeln/Gespräch ist Löschen gesperrt. Damit sind auch
ältere Regeln nach Neuladen erreichbar. Der Speicherhelfer meldet Erfolg
nur nach Speicherung; bei Speicherfehler bleiben Regel und Browserbestand
erhalten. Ein veralteter Verweis auf die zuletzt korrigierbare Regel wird
nach erfolgreichem Löschen entfernt. Widersprüche werden weiterhin nicht
automatisch erkannt oder aufgelöst. Die neue Listenbedienung benötigt noch
einen Browser-Abnahmelauf; bislang kein Neubau der laufenden Installation.
Nachweis: drei Storetests bestanden, einschließlich Speicherverweigerung,
erfolgreicher Wiederholung und mindestens sechs Regeln mit widersprüchlichen
Parkhinweisen. Nach gezielter Löschung stimmen Speicherbestand und erneut
geladener Zustand überein; die Antwortauswahl nennt nur den verbleibenden
Parkhinweis. Zusätzlich bestanden elf Trainingstests, fünf Begrüßungstests
und die Typprüfung vor der letzten Testergänzung. Kein echter Browser-Reload
oder Mikrofontest in diesem Nachweis.

Nachfolgende Browser-Abnahme bestanden: `scripts/homepage-knowledge-management-audit.mjs`
gegen isolierten lokalen Neubau von `a48b654`, nicht gegen die laufende Installation.
Sieben synthetische Regeln sind bei 320 Pixeln Breite ohne horizontalen Überlauf
zugänglich. Ein tatsächlicher, gezielt verweigerter Browser-Speichervorgang
erzeugt die Fehlermeldung und erhält die Regel; Wiederholen löscht nur die
gewählte alte Parkregel. Nach echtem Seiten-Reload erscheinen die sechs
verbleibenden Regeln, die alte Löschschaltfläche fehlt. Im Sprachtraining
erscheint keine Praxisregelliste. Keine Server-Schreibanfragen oder
JavaScript-Fehler; eigener Testserver anschließend beendet.
Beleg: `artifacts/homepage-knowledge-management-audit.json`, Exit 0.
Vier angeforderte externe GET-Ressourcen wurden ausdrücklich blockiert:
Grok-Vorschau-Erweiterung und Google Fonts jeweils vor/nach Reload.
Dieser Lauf beweist deshalb keine vollständig fremdressourcenfreie Homepage.
Die Herkunft und Notwendigkeit dieser Ressourcen bleibt separat zu prüfen.

Diese Ressourcen sind im nachfolgenden lokalen Neubau entfernt: Figtree und
Fraunces liegen mit ihren Lizenzen unter `public/fonts`; der lokale Build
speichert `includeExtensions:false` für die Vorschau-Injektion. Der Server
wurde ohne ein entsprechendes Laufzeitflag gestartet. Derselbe Browseraudit
besteht jetzt mit null externen Anfragen, vier geladenen Schriftvarianten
(beide Familien normal/kursiv) und sechs lokalen WOFF2-Antworten mit HTTP 200.
Regelverwaltung, Speicherfehler/Wiederholung und Reload bei 320 Pixeln bestehen
weiterhin; keine JavaScript-Fehler. Der aktualisierte JSON-Beleg ersetzt den
vorherigen Lauf mit blockierten Fremdressourcen. 49 PWA-Tests, Typprüfung,
isolierter Node-Build und Browseraudit bestanden. Die Tests belegen außerdem
die gespeicherte lokale Buildentscheidung und den unveränderten Cloud-Default;
keine Cloud-Veröffentlichung oder Prüfung aller Seiten/Browser durchgeführt.
Die laufende Originalinstallation wurde weder neu gebaut noch gestartet.

Kapazitätsgrenze gegen stillen Datenverlust korrigiert: Eine 41. neue
Demo-Regel verdrängt nicht mehr die älteste. Der Speicherhelfer lehnt sie ab;
die Oberfläche erhält die Eingabe und erklärt, dass nach Gesprächsende
ein nicht mehr benötigter Hinweis gelöscht werden muss. Der authentifizierte
Praxis-Speicherpfad ist unverändert. Vier Storetests bestanden, darunter
40→41 mit unverändertem Speicherbestand, identische Wiederholung, Ersetzen
bei voller Liste und Löschen mit anschließend erfolgreichem Hinzufügen.
Typprüfung bestanden. Die neue Kapazitätsmeldung benötigt noch einen
Browsernachweis; der vorherige Lösch-Audit belegt diesen neuen Grenzfall nicht.

Kapazitäts-Browsernachweis anschließend bestanden: isolierter Neubau von
`091aaa4`, `scripts/homepage-training-capacity-audit.mjs`, Exit 0. Vierzig
synthetische Regeln bleiben beim 41. Hinweis exakt erhalten; letzte
Assistentenzeile ist die Kapazitätsmeldung und die Eingabe bleibt im Feld.
Nach Gesprächsende, gezieltem Löschen und neuem Trainingsstart wird ohne
erneutes Eintippen gespeichert. Nach Seiten-Reload sind exakt die neue
Regel und die 39 nicht gelöschten Regeln vorhanden. Zwei tatsächliche lokale
Trainingsanfragen, keine externen Anfragen, unbekannten Schreibaufrufe oder
JavaScript-Fehler. Mikrofon und Sprachausgabe sind simuliert; keine
Sprachqualitätsabnahme. Beleg: `artifacts/homepage-training-capacity-audit.json`.
Eigener Testserver beendet; Originalinstallation unverändert.

Lokaler Sprachvergleich (12.09.2026): Piper mit UTF-8, whisper.cpp `small`,
Deutsch und vier Threads; drei synthetische Sätze jeweils ohne/mit bestehendem
Fachprompt. Direkter lokaler Transport, keine Homepage- oder Mikrofonabnahme.

| Eingabe | Ohne Fachprompt | Mit Fachprompt |
|---|---|---|
| Wie sind die Öffnungszeiten? | „Wir sind die Öffnungszeiten.“ · 6,156 s | gleich falsch · 7,363 s |
| Morgen statt heute. | exakt erkannt · 6,071 s | „Morgenstatt heute“ · 7,587 s |
| Bitte keinen Termin buchen, nur zurückrufen. | exakt erkannt · 6,873 s | exakt erkannt · 7,725 s |

Der Fachprompt verbessert den konkreten Fehler nicht und erhöht in diesen
Einzelmessungen die Laufzeit. Daher keine Änderung der Produktionseinstellung.
Die Kette vor der Homepage erzeugt den Restfehler ebenfalls; das grenzt ihn
ein, trennt aber nicht sicher Sprachsynthese und Erkennungsmodell als Ursache.
Kein allgemeiner Akzent-, Qualitäts- oder Leistungsnachweis aus sechs Proben.

Rohbeleg und ausgeführtes Skript: `artifacts/audio-stt-prompt-compare-20260912.json`
und `.py`. Die Rohfelder `critical_meaning_preserved` beruhen nur auf
Wortprüfungen, nicht auf einer fachlichen Bewertung. `external_requests:0`
ist dort eine feste Metadatenangabe, keine Verkehrsmessung. Nachweisbar sind
konfigurierte Loopback-Ziele und HTTPX ohne Umgebungsproxy/Weiterleitungen.
Die zwei eigenen Erkennungsprozesse wurden beendet; keine Modell-Downloads,
keine Änderungen an Produktionsparametern oder Originalinstallation.

Aktionsfehler nach korrekt erkannter Negation behoben: „Bitte keinen Termin
buchen, nur zurückrufen.“ konnte wegen des Wortes „Termin“ den Buchungspfad
erreichen. Explizite Ablehnungsformulierungen werden jetzt vor der positiven
Termin-/Rückrufzuordnung geprüft. Der Buchungsschutz und die Aktionskorrektur
weisen auch eine irrtümlich als `book` eingehende Aktion zurück. Eine dabei
entstandene freie Buchungszusage wird im Fall `none/Info` durch „Ich buche
keinen Termin. Wobei kann ich Ihnen sonst helfen?“ ersetzt; ein ausdrücklich
gewünschter Rückruf erhält weiterhin die Rückrufantwort.

34 Entscheidungs-/Helfertests und Typprüfung bestanden: beide Negationsfälle,
positive Termin-/Rückrufwünsche, „Ich habe noch keinen Termin und möchte einen
buchen.“, die Alternative „Keinen Termin am Montag, sondern einen am Dienstag.“,
irrtümliche Buchungsaktion sowie unveränderte Notfall-/Trainingsaktionen.
Das ist kein vollständiger Handler-, Browser- oder Datenbanknachweis: Die
Tests rufen lokale Antwort- und Schutzfunktionen auf. Komplexe Verneinungen,
mehrdeutige zeitliche Einschränkungen und allgemeines Sprachverständnis sind
damit nicht abgenommen. Keine echten Gespräche oder externen Modellaufrufe.

Nachfolgender Homepage-Nachweis: `scripts/homepage-negation-audit.mjs` gegen
isolierten Neubau von `ec968b3`, Exit 0. Vier echte lokale `askAlma`-Anfragen,
nicht simuliert; jeweilige sichtbare Assistentenzeile entspricht der
Serverantwort. Verneinte Buchung mit gewünschtem Rückruf erzeugt null Termine
und einen Rückrufzettel. Verneinter Rückruf mit Öffnungszeitenfrage erzeugt
weder Termin noch weiteren Rückrufzettel. Die positive Termin-Kontrolle
erzeugt genau einen Termin; ein positiver Rückruf erzeugt nur den zweiten
Rückrufzettel. Nach Reload stimmen vollständige gespeicherte Termin-, Anruf-
und Rückrufthread-Listen mit dem Zustand davor überein (1/4/2 Einträge).
Beleg: `artifacts/homepage-negation-audit.json`. Keine externen Anfragen,
unerwarteten Schreibaufrufe oder JavaScript-Fehler; Testport anschließend frei.
Mikrofon und Sprachausgabe simuliert. Dieser Nachweis gilt für den
Browser-Demospeicher, nicht für authentifizierte Praxisdatenbank oder Telefon.

Fehlerzustände müssen verständlich sichtbar sein, Eingaben erhalten bleiben
und Wiederholungen ohne doppelte Speicherung funktionieren.

Tests laufen in einer isolierten Kopie mit erfundenen Daten. Die bestehende
Installation und ihr Ausgabeordner bleiben unverändert. Echte Praxisdaten
dürfen nie an externe KI-Dienste gelangen. Ein Live-Hörtest benötigt separate
Freigabe; eine vorbereitete Aufnahme belegt keine Unterbrechbarkeit.

Marketing-Textprüfung (12.09.2026): Preise und beide Pakete wurden gezielt
gegen Live-Freigabe, Versand, Praxissoftware-Anbindung sowie Kosten- und
Datenschutzgarantien gelesen. Die Preiseseite und Pakettexte waren bereits
vorsichtig formuliert. Korrigiert wurde ausschließlich eine falsche
Homepage-Beispielzeile: Keine behauptete Vetmeduni-Übergabe und kein
mitgeschicktes Protokoll mehr, sondern ein Hinweis auf den tierärztlichen
Notdienst und ein für das Team offener Vorgang. SMS bleibt ein Entwurf. Die
gezielten Landing- und Pakettexte-Tests (3) sowie die Typprüfung bestanden;
kein Browseraudit, Provideraufruf oder Preis-/Leistungsversprechen wurde
hinzugefügt.

## Lokales Demo-Praxiswissen: Speicherumbau (12.09.2026)

Getrennte IndexedDB statt gemeinsamer Gesamtzustands-Schreibvorgänge.
`trained-facts-repository.browser-audit.mjs` und
`trained-facts-store.browser-audit.mjs` prüfen echte Browsertransaktionen,
Migration, konkurrierende Änderungen, Abbruch/Retry und die 40-Regeln-Grenze.
Die angepassten Homepage-Audits für Begrüßung (normal und Speicherfehler),
Regelverwaltung, Kapazität, Sprachkorrektur-Retry und Gesprächsende bestanden
gegen den isolierten lokalen Nitro-Build. Frühere Läufe gegen veraltete
Build-Ausgaben zählen nicht. Keine echten Praxisdaten oder externen KI-Aufrufe.

Der Gesprächsende-Audit verzögert lokale Datenbankantworten: vor Freigabe und
500 ms nach einem Seitenwechsel jeweils 0 Mikrofon-/Audiostarts. Dieselbe
positive Kontrolle startet auf der Homepage innerhalb von 3 Sekunden.
Auflegen, verspätete Mikrofonfreigabe und Audiostopp bleiben geprüft.
Typprüfung bestanden. Synthetisches Audio belegt keine Stimmenqualität.

Nicht in der laufenden Homepage aktiviert. Alte Tabs müssen nach einem Update
neu geladen werden; keine Freigabe für gemischte Programmversionen oder die
gesamte Produktion. Historischer Datenverlust-Repro: Commit `63b3d45`.
