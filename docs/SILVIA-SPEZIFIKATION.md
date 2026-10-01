# Silvia – zentrales Produktdokument

Stand: 15. September 2026. Dieses Dokument beschreibt Produktziel, aktuellen
Umsetzungsstand und offene Entscheidungen. Es ist kein Nachweis absoluter
Sicherheit, Datenschutzkonformität oder einer bereits freigegebenen Live-
Architektur.

Statusangaben: **implementiert** = im aktuellen Stand nachvollziehbar,
**geplant** = Ziel, noch nicht als fertiges Produkt freigegeben,
**zu prüfen** = fachlich oder technisch noch abzunehmen.

### Terminwunsch und Korrektur – Zwischenstand

Ein korrigierter Tag darf niemals als Zustimmung zum alten Termin gelten.
Klare Tageswünsche werden in der Slot-Auswahl berücksichtigt; kein freier
Termin am Wunschtag bedeutet Rückfrage statt stiller Buchung an einem anderen
Tag. Datumshelfer und simulierte Connector-Buchung sind teilgeprüft.
Ein konkreter Wunsch mit Datum und Uhrzeit wird als `Terminwunsch` sichtbar an
die Tierarzthelferin weitergegeben, aber nie automatisch als Termin-Slot
gebucht. Ohne Datum bleibt die Zeitangabe unklar. Die vollständige Abnahme mit
echter Sprache und Oberfläche ist noch offen. Details:
`DATENSCHUTZ-ABNAHME-2026-09-12.md`.

### Verbindliche Datenregel (Nutzerentscheidung 12. September 2026)

Echte Praxisdaten dürfen niemals an externe KI-Dienste übermittelt werden.
Das gilt auch für Datenbankkopien, Gesprächsaufnahmen, Transkripte und daraus
abgeleitete Texte. Die lokale Nutzung der vertraulichen Vquadrat-Kopie für
Anbindung und Tests ist erlaubt. Externe Sprach-/Live-Tests dürfen ausschließlich
erfundene Daten verwenden, ohne Zugriff auf Praxisbestand oder Gesprächshistorie.
Diese Regel ersetzt frühere Formulierungen über eine mögliche separate Freigabe
echter Daten für externe KI. Ihre technische Durchsetzung ist noch abzunehmen;
bis dahin keine echten Praxisgespräche mit externen KI-Modellen.

Chat, Erkennung und Sprachausgabe lassen zur Laufzeit ausschließlich echte
Loopback-Ziele zu; öffentliche oder umgeleitete Kompatibilitäts-Ziele werden
vor dem Netzwerkzugriff gesperrt. Das ist eine technische Teilsperre, keine
vollständige Datenfluss- oder Rechtsabnahme.

Eine lokal geöffnete Webseite bedeutet nicht lokale KI-Verarbeitung. Die
OpenAI-Live-Hörprobe überträgt Mikrofonton extern. Sie bleibt deaktiviert bis zur
gesonderten Demo-Abnahme. Ein Hinweis oder Modell-Prompt verhindert nicht, dass
jemand echte Daten ins Mikrofon spricht; das ist keine technische Datensperre.
Der WebRTC-Browserkanal der getrennten Hörprobe ist zusätzlich auf das sofortige
Schließen der Sitzung beschränkt; er erhält nur Start-, Abschluss-, Transkript-
und Fehlermeldungen. Begrüßung und Abschlusskontrolle laufen über den
vertrauenswürdigen Serverkanal. Das begrenzt Browserrechte, macht externes Audio
aber weder lokal noch die Hörprobe produktiv freigegeben.
Für den Praxisbetrieb sind lokale Spracherkennung, Antwortverarbeitung und
Sprachausgabe erforderlich. Die bisherigen Cloud-Stimmen sind dafür nicht
freigegeben. Auch lokale Zwischenserver dürfen keine Inhalte weiterleiten.

## 1. Zielgruppe und Produktziel

Silvia ist eine KI-Rezeption für österreichische Tierordinationen. Sie soll
Mitarbeiterinnen am Empfang bei Anrufen, Terminwünschen, Rückrufen,
Notfall-Hinweisen, Protokollen und ordinationsspezifischem Wissen unterstützen.
Die aktuelle Produktbasis ist die bestehende **Silvia Premium**-Version. Eine
natürlichere, unterbrechbare **Silvia Live**-Variante ist geplant.

Die Startseite ist eine Demo-/Verkaufsumgebung; die Praxistafel unter `/app`
ist der ordinationsbezogene Betriebsbereich. Diese Trennung ist in `README.md`
und `src/components/sprechen/sprechen-call.tsx` beschrieben.

## 2. Stimme und Persönlichkeit – vereinbart

Vereinbarte Stimmvorgabe:

> Sprich mit einer warmen, weiblich klingenden Stimme und deutlich österreichischer Sprachmelodie. Sei herzlich, charmant und natürlich – wie eine sympathische Mitarbeiterin am Empfang einer Wiener Ordination. Mit einem kleinen Lächeln in der Stimme, entspannt und aufmerksam. Kein übertriebener Dialekt, keine Werbestimme und kein flirtender Ton.

Bei Sorgen um ein Tier oder Notfällen bleibt sie ruhig und sachlich.

Das ist eine Verhaltensvorgabe, keine Garantie für Akzenttreue. Die konkrete
Stimme wird erst nach einem Hörtest mit Begrüßung, Rückfragen, Namen, Zahlen
und einem besorgten Gegenüber freigegeben. Bis zu einer ausdrücklichen
Änderung bleibt die bestehende Stimme unverändert.

## 3. Pakete und Status

| Bereich | Status | Nachweis / Einordnung |
|---|---|---|
| Silvia Premium: bestehende Gesprächsversion | implementiert | Gesprächs- und Aktionslogik in `src/components/sprechen/sprechen-call.tsx` und `src/lib/alma/ask-alma.ts`; Demo und ordinationsbezogener Pfad sind getrennt. |
| Training und Praxiswissen | implementiert | Trainingsmodus, Sprachtraining und Korrekturpfad in `src/components/sprechen/sprechen-call.tsx`, Speicherung/Korrektur in `src/lib/practice/facts.ts`. |
| Zwei öffentliche Paket-Hörproben | implementiert | Vergleichskomponente in `src/components/silvia-varianten.tsx`; Hörproben ändern kein laufendes Gespräch. |
| Silvia Live: natürliches, unterbrechbares Gespräch | Cloud-Anbindung implementiert, deaktiviert, nicht real abgenommen | Die Cloud-Live-Demo hat einen begrenzten Server-/WebSocket-Lifecycle und ist standardmäßig deaktiviert. Ein echtes Testkonto-Gespräch ausschließlich mit erfundenen Inhalten sowie Kosten-, Provider-Aufbewahrungs- und Sprachabnahme fehlen; sie ist kein buchbares Praxisgespräch. |
| Preise und Gleichwertigkeit der Praxisfunktionen | zu prüfen | Noch nicht freigegeben; keine Preise oder Leistungsmetriken aus dieser Spec ableiten. |
| AVV-/Rechtsunterlagen | geplant / zu prüfen | `docs/PLAN_AP50-54_Profi-Features.md` führt eine AVV-Seite als AP 54; vor Nutzung juristisch prüfen. |

Preis- und Hörprobenseite verwenden gemeinsam genau zwei Paketdefinitionen:
Silvia Premium und Silvia Live. Feste Altpreise und Dreierpakete wurden dort
entfernt; Leistungsumfang und Preise bleiben abzustimmen. Die Akte-Demo ist
eine Funktion mit Beispieldaten, kein drittes Sprachpaket. Vorhandene
Aufnahmen sind kein Nachweis für zusätzliche unterschiedliche Pakete.
Die beiden gespeicherten Hörproben verwenden bewusst verschiedene Klangquellen:
Die Premium-Hörprobe ist lokal mit der weiblichen Piper-Alternative
`ramona-low.onnx` erzeugt; daraus lässt sich die aktuelle Betriebskonfiguration
nicht beweisen. Die Live-Hörprobe mit Marin zeigt ebenfalls nur den Klang. Beide entsprechen nicht automatisch
einem echten Live-Gespräch: Unterbrechen können Sie erst im freigegebenen
Live-Gespräch. Klang und Gesprächsqualität bleiben abzustimmen und abzunehmen.
Der Unterschied zum Cloud-Live-Gespräch muss mit erfundenen Inhalten erlebbar
sein, ohne externe Verarbeitung echter Praxisdaten. Die Homepage zeigt den
Live-Hörtest sichtbar, aber standardmäßig gesperrt. Erst nach echter
Gesprächsabnahme und ausdrücklicher Freigabe darf ein Klick eine externe
Sitzung oder eine Mikrofonabfrage auslösen.

Cloudflare kann für abgeschottete Ausführung zusätzlicher Agentenaufgaben
ein möglicher Baustein sein, ist aber keine Voraussetzung für ein
Sprachgespräch und noch keine Architekturentscheidung.

## 4. Funktionen und klarer Umsetzungsstand

### Implementiert

- Gespräch mit Text- und Sprachpfad, serverseitiger Transkription/TTS und
  lokalem Fallback; siehe `README.md`, `src/lib/alma/transcribe.ts`,
  `src/routes/api/stimme/` und `src/components/sprechen/sprechen-call.tsx`.
- Ordinationszeiten, Terminwunsch, Rückruf, Notfall- und Protokollpfade;
  die erlaubten Aktionsarten werden in `src/lib/alma/actions.ts` und
  `src/lib/alma/ask-alma.ts` verarbeitet.
- Praxiswissen wird als formulierte Regel gespeichert, geladen und gelöscht;
  eine Korrektur ersetzt den bestehenden Hinweis statt einen widersprüchlichen
  zweiten anzulegen (`src/lib/practice/facts.ts`).
- Fehlgeschlagene Praxis-Wortkorrekturen bleiben erneut versuchbar; ein Fehler
  der optionalen Wortkorrektur macht erfolgreich gespeichertes Praxiswissen
  nicht rückgängig. Demo- und authentifizierte Sprachkorrektur sowie das
  erneute Speichern von Praxiswissen sind im Browser mit kontrolliertem
  Speicherfehler geprüft. Der kombinierte Teilerfolg beider Speicherwege
  bleibt offen. Für authentifizierte UI-Sprachkorrekturen ist auch eine
  verlorene Erfolgsantwort geprüft: derselbe Versuch behält eine zufällige
  Vorgangsnummer und erzeugt beim Wiederholen keinen Doppeleintrag.
  Geänderte Inhalte unter derselben Nummer werden abgelehnt; die Nummer gilt
  nur innerhalb der angemeldeten Praxis. Auch beim Anlegen von Praxiswissen
  ist die verlorene Erfolgsantwort lokal geprüft: die vorhandene Textprüfung
  liefert beim Wiederholen denselben Hinweis ohne Doppelzeile. Änderungen und
  Zusammenführungen sind serverseitig mit stabiler Quell-ID und atomarem
  Datenbankschritt gegen identische Wiederholungen abgesichert; bei einem
  Update-Fehler bleibt der vorherige Bestand erhalten. Die Korrektur-Oberfläche
  nach verlorenem Merge-Ergebnis und parallele Anfragen bleiben offen; alte
  Sprachkorrektur-Aufrufer ohne Vorgangsnummer sind nicht abgesichert.
- Demo-Praxiswissen: Der lokal geprüfte Speicherumbau verwendet eine
  getrennte lokale Browserdatenbank mit atomaren Schreibvorgängen. Ziel ist,
  dass zwei Tabs fremde Ergänzungen nicht überschreiben und eine Korrektur
  mit veraltetem Ausgangstext abgewiesen wird. Gültige vorhandene Regeln sind
  einmalig unverändert zu übernehmen; ein vorhandener leerer Bestand darf
  nicht erneut aus alten Daten befüllt werden. Speicher- und Zwei-Tab-Tests
  sowie gezielte Homepage-Regressionen sind positiv. Aktivierung in der
  laufenden Homepage und vollständige Produktionsfreigabe stehen aus.
  Bereits vor dem Update geöffnete Versionen müssen neu geladen werden.
  Praxisgebundene Daten angemeldeter Ordinationen bleiben davon getrennt.
- Authentifizierte Sprachkorrekturen liegen praxisgebunden in der Datenbank
  und werden dadurch mit der lokalen Praxissicherung wiederhergestellt.
  Alte gültige, eindeutig zugeordnete JSONL-Einträge werden atomar einmalig
  übernommen; spätere Löschungen werden nicht durch erneuten Import aufgehoben.
  Die Altdatei bleibt unverändert erhalten. Alte Backups ohne Sprachkorrekturen
  bleiben lesbar, enthalten danach aber keine nachträglich erfundenen Korrekturen.
- „Sprache erkennen“ zeigt nicht klickbare Fachbegriff-Beispiele; „Praxiswissen“
  behält anklickbare Regeln. Helper-Test und Typprüfung sind grün, der
  Fake-Chromium-Mikrofon-Browsertest ist bestanden; echte Hardware, Akzent und
  Stimme stehen noch aus.
- Anrufe, Protokolle und Mails werden nach der je Ordination eingestellten
  Aufbewahrungsfrist serverseitig gelöscht: Prüfung beim Serverstart und danach
  alle 24 Stunden, solange der Prozess läuft. Datensätze exakt am Grenzzeitpunkt
  bleiben bis zu einer späteren Prüfung erhalten. Kartei, Termine, Praxiswissen
  und Sprachkorrekturen sind nicht Teil dieser Routine. Bereits erstellte
  Sicherungen und die erhaltene Altdatei werden dadurch nicht bereinigt;
  hierfür ist eine getrennte Aufbewahrungs-/Löschregel freizugeben. Das ist keine
  Zusage einer sofortigen oder vollständigen Löschung bei allen Dienstleistern
  (`README.md`, `src/lib/practice/retention.ts`).
- Praxissoftware-Bridge und Vquadrat-Testablauf sind dokumentiert bzw. im
  aktuellen Code vorgesehen; die Ende-zu-Ende-Abnahme folgt ausschließlich
  `docs/GEMEINSAME-ABNAHME.md` und `docs/PMS-BRIDGE.md`. Sie verwendet nur
  synthetische Testdaten, niemals eine Kopie echter Praxisdaten.

### Geplant

- Echtes Silvia-Live-Testgespräch: maximal zwei Minuten, unterbrechbar,
  sichtbar beendbar, mit begrenzten Kosten (geplant, nicht abgenommen).
- Produktentscheidung zu Preis, Paketumfang und Gleichwertigkeit der
  Praxisfunktionen.
- AVV-Seite und rechtliche Prüfung gemäß `docs/PLAN_AP50-54_Profi-Features.md`.

### Zu prüfen

- Hörtest und Freigabe des warmen österreichischen Stimmprofils.
- Tatsächliche Datenflüsse, Speicherorte, Löschfristen, Dienstleister-
  bedingungen und Mandantentrennung vor jedem Kundenversprechen.
- Live-Architektur, Providerwahl, Unterbrechungslogik und Kostenbegrenzung.
- Ende-zu-Ende-Abnahme der Bridge ausschließlich gegen eine synthetisch
  erzeugte Testdatenbank nach `docs/GEMEINSAME-ABNAHME.md` und
  `docs/PMS-BRIDGE.md`; die historische `LIVE-TESTANORDNUNG.md` ist gesperrt.

## 5. Training und Gespräch

**Training** ist ein eigener Modus. Die Mitarbeiterin kann Praxiswissen
merken, einen Fachbegriff sprechen und eine erkannte Formulierung anschließend
korrigieren. Das Training schreibt Praxisfakten bzw. ersetzt sie kontrolliert;
es ist kein normaler Kundenanruf und soll keine ungewollte Termin- oder
Aktenaktion auslösen (`src/components/sprechen/sprechen-call.tsx`,
`src/lib/practice/facts.ts`).

**Gespräch** ist der Anrufmodus. Er beantwortet die aktuelle Anfrage und darf
nur die für diesen Turn erlaubte Aktion ausführen, etwa Auskunft, Rückruf,
Notfallhinweis oder Terminpfad (`src/lib/alma/actions.ts`,
`src/lib/alma/ask-alma.ts`). Training und Gespräch bleiben in Oberfläche und
Datenfluss getrennt zu halten ist ein Abnahmekriterium. Ein vollständiger
Nachweis fehlerfreier Trennung und Gesprächsfortführung steht noch aus.

Ausdrücklich abgelehnte Buchungen wie „Bitte keinen Termin buchen, nur
zurückrufen“ dürfen weder eine Buchungsaktion noch eine Buchungszusage
erzeugen. Die lokale Aktionsauswahl und der Buchungsschutz berücksichtigen
dafür konkrete Ablehnungsformulierungen; ein Rückruf bleibt ein Rückruf.
Die Prüfung dieser Formulierungen ist kein allgemeines Sprachverständnis
und ersetzt keine Abnahme mehrdeutiger Gesprächsverläufe.

Bereits bekannte Namen werden nicht unnötig erneut erfragt. Eine angezeigte
Telefonnummer darf nur verwendet werden, wenn sie tatsächlich übergeben wird.
Sie ist allein kein Identitätsnachweis. In der Demo ist eine simulierte
Anrufernummer als solche einzuordnen. Fehlende Angaben werden gezielt erfragt.

Die Korrekturzeile heißt „Korrigieren“. Im echten Anruf gibt es keinen zweiten
roten Auflegen-Knopf: Der große Knopf ist während der laufenden Leitung rot
und heißt „Auflegen“. Nur nach einem konkreten Mikrofonfehler wird er wieder
zu „Sprechen“, damit ein neuer Versuch möglich ist. Satzende erkennt Silvia
automatisch an einer kurzen Sprechpause. Im Training bleiben „Sprechen“,
„Fertig“ und „Schulung beenden“ getrennt erhalten.

## 6. Datenfluss und Sicherheitsanforderung

Die gesonderte Cloud-Live-Demo benötigt vor einem freigegebenen lokalen Test
eine ausdrücklich gesetzte RAM-Sandbox (`SILVIA_LIVE_DEMO_SANDBOX=1` und
`SILVIA_DATA_DIR=memory`) sowie einen persistenten Schutzordner
(`SILVIA_LIVE_GUARD_DIR`). Eine gesetzte `DATABASE_URL` oder ein anderer
Datenspeicher sperren den Start vor Mikrofon, WebRTC und Anbieteraufruf.
Eine ungeklärte Sitzungsreservierung blockiert neue Starts auch nach
Prozessneustart; bestätigter Abschluss gibt nur die eigene Reservierung frei.
Das ist kein Euro-Kostenlimit und kann nicht beweisen, was jemand in einer
zugelassenen Demo spricht. Betriebsgrenzen und lokale Tests stehen in
[Silvia Live Demo](SILVIA_LIVE_DEMO.md).
Der getrennte Start `npm run live:sandbox -- --confirm-synthetic` erzwingt
diese RAM-Konfiguration auf `127.0.0.1:8093`. Er startet noch keine
Anbietersitzung; diese braucht weiterhin den sichtbaren Browser-Klick und die
Bestätigung erfundener Inhalte.

Der Praxisserver bleibt auf dem eigenen Rechner; mobiler Zugriff braucht einen
HTTPS-Reverse-Proxy. Wird dessen Header-Vertrauen mit
`SILVIA_TRUST_PROXY_HEADERS=1` aktiviert, muss der Proxy alle Weiterleitungs-
header selbst ersetzen und den Direktzugriff sperren. Silvia setzt das
Sitzungscookie dann immer als HTTPS-geschützt; eine fehlerhafte HTTP-Proxy-
Konfiguration verhindert die Anmeldung statt ein ungeschütztes Cookie zu
verwenden.

Die Gestaltungsschriften Figtree und Fraunces werden mit Lizenzdateien unter
`public/fonts` mitgeliefert, nicht zur Laufzeit von Google Fonts geladen.
Server-Schlüssel bleiben ohne `VITE_`-Präfix. Erkennt der Vite-Start in `.env`
oder in der Prozessumgebung eine Browser-Variable mit Schlüssel, Secret, Token,
Passwort oder Zugangsdaten im Namen, bricht der Build vor der Browser-Ausgabe
ab und nennt nur den Variablennamen, nie dessen Wert. Das ist eine technische
Sperre gegen einen versehentlichen Schlüsselversand, keine Zusage über andere
Datenwege.
Kein Build bindet die Grok-Vorschau-Erweiterung standardmäßig ein. Sie darf nur
für eine bewusst freigegebene Plattform-Vorschau mit
`SILVIA_ENABLE_GROK_EXTENSIONS=1` gebaut werden; der lokale Produktionsaufbau
(`SILVIA_LOCAL_NITRO=1`) sperrt sie auch dann. Die Entscheidung wird im Build
gespeichert. Das ersetzt keine Prüfung weiterer Datenwege und keine Abnahme
einer bereits laufenden älteren Installation.

1. Browser oder Telefon übergeben Sprache bzw. Text an den Server. Der
   Sprachpfad nutzt `/api/stimme/hoeren` für Transkription und
   `/api/stimme/sprechen` für die Antwortstimme (`src/lib/alma/transcribe.ts`,
   `src/routes/api/stimme/`).
2. Der Server ordnet den Zugriff über die Praxissitzung der Ordination zu und
   lädt Praxisprofil, Regeln und – erst nach dem Datenabgleich – notwendige
   Aktenauszüge (`src/lib/practice/profile.ts`, `src/lib/practice/session.server.ts`,
   `src/lib/alma/ask-alma.ts`).
3. Ziel ist, dem Modell nur den erforderlichen Kontext zu übergeben. Diese
   Datenminimierung ist für jeden Pfad zu prüfen. Lokale
   Regeln können eine Modellantwort ersetzen; die Antwort wird in eine
   begrenzte Aktionsstruktur übersetzt und serverseitig weiterverarbeitet.
4. Ergebnis, Protokoll oder Termin gehen zurück an die Tafel bzw. an die
   freigegebenen Praxisdienste. Die Aufbewahrungsroutine ist in
   `src/lib/practice/retention.ts` nachvollziehbar.

Die Homepage-Demo speichert Praxiswissen im Browser.
Die lokale Antwortauswahl verwendet Wortübereinstimmungen, kein allgemeines
Sprachverständnis. Widersprüchliche gespeicherte Regeln werden derzeit nicht
automatisch aufgelöst; mehrere passende Regeln können gemeinsam erscheinen.
Eine allgemeine Zusage „die neueste Regel gewinnt“ gilt deshalb nicht.
Die Demo-Trainingsansicht macht deshalb alle gespeicherten Regeln (bis zu 40)
in einer scrollbaren Liste zugänglich. Veraltete Regeln können einzeln gelöscht
werden, solange kein Gespräch läuft. Bei fehlgeschlagener Speicherung bleibt
die Regel erhalten und eine Fehlermeldung erscheint. Dies ist eine manuelle
Bereinigung, keine automatische Erkennung widersprüchlicher Inhalte.
Bei 40 Regeln wird ein weiterer neuer Hinweis ohne Verdrängen alter Regeln
abgelehnt. Die Eingabe bleibt zur Wiederholung erhalten; die Oberfläche
erklärt, dass nach Gesprächsende zuerst Platz geschaffen werden muss.
Wiederholung einer bereits vorhandenen Regel sowie Ersetzen und Löschen
bleiben auch bei voller Liste möglich.
Für die Begrüßung gilt gesondert: Eine eindeutige Regel
„Bei der Begrüßung sagen Sie: …“ ersetzt im nächsten Demo-Anruf den Standardgruß;
die neueste gültige Regel gewinnt, der anschließende Datenabgleich bleibt bestehen.
Dies ändert keine Begrüßung echter Praxisanrufe. Nach Speichern/Reload sind
Text, lokale Audioerzeugung und vollständige Browser-Wiedergabe geprüft.
Klangqualität und österreichische Wirkung benötigen weiterhin eine menschliche
Abnahme. Details: `docs/HOMEPAGE-ABNAHME.md`.

### Verbindungsabbrüche im lokalen Gespräch

Stand der Demo-Texte vom 13. September 2026: Auch vorbelegte Beispielsfälle
kennzeichnen Nachrichten als Entwürfe und Notdienstkontakte als manuell zu
prüfende Hinweise. „Als bearbeitet“ ändert nur den lokalen Demo-Status.
Die Termin-Dialogzeile verspricht keinen SMS-Versand. Gezielte Texttests
prüfen diese Aussagen; Telefonverbindung und Zustellung sind damit nicht
nachgewiesen. Beleg: `f7e5aff`, `docs/HOMEPAGE-ABNAHME.md`.

Der Browser begrenzt Spracherkennungsanfragen, Gesprächsantworten und jedes
angeforderte Sprachstück auf jeweils 35 Sekunden. Auflegen verwirft die
laufenden Anfragen; verspätete Antworten dürfen das Gespräch nicht erneut
starten. Eine neue Sprachausgabe ersetzt die alte einschließlich Vorladung.
Bei einer nicht bestätigten Gesprächsantwort erfolgt keine automatische
Wiederholung: Eine serverseitige Speicherung kann bereits erfolgt sein.
Die Oberfläche nennt diesen unklaren Zustand und fordert zur Tafelprüfung auf.
Ein Browserabbruch ist weder Rücknahme einer Speicherung noch Kostenobergrenze.

Lokale Browsernachweise decken Zeitgrenzen, Auflegen, die Übernahme eines
synthetischen Mikrofonsignals und den Abbruch eines vorgeladenen zweiten
Sprachstücks ab. Die Zeitgrenzen sind beschleunigt getestet; Signalübernahme
und Auflegen bei normaler Zeitgrenze. Das ist keine Abnahme echter
Mikrofonqualität, des Telefonbetriebs oder von GPT-Live-1. Einzelbelege und
genaue Prüfgrenzen stehen in `docs/HOMEPAGE-ABNAHME.md`.

Der ordinationsbezogene
Betrieb nutzt eine Datenbank. Der bisherige Sprachpfad konnte Audiodaten,
Text und ausgewählten Kontext an OpenAI übergeben. Er wird deshalb durch
verbindliche lokale Verarbeitung ersetzt; die Sperren und die vollständige
lokale Gesprächskette sind noch abzunehmen. Bereits laufende ältere Prozesse
werden durch Quellcodeänderungen nicht automatisch abgesichert.
Browser-Demospeicherung allein belegt keine ausschließlich lokale Verarbeitung.
Produktive Telefonanbindung und externe Praxissoftware müssen separat
nachgewiesen werden. Kontaktentwürfe sind keine automatisch versendeten
Nachrichten, Notfallhinweise kein automatisch hergestellter Notruf.

Demo-Anfragen sind ein eigener Datenpfad: `src/lib/practice/leads.ts` speichert
Ordinationsname, Kontakt, E-Mail, optionale Telefonnummer, Bundesland,
Praxissoftware und Nachricht in der Tabelle `leads`. Dieser Vorgang ruft kein
Sprachmodell auf und versendet keine Nachricht. Im geprüften Anwendungscode
ist noch keine Betreiberübersicht oder Benachrichtigung für diese Anfragen
vorhanden. Zuständigkeit, Bearbeitungsweg und Aufbewahrung sind vor öffentlichem
Betrieb festzulegen; die Praxis-Löschroutine erfasst diese Tabelle nicht.
Eine künftige Betreiberübersicht darf die globalen Anfragen nicht für normale
Praxiszugänge zugänglich machen. „Anfrage gespeichert“ belegt nicht, dass ein
Mensch benachrichtigt wurde oder eine Rückruffrist zugesagt ist.

Das Anfrageformular verwendet je unverändertem Sendeversuch eine zufällige
Vorgangsnummer. Wiederholen nach einem Fehler behält sie; geänderte Eingaben
oder Schließen und erneutes Öffnen beginnen einen neuen Vorgang. Migration
`0020` ergänzt eine eindeutige Vorgangsnummer und einen Inhaltsprüfwert in
`leads`. Identische Wiederholungen liefern dieselbe Datensatz-ID; abweichender
Inhalt unter derselben Vorgangsnummer wird ohne Ausgabe gespeicherter
Kontaktdaten abgelehnt. Ältere Aufrufer ohne Vorgangsnummer bleiben kompatibel,
haben aber keinen Wiederholungsschutz. Kein Schutz gegen absichtlich neue
Vorgänge oder erneute Eingabe nach Seitenneuladen; die bestehende
Anfragebegrenzung bleibt wirksam.

**Sicherheitsanforderung:** Jede Ordination sieht ausschließlich ihre Daten;
die KI erhält nur die notwendigen Informationen und darf nur ausdrücklich
erlaubte Aktionen ausführen.

Diese Anforderung ist ein Prüfmaßstab, keine pauschale Garantie. Es dürfen
keine Aussagen wie „absolute Sicherheit“, „Daten verlassen nie die Praxis“
oder automatische Datenschutzkonformität gemacht werden. Vor einer Freigabe
sind Zugriffsrechte, Mandantentrennung, Anbieter-/Speicherorte,
Löschfristen, Protokollinhalte und erlaubte Aktionen nachzuweisen.

Cloudflare Containers und die OpenAI Agents API bleiben mögliche Bausteine,
keine beschlossene Architektur. Eine Ausführung bei Cloudflare verhindert
nicht automatisch die Verarbeitung übergebener Informationen bei OpenAI;
Netzwerkzugriffe und Protokollierung müssen ausdrücklich begrenzt werden.

## 7. Abnahmekriterien

- Premium-Gespräch, Training, Korrektur, Praxiswissen und Löschroutine bleiben
  nachvollziehbar funktionsfähig.
- Die Live-Demo beendet sich sichtbar spätestens nach zwei Minuten, ist
  unterbrechbar und erzeugt keine unbeabsichtigte Buchung.
- Die Paketdarstellung bietet zwei ehrliche Varianten. Vorhandene Hörproben
  starten keine Gesprächs- oder Stimmauswahl und überlagern sich nicht.
- Eine Ordination kann nur ihre eigenen Profil-, Praxisfakten-, Anruf- und
  Protokolldaten lesen oder ändern; unzulässige Aktionen werden abgewiesen.
- Vor Modellübergabe ist dokumentiert, welche Informationen für den jeweiligen
  Turn notwendig sind; vor Ausführung ist die Aktion erlaubt und prüfbar.
- Stimmfreigabe erfolgt erst nach dem vereinbarten Hörtest. Es werden keine
  Leistungsmetriken behauptet, die nicht gemessen und dokumentiert wurden.

## 8. Offene Entscheidungen

- Welche Preise und welche Funktionsgrenzen gelten für Premium und Live?
- Welche Live-Architektur, welcher Anbieter und welche Kostenbegrenzung werden
  freigegeben?
- Externe Live-Demos dürfen ausschließlich erfundene Inhalte verwenden.
  Offen sind die technische Trennung sowie Löschung und Anbieterbedingungen;
  echte Praxisdaten sind keine offene Freigabeentscheidung.
- Wann ist das österreichische Stimmprofil nach Hörtest freigegeben?
- Welche Bridge-/Praxissoftware-Schnittstellen gelten nach dem Testlauf als
  produktiv?

## 9. Pflege dieses Dokuments

Diese Spec wird bei jeder relevanten Änderung an Produktstatus, Stimme,
Modell/Provider, Aktionsarten, Datenfluss, Mandantentrennung, Aufbewahrung,
Preisen oder Live-Architektur aktualisiert. Während der aktiven Vorbereitung
erfolgt zusätzlich täglich eine kurze Prüfung: Status stimmt mit Code und
Abnahmetests überein, geplante Punkte sind nicht als implementiert formuliert,
und neue Kundenversprechen sind belegt.

Der zentrale Pitch steht unter `docs/Silvia-Pitch.pptx`. Seine Textquelle ist
`docs/pitch-content.json`, die Erstellung beschreibt `docs/PITCH-PFLEGE.md`.
Die ältere Teamfassung `docs/Silvia-Pitch-Kollegen.pptx` bleibt als internes,
nicht freigegebenes Dokument erhalten und wird nicht in den Versandordner kopiert.
Der Pitch ersetzt diese Produktspezifikation nicht. Eine tägliche Prüfung
um 09:00 Uhr wurde eingerichtet. Ohne relevante Änderungen wird kein Deck
neu erzeugt. Jede Veröffentlichung benötigt Inhalts- und Sichtkontrolle.

## 10. Quellen und Änderungsstand

### Trainingsprüfung vom 11. September 2026

- Der Direktlink `training=sprache` wählt jetzt tatsächlich Sprache erkennen,
  statt immer Praxiswissen zu öffnen. Beide Bereiche sind in der Schulung
  separat auswählbar, ein Wechsel im laufenden Gespräch ist gesperrt.
- Die Homepage-Demo übergibt ausdrücklich einen Demo-Kontext für Erkennung
  und Wortkorrekturen. Dadurch nutzt sie nicht unbemerkt die Sprachhinweise
  einer gleichzeitig angemeldeten Ordination und schreibt dort keine Korrektur.
- Demo-Fachbegriffe werden inzwischen separat im Browser gespeichert, maximal
  20 kurze Begriffe. Die nächste Demo-Erkennung erhält sie als Wortschatzhilfe.
  Sie werden nicht in Praxisregeln, serverseitige Korrekturdateien oder den
  gemeinsamen Zwischenspeicher übernommen. Einzelne Begriffe sind löschbar.
  Blockierte Browserspeicherung wird als Fehler gemeldet, nicht als Erfolg.
- Das ist eine Erkennungshilfe, kein Neutrainieren des Modells. Begriffe
  werden bei Sprachversuchen an den Sprachdienst übergeben. Nur Testbegriffe
  verwenden. Vollständiger Mikrofon- und Gesprächsabnahmetest bleibt erforderlich.
- Der neutrale Button „Schulung beenden“ ist während Klingeln und Gespräch sichtbar;
  der aktive Abbruch mit nativer Chromium-Fake-Audioquelle und gesperrten POSTs
  wurde geprüft. Echte Hardware, österreichischer Akzent und reale Stimme bleiben offen.
- Tests: 33 gezielte Speicher-/Sprachdiensttests, Typprüfung sowie separater
  Browsertest `scripts/demo-speech-audit.mjs` erfolgreich. Der Browsertest prüft
  Direktlink, Neuladen, Bereichswechsel, Löschen und getrennte Browserdaten,
  nicht die Erkennungsqualität real gesprochener Wörter.
- Die vorhandenen Pitch-Aussagen ändern sich dadurch nicht: Trainingsfunktionen
  vorhanden, Stimmfreigabe und interaktive Live-Demo weiter offen.
- Prüfung dieser Änderung: `npm test` erfolgreich (632 TypeScript-Tests im
  abschließenden Testlauf), `npm run typecheck` erfolgreich. Direktlink,
  sichtbare Auswahl und Wechsel zwischen den Trainingsarten im Browser geprüft.
  Das ersetzt noch keinen vollständigen gesprochenen Ende-zu-Ende-Test.

- Projektcode und die oben genannten lokalen Dokumente sind die Belege für
  den Implementierungsstand, nicht automatisch für bestandene Abnahmetests.
- Sicherheitsbewertung: https://developers.cloudflare.com/sandbox/tutorials/openai-agents-api/
- Wortschatzhilfen: https://developers.openai.com/api/docs/guides/speech-to-text#prompting
- Anlass der Prüfung: https://x.com/Jilles/status/2098131355129335858
- 11. September 2026: Stimmprofil, zwei Pakete, Sicherheitsziel und gemeinsame
  Pflege von Spezifikation und Pitch aufgenommen. Keine Änderung der
  laufenden Anwendung durch diese Dokumentation.
- 12. September 2026: Patienten-Suche, Detailabruf und Kontaktänderung im
  lokalen synthetischen A/B-Isolationstest geprüft; Praxis-ID wird in den
  relevanten SQL-Abfragen aus der Anmeldung übernommen. Fremde Patientenänderungen und cookie-freie Aufrufe
  werden abgelehnt. Beleg: `artifacts/patient-isolation-final.log`.
  Dies ersetzt weder UI-Abnahme noch Tests mit echten Praxisdaten; die
  Produktionsreife bleibt bei 50 %.
- 12. September 2026: Terminstatus und Terminverschiebung mit zwei synthetischen
  Praxen lokal geprüft: fremde Termin-ID abgewiesen, eigene Änderung möglich,
  vollständige Datensätze anschließend verglichen. Nachweis:
  `artifacts/appointment-isolation-final-2.log` (Exit 0). Keine Abnahme der
  Kalenderoberfläche oder einer externen Praxissoftware; weiterhin 50 %.
- 12. September 2026: Neue Sprachkorrekturen werden mit Migration 0019 pro
  Praxis in einem gesperrten Datenbankvorgang auf Wiederholung und die Grenze
  von 2.000 Einträgen geprüft. Identische Wiederholungen bleiben am Limit
  erfolgreich. Historischer Altimport bleibt eine dokumentierte Ausnahme;
  keine stillschweigende Löschung. Lokal getestet, kein Nachweis für mehrere
  echte Cloud-Datenbankverbindungen. Produktionsreife bleibt 50 %.
- 12. September 2026: IP-basierte Mengenbegrenzungen vertrauen weitergereichten
  Adressangaben standardmäßig nicht. Ein vertrauenswürdiger vorgeschalteter
  Server benötigt ausdrückliche Konfiguration und muss Direktzugriffe sperren.
  Ohne verwertbare Laufzeitadresse gilt eine gemeinsame Begrenzung. Lokale
  Tests bestanden; keine Garantie eines globalen Kostenlimits über mehrere Server.
- 12. September 2026: Die drei Sprach-Serverfunktionen erhalten vorgelagerte
  POST-Größenprüfungen: Chat 64 KiB, Ausgabe 16 KiB, Erkennung 5 MiB.
  Stream-Messung statt ausschließlichem Vertrauen in die Größenangabe; zehn
  Sekunden Lesegrenze. Andere Funktionen, Sicherungen und Praxissoftware-Routen
  werden durch diese Regel nicht begrenzt. Lokal geprüft, öffentliche Lastabnahme offen.
- 12. September 2026: Größenprüfung zusätzlich am separat kopierten
  Programmpaket nachgewiesen: drei übergroße Sprach-Anfragen abgewiesen,
  einschließlich Erkennung ohne Größenangabe in neun übertragenen Teilen.
  Kleine leere Audioanfrage bleibt regulär verarbeitbar; Seiten, Browser-Dateien
  und Neustart bestehen ohne Anbieteraufrufe. Beleg:
  `artifacts/speech-body-audit-final.log`. Kein Ersatz für echte Sprach- oder
  öffentliche Lastabnahme; Produktionsreife bleibt 50 %.
- 12. September 2026: Homepage, FAQ, Anfrageformular und Produktfilm werden
  auf den belegten Leistungsumfang abgestimmt: Nachrichten sind manuell zu
  versendende Entwürfe, Nachtdienstkontakte keine automatische Verbindung,
  Praxissoftware-Anbindungen separat zu prüfen. Feste Einrichtungs-/Testfristen,
  eine wählbare Tonaufzeichnung und pauschale EU-/Export-/Löschzusagen werden
  nicht als bereits zugesagte Leistungen dargestellt. Technische Funktionen
  und die zwei Pakete bleiben erhalten. Unbelegte Kundenstimmen wurden durch
  ausdrücklich bezeichnete Beispielszenarien ersetzt. Die 92-%-Erfolgszahl,
  die angebliche Messreihe und die unbelegte 1-Stern-Rangbehauptung wurden
  entfernt; ungenutzte Referenzdaten und der Messhinweis-Helfer ebenfalls.
  Die Vergleichstabelle nennt eigene Funktionen und nötige Einsatzprüfungen
  statt unbelegter Wettbewerber-Nachteile. Österreichischer Ton bleibt das
  Ziel; Akzent und Dialekterkennung werden nicht garantiert.
  Gezielt geprüft: Quelltextregression, Anzeige-Regeln und Typecheck.

- 12. September 2026: Altimporte von Sprachkorrekturen unterliegen derselben
  Grenze von 2000 Einträgen je Ordination wie neue Korrekturen. Überlauf
  bricht den gesamten Import ohne Abschlussmarker ab; Quelldatei bleibt
  unverändert. Dateien über 2 MiB werden vor Datenbankzugriff abgelehnt.
  Kein automatisches Löschen vorhandener Korrekturen; unabhängige parallele
  PostgreSQL-Verbindungen bleiben separat abzunehmen.

- 12. September 2026: Ton und Verhalten wurden mit einer synthetischen Praxis
  browserseitig und serverseitig geprüft: Die Inhaberin speichert den Wert,
  Reload zeigt ihn unverändert, Kassa kann die UI nicht bearbeiten und ein
  echter savePracticeBehavior-Request mit Kassa-Sitzung liefert ok:false.
  Belege: c60303e, `artifacts/training-role-audit.log`. Das gilt nur für diese
  Funktion und synthetische PGlite-Daten, nicht als vollständige Rollenabnahme.
- 12. September 2026: Der echte Einstieg von `/app/training` nach
  `/sprechen?test=ja` wurde mit lokalem askAlma-/Audio-Wiedergabe-Mock geprüft.
  Der Testmodus veränderte keine fachlichen Tabellen; ein normaler Kontrolllauf
  persistierte einen synthetischen Termin und Anruf erfolgreich. Beleg:
  c4cd596, `artifacts/training-test-call-audit.log`. Audio-Wiedergabe,
  Modellanbieter, echte Stimme und Hardware bleiben außerhalb dieses Nachweises.
- 12. September 2026: Protokoll-Isolation wurde mit zwei synthetischen Praxen
  geprüft: Suche, Detailabruf, Statusänderung und Kontakte bleiben auf die
  angemeldete Praxis begrenzt. Aufrufe ohne Sitzung werden abgewiesen. Beleg:
  33245ea. Dies ist keine Gesamtgarantie für jede Funktion, echte Daten,
  externe Anbieter oder den laufenden Betrieb.
