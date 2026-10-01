# Produktionsreife — Abnahme-Checkliste

Diese Seite ist ein Inventar des belegten Standes, kein Freigabe- oder
Produktionsversprechen. **Nicht implementiert** und **nicht abgenommen** sind
bewusst getrennt von getesteten Einzelbausteinen.

## Aktueller Stand (30.09.2026, `main`)

**Aktuelle Nachweise:** Die zuletzt vollständig ausgeführte Testsuite bestand
mit 185 Testdateien und 1015 Tests. Typecheck und Produktions-Preflight sind
grün. Der Homepage-Audit bestand mit 15/15 Teilprüfungen; Lead-Erfassung,
Retry-Idempotenz und der Hinweis gegen Patienten-/Gesundheitsdaten sind lokal
geprüft. Die frische Offline-Installation bestand mit vier Kernrouten vor und
nach Neustart; die Live-Demo blieb deaktiviert.

Die öffentliche Paketdarstellung unterscheidet jetzt sichtbar zwischen der
lokalen Premium-Variante und der getrennten Live-Demo. Preise bleiben bewusst
offen, bis Kosten und Vertragsumfang freigegeben sind. Die Verkaufsgrenzen und
der Vorab-Check stehen in `docs/VERKAUFSABNAHME.md`.

**Weiterhin keine Freigabe:** echter Mikrofon-/Telefonbetrieb, externe
Praxissoftware-Schreibzugriffe und die Cloud-Live-Demo mit echten
Praxisdaten. Diese Grenzen sind Sicherheitsanforderungen, keine fehlenden
Homepage-Tests.

**Automatische Prüfungen bestanden, produktiver Telefonbetrieb nicht freigegeben.**
Die aktuelle vollständige Suite führte 185 von 185 Testdateien und 1015 Tests
ohne Fehler aus; Typecheck und Produktions-Preflight waren grün. Der isolierte
Homepage-Audit bestand 15 von 15 Abläufen. Registrierung, erneute Anmeldung,
Praxis-Training mit Speichern, Neuladen und Löschen sowie die authentifizierte
Sprachkorrektur wurden mit erfundenen Daten geprüft. Die Live-1-API wurde dabei
nicht für echte Praxisdaten aufgerufen.

Zusätzlich bestanden am 28.09.2026 der isolierte Produktionsstart, eine
Offline-Frischinstallation mit Neustart, Sicherung/Wiederherstellung und ein
synthetischer Versionswechsel mit Rückkehr zur passenden alten Datenkopie.
Alle diese Läufe blieben von der bestehenden Installation und echten
Praxisdaten getrennt.

Das getrennte Telefon-Gateway (`C:\silvia-phone`) bestand 30 Offline-Tests;
ein Dienstetest war ohne laufende Sprachdienste zunächst übersprungen.
Nach Start der lokalen STT-/TTS-Dienste bestand auch der künstliche
WAV-Anruf ohne Telefonanlage (3/3 Tests). Das belegt die lokale
Sprach-Pipeline, nicht die SIP-Verbindung oder einen echten Anruf. Ein weiterer
isolierter Produktions-E2E-Test verband am 28.09.2026 den echten Python-Gateway-
Client mit der Silvia-App: synthetische Registrierung, Antwort, identischer
Wiederholungs-Turn und Auflege-Signal waren grün. Dabei liefen weder SIP noch
Audio oder externe KI; die bestehende `.output` blieb unverändert.

**Offene Freigabegrenzen:** Ein echter Telefon-/Mikrofon-End-to-End-Test mit
ausschließlich erfundenen Angaben und eigener Testnummer fehlt. Die
öffentliche Cloud-Live-Demo, produktives Schreiben in eine Praxissoftware sowie rechtliche
und organisatorische Datenfluss-Freigaben bleiben gesperrt. Die historische
Live-Testanordnung in `LIVE-TESTANORDNUNG.md` darf ausdrücklich nicht
ausgeführt werden. Maßgeblich für die nächste gemeinsame Abnahme ist
`GEMEINSAME-ABNAHME.md`.

Eine neue Produktionsreife-Prozentzahl wird aus automatischen Tests nicht
abgeleitet: Die fehlenden Telefon-, Datenschutz- und Praxisfreigaben lassen
sich nicht seriös in zusätzliche Prozentpunkte umrechnen.

### Historischer Nachweisindex (21.09.2026)

**62 %** — damaliger Stand auf `main`, Commit `affa2d9`. Dieser Wert ist
eine historische Momentaufnahme, keine aktuelle Produktivfreigabe.

**Warum 62 % und nicht 90 %:** Neunzehn Punkte der fünften und sechs Punkte der
sechsten Runde sind belegt, mehrere davon gegen die **echte Datenbank** (Zugänge
atomar, Einladung mit Grenze und E-Mail-Konflikt, Reservierung je Buchung) und
einer mit **echten Dateien** (Rücksetzcode). Die volle Suite ist mit
**1124 Tests, 0 Fehlern** grün. Alles davon sind aber weiterhin **lokale**
Nachweise: Telefon, Live-Gespräch, schreibende Praxissoftware, Fremdrechner und
Recht sind unangetastet. Ohne diese externen Abnahmen bleibt der Index deutlich
unter der Freigabe.

**Sicherheits-Härtung 21.09.2026 (zusätzlich zu den benannten Punkten):**
scrypt-Kosten angehoben — Login `N = 2^17` (selbstbeschreibendes Hash-Format,
alte Hashes bleiben prüfbar), Tafel-Sicherung trägt eine neue Container-Version
„SLVBK02“ mit `N = 2^17`, alte „SLVBK01“-Sicherungen bleiben entschlüsselbar.
Dazu harte Body-Grenzen für die Stimme-/Backup-Endpunkte und das Aufräumen
abgelaufener Rate-Limit-Buckets. Diese Härtung liegt **außerhalb** der
nummerierten Punkte und verändert daher weder Nachweisindex noch Umsetzungswert.
Volle Suite grün (164 Testdateien, Exit 0), Typecheck und Lint Exit 0.

**Verdeckte Fehler + Governance-Tests 21.09.2026 (ebenfalls außerhalb der Punkte):**
Verdeckte Fehler werden jetzt laut statt still geschluckt — Tierärzte-Abruf
(Transportfehler loggt statt still ohne Behandler zu buchen), LLM-Pfad vor dem
lokalen Fallback, `.prev`-Cleanup nach dem Restore, korrupte Holen-Meta (kein
ewiges „läuft noch“, nur echtes Einspielen zählt als Fehlschlag) und CHECKPOINT
der Sicherungskopie. Zusätzlich sind drei zuvor ungetestete Freigabe-Punkte
belegt: `appointmentWriteApproved` (die einzige Connector-Schreibfreigabe),
`assertPgliteRestoreGzip` (beschädigte gzip-Sicherungen erreichen nie die
live-Tafel) und der Restore-Rollback (ein injizierter Einspiel-Fehler stellt
die bisherige Tafel nachweislich wieder her). Dafür wurde die Migrationsquelle
aus `db.server.ts` in `migration-sqls.ts` gezogen — eine Test-Naht, die den
Produktions-Build unverändert lässt (Migrationen weiterhin inlined). Nachweisindex
und Umsetzungswert bleiben unverändert. Volle Suite grün (167 Testdateien,
Exit 0), Typecheck, Lint und Produktions-Build Exit 0.

### Umsetzungsstand — gezählt, nicht geschätzt

Eine einzelne Prozentzahl für den „Arbeitsfortschritt“ war **nicht belastbar**
und ist hier ersetzt durch nachzählbare Angaben:

| Runde | Punkte | erledigt | offen |
|---|---:|---:|---:|
| 1 — Code-Durchsicht | 10 | 9 | 1 (bewusst in der Komponente) |
| 2 — Termine und Limit | 7 + 1 | 8 | 0 |
| 3 — Praxissoftware-Anbindung | 9 | 9 | 0 |
| 4 — zwanzig weitere Punkte | 20 | 20 | 0 |
| 5 — dreißig weitere Punkte | 30 | 19 | 11 (5, 8, 9, 11–17) |
| 6 — zwanzig weitere Punkte | 20 | 13 | 7 (7–9, 14, 18–20) |
| 7 — zwanzig weitere Punkte | 20 | 20 | 0 |
| 8 — zehn weitere Punkte | 10 | 10 | 0 |
| 9 — Buchungen und Zeiten | 20 | 20 | 0 |
| 10 — Buchungssicherheit und Sicherung | 20 | 20 | 0 |
| 11 — Live-Wrapper und Notfall (30.09.2026) | 19 | 19 | 0 |
| **Summe** | **185** | **167** | **18** |

**Gezählt: 167 von 185 benannten Punkten erledigt (90,3 %).** Die 18 offenen Punkte aus Runde 5 und 6 sind unverändert offen: ihr Wortlaut ist nicht mehr nachweisbar, sie werden nicht nachträglich gutgeschrieben. Der Nachweisindex (50 %) bleibt davon unberührt. Das ist der Umsetzungswert.
Er ist bewusst **konservativ**: „erledigt“ heißt hier **umgesetzt UND mit einem
ausgeführten Test belegt**, nicht nur geschrieben. Eine Punkte-Quote über die
gesamte Produktoberfläche wäre dagegen geschätzt und wird deshalb nicht geführt.

**Beides ist keine Freigabe.** Weder 62 % noch 71 von 96 Punkten ersetzen eine
Telefon-, Live-, Praxissoftware-, Fremdrechner- oder Rechtsabnahme.

> **Zum Nachlesen im Verlauf:** Alle Zahlen **innerhalb** des folgenden
> Verlaufsprotokolls sind der jeweilige **Tagesstand** und ausdrücklich
> historisch — auch wo sie wie eine aktuelle Bewertung klingen („70 %“,
> „50 %“, „849/849“). Maßgeblich sind immer die beiden Angaben in diesem Kopf.

### Nachweise vom 18.09.2026 (frisch ausgeführt, Node v24.19.0)

Alle Prüfungen an diesem Tag neu gelaufen — nicht aus früheren Runden
übernommen. Standard-`node` auf diesem Rechner ist v20.19.0, die Audits liefen
deshalb mit Node v24.19.0. Port **8092** war vor und nach den Läufen **frei**
und wurde nicht angefasst; der Audit nutzt seinen eigenen Port 8183.

| Prüfung | Ergebnis |
|---|---|
| `scripts/isolated-home-audit.mjs homepage` | **Exit 0**, 15/15 Audits Exit 0, `buildExit:0`, `tempRootRemoved:true`, `originalOutputUnchanged:true`, 568 versionierte Dateien |
| `homepage-cta-immediate-audit.mjs` (Hörproben-Knopf) | `immediateLabel:"Pause"`, `returnLabel:"Marin anhören"`, `failedSourceLabel:"Marin anhören"` |
| `playwright.release-gate.config.ts` | **1 passed (31,1 s)**, Exit 0 |
| `scripts/isolated-home-audit.mjs appointment` | **Exit 0**, `appointments:2`, `requestedDays === savedDays`, `patientIdsUnchanged:true`, `noAppointmentsInClosedPractice:true` |
| `scripts/isolated-home-audit.mjs privacy` | **Exit 0**, `localOnly:true`, `promptIsolation:true`, `demoPositiveControl:true` |
| `scripts/isolated-home-audit.mjs production` | **Exit 0**, `ok:true`, `buildExit:0` |
| Typecheck / Lint / Tests | `tsc --noEmit` Exit 0, `eslint` Exit 0, **1227 Tests, 0 Fehler, 161/161 Dateien** |

Nach den Läufen: Audit-Port 8183 frei, keine Temp-Ordner geblieben,
`.output` unverändert.

### Stand der Verbesserungsrunden (16.–18.09.2026)

**Runde 1 — zehn Punkte aus der Code-Durchsicht:** alle bearbeitet.
Punkte 1–8 und 10 erledigt, Punkt 9 teilweise (zwei echte Auslagerungen,
zustandsgebundene Funktionen bleiben bewusst in der Komponente).

**Runde 2 — sieben Terminbeispiele, ein Limitfehler:** alle erledigt.
- Termine 1–7: Kalenderdatum korrigierbar, Uhrzeit austauschbar, Wortzeiten
  korrigierbar, Alternativen als Rückfrage, Tageshälfte beachtet,
  unvollständige Uhrzeit als Rückfrage, Uhrzeit ohne „um“.
- Limit 17: `takeToken` gibt jetzt `{ allowed, remainingQuota }` zurück; der
  erste erlaubte Versuch wird nicht mehr abgewiesen. Sechs Aufrufer
  mitangepasst (Chat, Telefon, Stimme, STT, TTS).

**Runde 3 — Praxissoftware-Anbindung, Punkte 8–16:** alle erledigt
(Commit `13a5f24`).
- 8: `lastMasterSyncAt` nur von einem **erfolgreichen** Lauf.
- 9: laufende Übertragungen (`processingOutbox`) sichtbar.
- 10: `failedOutbox` umfasst `failed`, `conflict` und `forbidden`.
- 11: `cleanup` löscht nur noch `sent`; Konflikte bleiben.
- 12: Migration `0025` mit Reservierungsbesitzer (`lease_owner`).
- 13: Fehler je Übertragung werden gefangen statt die Runde abzubrechen.
- 14: `health()`/`capabilities()` im try/catch.
- 15: „Status derzeit nicht abrufbar“ statt „noch nicht synchronisiert“.
- 16: Buchungstext nennt `adapter.label` statt fest „Vquadrat“.

**Runde 4 — zwanzig weitere Punkte (16.09.2026), alle erledigt:**

| # | Verbesserung | Beleg |
|---:|---|---|
| 1 | Wochentagskorrektur gegen Kalenderdatum | `["Am 18.09.","Nein, Montag"]` → Montag |
| 2 | Zurückgenommener Wunsch („egal wann“) | `["Morgen um 15 Uhr","Doch egal wann"]` → Rückfrage |
| 3 | Zwei Kalenderdaten = Auswahl | `["18.09. oder 19.09."]` → Rückfrage |
| 4 | Ungültiges Datum als Korrektur | `["Morgen","Nein, am 31.02.2027"]` → Rückfrage |
| 5 | Registrierung atomar | Migration `0026`, drei Zeilen in einer Transaktion |
| 6 | Gleichzeitige Registrierungen | `pg_advisory_xact_lock`; 1× `created`, 1× `email_taken` |
| 7 | Passwortprüfung ohne Serverblockade | `hashPasswordAsync` / `verifyPasswordAsync` auf allen Anfragepfaden |
| 8 | Anmeldung gegen parallele Versuche | `loginAttemptStart` zählt sofort; `refundLoginAttempt` bei Erfolg |
| 9 | Passwortlänge beim Login | geteiltes `MAX_PASSWORD_LENGTH` (200) |
| 10 | Unbekannte Konten zeitlich gleich | `TIMING_EQUALIZER_HASH`, es wird immer gerechnet |
| 11 | Abmeldung bei Datenbankfehler | Cookie fällt immer, Fehler wird gefangen |
| 12 | Abgelehnte Ergebnisspeicherung auswerten | `markOutbox` → `superseded` statt „gesendet“ |
| 13 | Patienten-Teilabrufe kennzeichnen | `stats.patientsPartial`, Lauf meldet `ok:false` |
| 14 | Buchungswarnung vor dem ersten Abgleich | Warnung steht auch bei „noch nicht synchronisiert“ |
| 15 | Datenbankfehler im Fehlerpfad | Runde bricht nicht mehr ab |
| 16 | Reservierung je Übertragung prüfen | Migration `0027`, `renew_pms_outbox_lease` vor jeder Buchung |
| 17 | Fehlerprotokolle ohne Rohfehler | `logPurgeFailure` schreibt nur Klasse und Fehlername |
| 18 | Große Löschmengen portioniert | `deleteInBatches`, 500 Zeilen je Anweisung |
| 19 | Fehler je Praxis getrennt | übrige Praxen laufen weiter, `PurgeResult.failed` |
| 20 | Testvollständigkeit nachweisen | Starter kennt `.test.tsx` und meldet entdeckt = ausgeführt |

**Kern des Terminumbaus:** `dayDecisions()` sammelt alle Tagesangaben mit
Position — relative Tage, Wochentage, Kalenderdaten, Auswahlen und
zurückgenommene Wünsche. Die späteste Angabe entscheidet, weil sie die
Korrektur des Gesprächs ist. Damit gilt eine Korrektur auch gegen ein vorher
genanntes Kalenderdatum.

**Nebenbefund:** Der Zeitausdruck las die 30 in „8.30 Uhr“ als Stunde und
machte daraus eine unmögliche Uhrzeit. Er kennt jetzt den Punkt als
Minutentrenner, aber nur zusammen mit „Uhr“, damit „18.09.“ kein Datum verliert.

**Nachweis der Runde:** volle Suite **1105 Tests, 0 Fehler, Exit 0**, Starter
meldet **154 entdeckte = 154 ausgeführte Dateien**. `tsc --noEmit` Exit 0,
`eslint` Exit 0. Migrationen `0026` und `0027` sind gegen die echte Datenbank
getestet (Atomarität, Nebenläufigkeit, abgelaufene Reserve, fremder Besitzer).

Offen aus dieser Runde: **nichts.** Alle zwanzig Punkte sind umgesetzt.

**Runde 5 — dreißig weitere Punkte (16.09./17.09.2026):**

| # | Verbesserung | Stand |
|---:|---|---|
| 1 | Acht-Zugänge-Grenze gegen gleichzeitige Einladungen | **belegt** (`invite_practice_staff`, Migration `0029`) |
| 2 | Letzte Inhaberin atomar schützen | **belegt** (5 Tests gegen Migration `0028`) |
| 3 | Passwort + Sitzungswiderruf zusammen | **belegt** (derselbe Test) |
| 4 | Doppelte E-Mail bei parallelen Einladungen | **belegt** (`email_taken` statt roher DB-Fehler) |
| 6 | Änderungsprotokoll für Zugangsaktionen | **belegt** (`practice_staff_audit`, ohne Geheimnisse) |
| 7 | Rücksetzcode strikt einmalig | **belegt** (4 Tests, echte Dateien) |
| 10 | Fehlgeschlagenes Löschen des Codes melden | **belegt** (derselbe Test) |
| 18 | Veraltete Ersatzdaten kennzeichnen | **belegt** (`stale: true`) |
| 19 | Maximalalter für Ersatzdaten | **belegt** (7 Tage, danach ehrlich nichts) |
| 20 | Suchzeichen wörtlich behandeln | **belegt** (`escapeLikeNeedle`) |
| 21 | Suchergebnisse begrenzen, leere abweisen | **belegt** (Limit 25, leere Anfrage abgewiesen) |
| 22 | Buchungsschlüssel um das Praxisprogramm | **belegt** (`pmsKind` im Schlüssel) |
| 23 | Anfragegröße vor dem Einlesen begrenzen | **belegt** (413 über `content-length`) |
| 24 | Auflegen auch ohne Gesprächszeilen | **belegt** (Verlauf aus `calls.transcript`) |
| 26 | Lange Gespräche vollständig zusammenfassen | **belegt** (40 Zeilen, Anfang bleibt) |
| 27 | Gesprächsende strukturiert signalisieren | **belegt** (zitiertes Wort legt nicht auf) |
| 29 | Gleicher Nachname kein Identitätsnachweis | **belegt** (2 Tests) |
| 30 | Mehrere Halter bleiben offen | **belegt** (2 Tests) |

**Runde 6 — zwanzig Punkte (17.09.2026):**

| # | Verbesserung | Stand |
|---:|---|---|
| 1 | Testumgebung wiederherstellen | **erledigt**: `tsx` fehlte in `node_modules`, obwohl im Lockfile deklariert. `npm install` aus dem Lockfile, Lockfile danach unverändert |
| 2 | Angefangene Zugangsänderungen abschließen | **belegt**: `staff-atomic` 5/5, `staff-invite-atomic` 3/3 |
| 3 | Einladungen über Praxisgrenzen absichern | **belegt**: `unique_violation` → `email_taken` statt Ausnahme |
| 4 | Fehlende Änderungsprotokolle melden | **belegt**: `false` wird protokolliert und als `auditLogged` gemeldet |
| 5 | Fortschrittsdokument bereinigen | **erledigt**: eine Autorität im Kopf, Verlauf als historisch markiert, geschätzte 99 % ersetzt durch gezählte Punkte |
| 6 | Anfragegröße beim Einlesen begrenzen | **belegt**: `readCappedJsonBody` zählt beim Lesen, greift auch ohne `Content-Length` |
| 10 | Rücksetzcodes je Benutzer | **belegt**: mehrere Blöcke je Person, Dateiname bleibt |
| 11 | Codedatei atomar ersetzen | **belegt**: Nebendatei + Umbenennen, keine halbe Datei |
| 12 | Zurückgegebener Code gegen Neueres absichern | **belegt**: vorhandener Eintrag gewinnt |
| 13 | Fehler nach der Codeübernahme | **belegt**: Passwortfehler gibt den Code zurück statt ihn zu verbrauchen |
| 15 | Unveränderte Daten als bestätigt markieren | **belegt**: Sammelbefehl erneuert `synced_at` |
| 16 | Wiederkehrende Datensätze reaktivieren | **belegt**: weich gelöscht + gleicher Inhalt → wieder sichtbar |
| 17 | Alter ganzer Listen konservativ | **belegt**: der **älteste** Eintrag bestimmt die Frische |

| # | Verbesserung | Stand |
|---:|---|---|
| 1 | Anrufkennungen exakt vergleichen | **belegt**: Spalte `mails.call_id`, exakter Vergleich |
| 2 | Doppelte Zusammenfassungen verhindern | **belegt**: bedingte Aneignung in `finalize_call_summary` |
| 3 | Zusammenfassung und Entwurf gemeinsam | **belegt**: eine Transaktion, Rückroll-Nachweis |
| 4 | „Erledigt“ von „fehlgeschlagen“ | **belegt**: `stored`/`already`/`empty`/`failed` |
| 5 | Inhalt der Modellantwort prüfen | **belegt**: `isUsableSummary` verwirft Ablehnungen |
| 6 | Vereinbarungen mit Aktionen abgleichen | **belegt**: `alignSummaryAgreement` |
| 7 | Wiener Zeit im Mailbetreff | **belegt**: `viennaStamp`, Sommer/Winterzeit |
| 8 | Anrufkennung in eigener Spalte | **belegt**: Migration `0030` |
| 9 | Rettungsdatei bei Schreibfehler behalten | **belegt**: bleibt liegen, nur nach Erfolg weg |
| 10 | Fehlende und unlesbare Datei unterscheiden | **belegt**: `ENOENT` ≠ `EISDIR` |
| 11 | Abgebrochene Schreibvorgänge aufräumen | **belegt**: beide Fehlerpfade räumen auf |
| 12 | Rückbenennen nach Lesefehler absichern | **belegt**: kein blindes `rename` |
| 13 | Anforderung und Einlösung gemeinsam sperren | **belegt**: Riegel um den ganzen Ablauf |
| 14 | Nach Serverstart zeitnah synchronisieren | **belegt**: Sofortstart |
| 15 | Beim Stoppen laufende Arbeit berücksichtigen | **belegt**: `stop()` wartet |
| 16 | Laufzeit pro Praxis begrenzen | **belegt**: 60 s Default, gedeckelt |
| 17 | Parallel laufende Server koordinieren | **belegt**: Migration `0031`, Reservierung in der DB |
| 18 | Löschläufe gegen Überlappung schützen | **belegt**: Überlappungssperre + `stop()` wartet |
| 19 | Aktive Verläufe vor vorzeitigem Löschen | **belegt**: Migration `0032`, Trigger + Rückfall |
| 20 | Unveränderte Öffnungszeiten als geprüft | **belegt**: `saveHours` erneuert `synced_at` |

**Runde 7 — noch offen:** 19 und 20 der vorigen Liste sind die **externen**
Nachweise (Handytest, Betriebsdurchlauf) und bleiben offen.

**Runde 8 — zehn weitere Punkte (17.09.2026):**

| # | Verbesserung | Stand |
|---:|---|---|
| 1 | Verbrauchten Rücksetzcode wirklich entfernen | **belegt**: Zusammenführung greift auch ohne Zieldatei |
| 2 | Sperre nach Zeitüberschreitung halten | **belegt**: Freigabe erst nach Ende der Hintergrundarbeit |
| 3 | Überfällige Arbeit beim Herunterfahren | **belegt**: `BackgroundTracker`, `stop()` wartet begrenzt |
| 4 | Mailkonflikt nicht als Erfolg melden | **belegt**: `stored`/`already`/`missing`, nichts wird halb geschrieben |
| 5 | Leere Pflichtfelder ablehnen | **belegt**: Feld muss einen Wert haben |
| 6 | Terminwünsche als unbestätigt | **belegt**: jede terminbezogene Zusage wird gekennzeichnet |
| 7 | Rückrufzusagen erhalten | **belegt**: Rückruf/Übergabe/Konflikt bleiben unangetastet |
| 8 | Aktionen ausdrücklich zuordnen | **belegt**: `mapAgreementKind`, idempotent |
| 9 | Doppelprüfung gezielt in der Datenbank | **belegt**: Suche nach genau der Kennung |
| 10 | Fehler nach der Codeübernahme | **belegt**: geregelter Rückweg mit Meldung |

**Runde 8 — offen:** nichts aus dieser Liste. Die beiden **externen** Nachweise
(Handytest, Betriebsdurchlauf) bleiben unverändert offen.

**Runde 9 — zwanzig Punkte zu Buchungen und Öffnungszeiten (17.09.2026):**

| # | Verbesserung | Stand |
|---:|---|---|
| 1 | Buchungszustand je Praxis trennen | **belegt**: Schlüssel aus Ordination + Anruf |
| 2 | Halter eindeutig auswählen | **belegt**: Mehrdeutigkeit → Rückfrage |
| 3 | Bei unbekanntem Tier nachfragen | **belegt**: hinterlegte Namen werden genannt |
| 4 | Tierkorrekturen während der Buchung | **belegt**: neue Zuordnung, geprüft |
| 5 | Bestätigung enger definieren | **belegt**: „bitte" allein zählt nicht, Frage schließt aus |
| 6 | Verneinungen vollständig | **belegt**: „noch nicht buchen" bricht ab |
| 7 | Alle Uhrzeitänderungen | **belegt**: `readMessageIntent`, `dateTime` inbegriffen |
| 8 | Vorschlag vor Buchung zeitlich prüfen | **belegt**: `slotWithinLead` bei der Bestätigung |
| 9 | Alle geeigneten Ressourcen | **belegt**: je Tag alle Ressourcen |
| 10 | Tierarzt passend zum Termin | **belegt**: Ressourcenbindung |
| 11 | Freie Termine sortieren | **belegt**: `sortSlotsByStart` |
| 12 | Abgelehnte Vorschläge merken | **belegt**: Liste statt nur der letzte |
| 13 | Unklare Ergebnisse dauerhaft | **belegt**: Migration `0033`, überlebt Neustart |
| 14 | Programmname aus dem Anschluss | **belegt**: `adapter.label` |
| 15 | Vollständige Termindauer prüfen | **belegt**: `isOpenRangeAt` |
| 16 | „Kein freier Termin" ausdrücklich | **belegt**: `null` statt Datum |
| 17 | Suchraster und Dauer abstimmen | **belegt**: 5-Minuten-Raster |
| 18 | Öffnungszeiten streng validieren | **belegt**: Stunde 0–23, Minute 0–59 |
| 19 | Wiener Uhrzeit und Zeitpunkt trennen | **belegt**: `viennaNow`/`viennaInstant` getrennt |
| 20 | Fehlende Rolle nie zu Inhaber | **belegt**: eingeschränkt statt aufgewertet |

**Runde 9 — offen:** nichts aus dieser Liste. Externe Nachweise bleiben offen.

**Runde 10 — Buchungssicherheit und Datensicherung (18.09.2026):**

| # | Verbesserung | Stand |
|---:|---|---|
| 1 | Ausgefallener Schutz gibt nicht frei | **belegt**: `clear`/`blocked`/`unavailable`, `unavailable` lehnt ab |
| 2 | Absicht vor dem Schreibversuch sichern | **belegt**: `beginWrite` mit `pending_write` |
| 3 | Unklare Buchungen auflösen | **belegt**: `resolveGuard` hebt eine belegte Sperre auf |
| 4 | Tierarztwahl vervollständigen | **belegt**: Ressourcenbindung ausdrücklich |
| 5 | Haltername und Nummer erneut prüfen | **belegt**: Ziffernvergleich, Neuzuordnung |
| 6 | Tierkorrektur behält den Tag | **belegt**: `requestedDate` bleibt |
| 7 | „Abbrechen" beendet | **belegt**: `isCancel` trennt Abbruch von Ablehnung |
| 8 | Bedingte Zustimmung | **belegt**: „Ja, wenn …" bucht nicht |
| 9 | Verstorbene Tiere nicht wählen | **belegt**: eigener Fall mit Antwort |
| 10 | Chipnummern zur Zuordnung nutzen | **belegt**: `findOwnerAndPatient` löst gleichnamige Tiere über die Chipnummer (voll oder letzte 4 Ziffern) auf; genau ein Treffer bucht, sonst Rückfrage; `guessChip` erkennt getrennt geschriebene Chips |
| 11 | Verbindungsfehler ≠ nicht gefunden | **belegt**: `unavailable` mit eigener Antwort |
| 12 | Terminfenster vollständig prüfen | **belegt**: `slotCoversDuration` |
| 14 | Erst nach Tag filtern, dann wählen | **belegt**: Filter vor der Auswahl |
| 15 | Abgelehnte Termine nach Zeitpunkt | **belegt**: Text *und* Zeitpunkt |
| 16 | Zeitgrenze und Nebenläufigkeit | **belegt**: Gruppen von 3 |
| 17 | Export nur mit Berechtigung | **belegt**: Inhaberin, UI und `AGENTS.md` nachgezogen |
| 18 | Sicherungsdateien verschlüsseln | **belegt**: AES-256-GCM mit scrypt-Passwort (`backup-cipher.ts` isomorph + `backup-cipher.server.ts`), GCM-Tag weist falsches Passwort ab, Download/Upload verlangt Passwort |
| 19 | Mehrfache Speicherkopien beim Export | **belegt**: `writeTafelBackupCopy` legt die verschlüsselte Sicherung zusätzlich in `<Datenordner>.backup` ab (`SILVIA_BACKUP_DIR` übersteuerbar), best-effort |
| 20 | Neustartfestigkeit echt nachweisen | **belegt**: zwei Prozesse, `scripts/booking-guard-restart-probe.mjs` |

**Runde 10 — vollständig belegt (0 offen).**

**Runde 11 — Live-Wrapper und Notfall (30.09.2026), 19 Punkte, jeder mit ausgeführtem Test:**

| # | Punkt | Nachweis |
|---:|---|---|
| 1 | Live spricht nur mit dem EU-Host; fremde Hosts, http, Port, Login, Pfad gesperrt | `policy.test.ts` „nur der EU-Host“ |
| 2 | ZDR-Nachweis Pflicht, Zukunft und über ein Jahr alt gesperrt | `policy.test.ts` „ZDR-Datum“ |
| 3 | DPA-Kennung, Datenregion AT und Postgres sind Pflicht (jede fehlende Bedingung sperrt) | `policy.test.ts` „jede einzelne“ |
| 4 | Proxy sperrt Live | `policy.test.ts` „Proxy“ |
| 5 | Demo-Sandbox und Produktiv schließen sich aus | `policy.test.ts` „Demo-Sandbox“ |
| 6 | Live-Sitzung nutzt den EU-Resolver, fremder Host startet nicht | `policy.test.ts` „Live-Sitzung nutzt den EU-Host“ |
| 7 | KI-Ansage nach Art. 50 im Prompt und in der Begrüßung | `runde11.test.ts` |
| 8 | Anweisungsartige Praxisdaten werden aus dem Prompt entfernt | `adversarial.test.ts` „Injection“ |
| 9 | E-Mail und Telefonnummern (auch mit Leerzeichen/Klammern) werden geschwärzt | `redact.test.ts`, `adversarial.test.ts` |
| 10 | IBAN (auch mit Leerzeichen), Chip, SVN werden geschwärzt | `redact.test.ts`, `adversarial.test.ts` |
| 11 | Uhrzeiten und Daten bleiben unberührt | `redact.test.ts` |
| 12 | Nur die von Anrufenden genannte Nummer darf zur Bestätigung zurück | `runde11.test.ts` |
| 13 | Notfallerkennung, acht Kategorien, im Zweifel Notfall | `emergency.test.ts`, `adversarial.test.ts` |
| 14 | Kein Fehlalarm bei Tollwutimpfung, Geburtsdatum, Bluttest, „sofort“ | `emergency.test.ts`, `runde11.test.ts` |
| 15 | Notfallerkennung ist im Anrufpfad aktiv (`localReply`) | `runde11.test.ts`, `verstehen.test.ts` |
| 16 | Monatliches Minutenbudget je Praxis mit Monatswechsel | `budget.test.ts` |
| 17 | Stimmen-Stufe mit Rückfall auf die günstige Variante | `tier.test.ts` |
| 18 | Audit-Protokoll ohne Audio und ohne Klartext-Personendaten | `audit.test.ts` |
| 19 | Schwärzung auch im Modell-Auszug der Akte (`redactStoredContact`) | `runde11.test.ts` |

Grenze: Politik, Budget, Tier und Audit sind als Module belegt, aber noch nicht in den Live-Anruf eingehängt; das zählt hier nicht als Freigabe.

**Runde 5 — noch offen:** 1, 4–6, 8, 9, 11–17 und 25 (Einladungsgrenze
gleichzeitig, doppelte E-Mail bei Einladungen, Einladungslimit je Benutzer,
Änderungsprotokoll, Anmeldung gegen parallele Versuche, Codes je Benutzer,
Codedatei atomar ersetzen, Zwischenspeicher-Frische, wiederkehrende gelöschte
Datensätze, Alter einer Ergebnisliste, leere Suchergebnisse, gelöschte
Ressourcen und Patienten, dauerhafte Vormerkung der Zusammenfassung).

**Was hier wirklich geändert wurde:**

- `remove_practice_staff()` und `set_practice_password()` (Migration `0028`)
  bringen Prüfung, Sperre und Schreibvorgang in **eine** Anweisung.
- `desk-reset-file.ts` (neu) eignet sich den Rücksetzcode per `rename` an.
- `ownersAlign()` verlangt **zwei** Merkmale, wenn beide Seiten einen Vornamen
  nennen: „Anna Berger“ ist nicht „Maria Berger“.
- `pickConfirmOwnerRow()` liefert bei mehreren Treffern `null`.
- `isLocalOrLanIp()` prüft erst die Form, dann die Bedeutung.
- `detectEndCall()` legt bei zitiertem Abschied nicht mehr auf.
- `escapeLikeNeedle()` maskiert `%`, `_` und `\`.
- Der Buchungsschlüssel enthält jetzt `pmsKind`.

**Nachweis der Runde:** volle Suite **1120 Tests, 0 Fehler, Exit 0**, Starter
meldet **156 entdeckte = 156 ausgeführte Dateien**. `tsc --noEmit` Exit 0,
`eslint` Exit 0. `staff-atomic.test.ts` gegen Migration `0028` ist gelaufen:
5/5 (Atomarität, letzte Inhaberin, eigener Sitzungserhalt, fremde Ordination).

**Umgebungsfalle, gefunden und behoben:** Ein einzelner Browsertest
(`store.test.ts`) scheiterte mit „Executable doesn't exist“. Ursache war
`PLAYWRIGHT_BROWSERS_PATH`, das auf einen **gelöschten** Sandbox-Ordner zeigte,
obwohl die Browser im Standardordner liegen. `run-tests-clean.mjs` entfernt die
Variable jetzt, wenn der Ordner fehlt. Ohne diese Falle läuft die Suite grün.

### Wichtige Erkenntnis: Heap-Erschöpfung im Testlauf

Die TypeScript-Tests laufen in **einem** Prozess und legen viele
PGlite-Instanzen an. Mit dem Standard-Heap (~4,3 GB) bricht Node mitten im
Lauf mit `JavaScript heap out of memory` ab. Die Folge ist **tückisch**: Die
Gesamtzahl schwankt (738, 803, 820, 866) und es erscheinen Fehler in
Datenbank-Tests, die einzeln alle grün sind.

`tsx` startet einen eigenen Kindprozess und reicht `--max-old-space-size` als
Argument **nicht** weiter. Der Fix steht in `scripts/run-tests.mjs`: Der
Parameter geht über `NODE_OPTIONS` an den Kindprozess (Heap dann 8384 MB).

**Regel:** Bei schwankenden Testzahlen zuerst den Heap prüfen, nicht den Code.

### Offene Punkte für die nächste Sitzung

Die beiden früheren Punkte „Vollen Testlauf mit korrigiertem Heap belegen“ und
„`run-tests.mjs`-Heap-Fix committen“ sind **erledigt**: Die Suite läuft seitdem
wiederholt grün (zuletzt 167 Testdateien, Exit 0) und der Heap-Fix ist in
`scripts/run-tests.mjs` committet.

Verbleibende offene Punkte — alle **extern** oder eine **Entscheidung**, kein
Codebefund:

| Offen | Warum es zählt |
|---|---|
| Echter iPhone-Sprechtest | Sprachkette ist am Desktop belegt, nicht am Gerät |
| GitHub-Remote-CI | Externer Zahlungsblock; kein unabhängiger Lauf |
| Telefonie, Vquadrat-Schreiben | Brauchen Freigabe und ein echtes Zielsystem |
| Fremdrechner, Upgrade/Rollback | Nur lokal belegt |
| Rechtsabnahme (Datenfluss, AVV) | Externe Stelle |
| Node-Umgebung auf diesem PC | Standard-`node` ist weiterhin 20.19.0; Produktionsstart, Build und Preflight wählen die installierte kompatible Node-Version über den Launcher. Der systemweite PATH bleibt unverändert. |
| Kostenobergrenze der Live-Nutzung | Lokal nur 120-s-Limit; vor öffentlicher Freigabe separates Anbieter-Projekt mit monatlichem Hard Spend Limit und dokumentiertem Inhaberbetrag nötig. Einstellung nicht aus der App verifizierbar; geringe Überschreitung laut Anbieter möglich. |
| Anbieter-Aufbewahrung | Nicht geprüft |

### Zehn Verbesserungen aus der Code-Durchsicht (15.09.2026)

| # | Verbesserung | Status | Nachweis |
|---:|---|---|---|
| 1 | Uhrzeitkorrektur: letzte Angabe gewinnt | **erledigt** | „um 15 Uhr“ … „Nein, um 16 Uhr“ → 16:00 |
| 2 | Tageskorrektur behält die Uhrzeit | **erledigt** | „morgen statt heute um 15 Uhr“ → dateTime 15:00 |
| 3 | Unmögliche Uhrzeit ergibt Rückfrage | **erledigt** | „um 25 Uhr“ → unclear (vorher stiller Tageswunsch) |
| 4 | Österreichische Wortzeiten deuten | **erledigt** | „halb vier“ 15:30, „viertel vier“ 15:15, „dreiviertel vier“ 15:45 |
| 5 | Konkrete Kalenderdaten verstehen | **erledigt** | „18.09.2026“ → date; „31.02.“ → unclear; Schaltjahr beachtet |
| 6 | Abgelöste Hörprobe beendet den Knopf | **erledigt** | bereits durch die Anforderungs-ID abgesichert, 2 neue Tests |
| 7 | Audiofehler verständlich anzeigen | **erledigt** | „Die Hörprobe konnte nicht abgespielt werden.“ + „Erneut versuchen“ |
| 8 | Beschädigte Umlaute reparieren | **erledigt** | 3 Dateien (52 Stellen); `scripts/encoding-audit.mjs` als Wächter |
| 9 | Die zwei größten Dateien aufteilen | **teilweise** | Connector-Anbindung aus `ask-alma.ts` → `ask-alma-connector.ts` (1712→1615 Zeilen); Typen + Mikrofon-Konstanten aus `sprechen-call.tsx` → `sprechen-call-helpers.ts` (2916→2890). Die zustandsgebundenen Funktionen bleiben bewusst in der Komponente |
| 10 | Vertragsseite mit dem Betrieb abstimmen | **erledigt** | Impressum jetzt sichtbar als Muster gekennzeichnet |

> Historischer Hinweis: Beim Übernahmestand nannte OpenAI **50 %**. Das war
> derselbe Nachweisindex wie heute — er hat sich nicht verändert. Wer nur den
> Arbeitsfortschritt liest, überschätzt die Reife um 46 Punkte. Maßgeblich ist
> immer der Nachweisindex.

**Vorführ-Link (getestet, mit Stimme):** Über einen HTTPS-Tunnel ist die
komplette Homepage für Kollegen bedienbar — Hörproben, Trainingsmodus und alle
Funktionsseiten. Mit laufenden lokalen Sprachdiensten antwortet Silvia auch
**hörbar**. Details im Abschnitt „Vorführ-Link für Kollegen".

| Block | Arbeitsfortschritt | Beleg |
|---|---:|---|
| Hörproben-CTA („Marin anhören“) sofort auf „Pause“ | 100 % | `src/components/silvia-voice.tsx`, `silvia-voice-state.ts` + Unit-Tests; **Browserbeleg neu am 18.09.2026**: `{"ok":true,"immediateLabel":"Pause","sampleObserved":{"paused":true,"src":"…/silvia-premium-ramona.wav"},"returnLabel":"Marin anhören","failedSourceLabel":"Marin anhören"}` — sofort „Pause“, nach dem Ende zurück, bei Tonfehler zurück |
| Typprüfung (gesamtes Projekt) | 100 % | `tsc --noEmit` Exit 0 |
| Lint (gesamtes Projekt) | 100 % | `eslint .` Exit 0 |
| Programmtests | 100 % | **1227 grün, 0 Fehler** in bereinigter Umgebung, 161/161 Dateien ausgeführt — **neu gemessen am 18.09.2026** |
| Homepage-Audit (14 Gruppen) | 100 % | Isolierter Build + Client-Bundle-Audit grün; **alle 15 Audits Exit 0** (inkl. CTA-Immediate und Live-Demo) — **neu ausgeführt am 18.09.2026**, 371 s |
| Offizieller Homepage-Befehl | 100 % | `scripts/isolated-home-audit.mjs homepage` → **Exit 0**, 15/15 Audits Exit 0, `tempRootRemoved:true`, `buildExit:0`, `originalOutputUnchanged:true`, **568 versionierte Dateien** — **neu ausgeführt am 18.09.2026 mit Node v24.19.0** (Standard-`node` ist v20.19.0) |
| Playwright-Release-Gate | 100 % | `playwright.release-gate.config.ts` → **1 passed (31,1 s), Exit 0** — **neu ausgeführt am 18.09.2026** |
| Produktions-Audit (isoliert) | 100 % | **Exit 0**, `ok:true`, `buildExit:0`, `originalOutputUnchanged:true` — **neu ausgeführt am 18.09.2026** (Build, Neustart, Browser, CSRF, Sprachgrößen, Audio-Range) |
| Fresh-Install-Audit (isoliert) | 100 % | `npmInstallOffline:true` (425 Pakete, 14 s), `dependencyLifecycleScripts:false`, alle 4 Kernrouten 200 vor **und** nach Neustart, `liveDemoEnabled:false`, `tempRemoved:true` |
| Version-Switch-Audit | 100 % | `oldVersionBlockedAfterUpgrade:true` (Altserver 500 nach Upgrade), `rollbackWithMatchingBackup:true`, `tempRemoved:true`; lief gegen den neuen Commit `3182ae7` |
| Vquadrat-Bridge-Audit (lesend) | 100 % | `ok:true` gegen die Testkopie: `masterSync`, `bridgeReadThrough`, `slotsLiveRead`, `emptyOutbox`, `connectorOutageFailClosed:true`, **`connectorReadOnly:true`**, **`appointmentWriteEnabled:false`** — kein Schreibzugriff auf eine echte Praxis |
| Regression ausgeschlossen | 100 % | Greeting-Audit gegen Basisversion **und** gegen meine Version je Exit 0 (40 s, identisches Ergebnis) |
| Terminlogik | 100 % | `appointment-preference.ts`, `ask-alma.ts` (`kind: "Terminwunsch"` statt Auto-Buchung), `appointment-date-audit.mjs`; **Audit Exit 0 (neu am 18.09.2026)**: `appointments:2` an genau den zwei Wunschtagen (`requestedDays === savedDays`), `patientIdsUnchanged:true`, `noAppointmentsInClosedPractice:true`; die gespeicherten Termine stehen auf `status:"gelegt"`, nicht „bestätigt". Zusätzlich Fokustests in `appointment-wish.test.ts` und `booking.test.ts` |
| Datenschutz (lokal, keine Fremd-KI) | 100 % | `llm-runtime-guard`, Live-Demo nur RAM-Sandbox, `SILVIA_LIVE_DEMO.md` |
| Datenschutz-Audit (isoliert) | 100 % | **Exit 0, neu ausgeführt am 18.09.2026**: `privacy-demo-flag` — 8 Flag-Varianten (`true`/`false`/`"true"`/`"false"`/`1`/`0`/`{}`/`null`), nur echtes `true` trainiert, `source:"local"` in allen Fällen, `localOnly:true`; `privacy-practice-facts` — zwei Praxen getrennt (`Auditregel A`/`B`), `demoPositiveControl:true`; `privacy-practice-stt` — 4 Anfragen nur Loopback, `promptIsolation:true`. `originalOutputUnchanged:true` |
| Paketpreise als Entwurf markiert | 100 % | `docs/PAKETPREISE-ENTWURF.md`, `src/lib/silvia-pakete.ts` |
| Hörprobe korrekt als nicht-interaktiv beschriftet | 100 % | `hero.tsx` („… das interaktive Gespräch ist erst nach Freigabe verfügbar.“), `call-scene.tsx` („… · nicht interaktiv“) |
| Handy-/Hörtest am echten Gerät | 75 % | Über den Tunnel belegt: Silvia antwortet **hörbar** und sichtbar („Grüß Gott, Ordination Huber"), 3 Audio-Antworten HTTP 200, `#sprechen-llm-source` **„Lokal"**, keine Seitenfehler. Alle drei Sprachdienste laufen und der offizielle Audit ist grün. Das Sprechen **ins** Mikrofon vom iPhone aus ist noch nicht abgenommen |
| GitHub Actions (Remote-CI) | 0 % | offen — externe Ursache belegt: „The job was not started because recent account payments have failed or your spending limit needs to be increased." Die Jobs starten nach 4 s gar nicht; kein Codebefund |
| Echte GPT-Live-1-Nutzung, Telefonie, Vquadrat-Schreiben | **Live: freigegeben (nur lokal)** / Telefonie + Vquadrat: 0 % | **GPT-Live-1 am 15.09.2026 vom Inhaber für lokale Tests freigegeben.** Sperren bleiben aktiv: `SILVIA_DATA_DIR=memory`, keine `DATABASE_URL`, `SILVIA_LIVE_GUARD_DIR` außerhalb des Repos, höchstens eine Sitzung, 120-s-Limit. Testserver läuft auf `127.0.0.1:8093`. Belegt im Browser: Status „Live-Hörprobe ist bereit", Bestätigung nicht vorausgewählt, Startknopf bis zur Bestätigung gesperrt, **0 externe Anfragen** beim Laden, keine Seitenfehler. **Telefonie und Vquadrat-Schreiben bleiben ausdrücklich gesperrt** |

### Vollständige Nachweisliste dieses Arbeitsgangs (alle Exit 0)

| Nachweis | Ergebnis |
|---|---|
| Typecheck (ganzes Projekt) | Exit 0 |
| Lint (ganzes Projekt) | Exit 0 |
| Programmtests | 849/849, 0 Fehler |
| Homepage-Audits | 14/14 Exit 0 |
| Playwright-Release-Gate | 1 passed (27,6 s) |
| Produktions-Audit | `ok: true`, 0 Browserfehler |
| Datenschutz-Audit | 3/3 Exit 0 (`localOnly: true`) |
| Termin-Audit | `ok: true`, keine Doppelbuchung |
| Fresh-Install-Audit | `ok: true`, offline |
| Version-Switch-Audit | `ok: true`, Rollback belegt |
| Vquadrat-Bridge-Audit | `ok: true`, nur lesend, Termin-Schreiben gesperrt |

### Abschluss-Audit gegen die Zielanforderungen

> Diese Tabelle prüft die **Zielsetzung** dieser Arbeit, nicht die
> Produktionsreife. „Erfüllt" heißt: mit aktueller Evidenz belegt — es heißt
> **nicht**, dass Silvia betrieben werden darf. Dafür gilt der Nachweisindex
> oben.

| Anforderung | Nachweis | Status |
|---|---|---|
| 1. Hörproben-Button sofort „Pause", Fehler setzt zurück, Generationlogik erhalten | `silvia-voice.tsx` + `silvia-voice-state.ts` + 6 Tests; Browserbeleg `immediateLabel:"Pause"` / `failedSourceLabel:"Marin anhören"` | erfüllt |
| 2. Homepage-Audit mit Node 24 | Alle Läufe mit `v24.19.0`; 15/15 Exit 0; Release-Gate grün | erfüllt |
| 3. Typecheck, Lint, Tests grün | `tsc` 0, `eslint .` 0, **849/849** | erfüllt |
| 4a. Terminlogik | Audit Exit 0 + 5 Fokustests | erfüllt |
| 4b. Datenschutz-Garantie | `llm-runtime-guard` (`calls === 0` bei extern), Datenschutz-Audit 3/3 | erfüllt |
| 4c. Hörprobe als nicht-interaktiv beschriftet | `hero.tsx`, `call-scene.tsx`; WAV kommt in der Live-Demo nicht vor | erfüllt |
| 4d. Paketpreise als geplant markiert | `PAKETPREISE-ENTWURF.md` („keine Freigabe zum Verkauf"), `silvia-pakete.ts` („geplant, erst nach Freigabe") | erfüllt |
| 5. Port 8092 nicht angefasst | Port war frei; alle Audits auf 8183/8185/8095/8096 | erfüllt |
| 6. Entscheidungen eingehalten | Alle vier durch Audits belegt | erfüllt |

**Was trotz „erfüllt" offen bleibt und den Nachweisindex bei 50 % hält:**

| Offen | Warum es zählt |
|---|---|
| Echter iPhone-Sprechtest | Die Sprachkette ist am Desktop belegt, nicht am Gerät |
| GitHub-Remote-CI | Externer Zahlungsblock; kein unabhängiger Lauf |
| Telefonie, Vquadrat-Schreiben | Brauchen Freigabe und ein echtes Zielsystem |
| Fremdrechner, Upgrade/Rollback | Nur lokal belegt |
| Rechtsabnahme (Datenfluss, AVV) | Externe Stelle |
| Node-Aktualisierung | Standard-`node` ist weiterhin 20.19.0 |
| Kostenobergrenze der Live-Nutzung | Kein Euro-Limit, nur ein 120-s-Limit |
| Anbieter-Aufbewahrung | Nicht geprüft |

### Wichtige Erkenntnis: Umgebungsverunreinigung bei lokalen Läufen

Vier Prüfungen schlugen zunächst fehl und waren **keine Produktfehler**:

1. **2/844 Tests rot** (`gate-identity.test.ts`): Ursache waren Überreste aus
   Audit-Läufen in der Shell (`SILVIA_DATA_DIR`, `SILVIA_LLM_PROVIDER`,
   `OPENAI_API_KEY`, …). In bereinigter Umgebung: 844/844 grün.
   → `scripts/run-tests-clean.mjs` entfernt diese Variablen vor dem Lauf.
2. **Greeting-Audit 91-s-Timeout**: Ursache war Maschinenlast durch noch offene
   Audit-Serverprozesse. Allein ausgeführt: Exit 0 in 30–40 s.
3. **Release-Gate rot**: dieselbe Env-Verunreinigung; bereinigt grün.
4. **Fresh-Install-Audit „npm-Cache fehlt"**: `npm config get cache` zeigte in
   dieser Umgebung auf einen Sandbox-Pfad. Lösung:
   `npm_config_cache=%LOCALAPPDATA%\npm-cache` setzen.

**Regel für künftige Läufe:** Vor lokalen Prüfungen die `SILVIA_*`/`AUDIT_*`-
Variablen der Shell entfernen und `npm_config_cache` auf den dauerhaften
Pfad setzen, sonst entstehen falsche Fehlschläge.

### Änderungen in diesem Arbeitsgang (15.09.2026)

Neu:
- `src/components/silvia-voice-state.ts` — Zustandsautomat für den CTA.
- `src/components/silvia-voice-state.test.ts` — 6 Tests (sofort „Pause“,
  Fehler schaltet zurück, überholte Probe wird verworfen, Stopp).
- `scripts/homepage-cta-immediate-audit.mjs` — Browserbeleg ohne Karenzzeit,
  inklusive Fehlerfall mit blockierter Tonquelle.
- `scripts/run-audit-group.mjs`, `scripts/run-single-audit.mjs`,
  `scripts/run-tests-clean.mjs` — isolierte Audit-/Testhelfer.

Geändert:
- `src/components/silvia-voice.tsx` — `HearSilvia` nutzt den Automaten: Der
  Klick schaltet **sofort** sichtbar auf „Pause“; erst ein echter Audiofehler
  oder das Ende der Wiedergabe schaltet zurück. Signale einer abgelösten Probe
  werden über die Anforderungs-ID verworfen (Generation-/Abbruchlogik erhalten).
- `scripts/homepage-acceptance-audit.mjs` — die früheren 500 ms Wartezeit vor
  der „Pause“-Prüfung entfernt. Genau diese Wartezeit maskierte die Verzögerung.
- `scripts/isolated-home-audit.mjs`, `scripts/run-homepage-audit.mjs` — der neue
  CTA-Audit ist in beide Allowlists aufgenommen.

**Nächster Schritt:** Handy-/Hörtest am echten Gerät, danach Freigabeentscheidung
für die öffentliche Live-Demo und die Kosten.

### iPhone-Vorführung beim Kunden (offen, vorbereitet)

Ziel: Mit dem iPhone als Kunde Silvia anrufen — auch vor Ort beim Kunden, ohne
Vorbereitung am fremden Gerät.

Belegt durch Recherche und Code-Prüfung:

| Baustein | Stand |
|---|---|
| LAN-Start als RAM-Demo | `lanStartSafety()` erlaubt ihn **nur** mit `SILVIA_DATA_DIR=memory` **und** `SILVIA_ALLOW_INSECURE_LAN_TEST=1`; alles andere wird blockiert |
| Server im LAN | gestartet auf `0.0.0.0:8080`, über `192.168.0.121:8080` mit HTTP 200 erreichbar |
| Firewall | Node.js eingehend bereits erlaubt |
| WLAN | als „Privat" eingestuft |
| **Mikrofon am iPhone** | **blockiert** — iOS erlaubt `getUserMedia` nur im sicheren Kontext |

Für iOS gibt es **keine Chrome-Flags** (alle iOS-Browser nutzen WebKit). Zwei Wege:

1. **Cloudflare Quick Tunnel** (empfohlen für vor Ort): `cloudflared tunnel --url http://localhost:8080`
   liefert eine `https://…trycloudflare.com`-URL — kein Konto, kein Zertifikat,
   keine iPhone-Einstellungen. Nachteil: Der Ton läuft über Cloudflare, deshalb
   **nur mit erfundenen Demodaten** zulässig.
2. **mkcert + Zertifikatsprofil**: sauber und netzunabhängig, verlangt aber
   einmalig `rootCA.pem` am iPhone zu installieren und in
   *Einstellungen → Allgemein → Info → Zertifikatsvertrauen* freizuschalten.
   Für ein fremdes Kundengerät ungeeignet.

`cloudflared` ist installiert (Version `2026.9.1`) und der Weg ist **belegt**:
```
cloudflared tunnel --url http://localhost:8080 --no-autoupdate
→ https://metro-mini-loans-acute.trycloudflare.com
```

Browser-Beleg gegen diese URL (headless Chromium, synthetisches Mikrofon):

```json
{ "secureContext": true, "hasMediaDevices": true,
  "callSectionPresent": true, "microphone": "granted", "pageErrors": [] }
```

Damit ist die iPhone-Vorführung technisch bereit. Der Aufruf `/api/live-demo/status`
antwortet über den Tunnel mit **403** — das ist die gewollte Sperre für fremde
Herkunft und betrifft die Live-Hörprobe, nicht die Anruf-Oberfläche.

**Ablauf für die Vorführung:**

1. `npm start` (oder der laufende LAN-Server auf 8080) muss laufen.
2. `cloudflared tunnel --url http://localhost:8080` starten und die
   `https://…trycloudflare.com`-URL ablesen.
3. Am iPhone diese URL in Safari öffnen, zu `#anrufen` scrollen, Mikrofon erlauben.
4. **Nur erfundene Inhalte** nennen — der Ton läuft über Cloudflare.

Die URL ändert sich bei jedem Tunnelstart. Ohne Internet oder mit einem
Cloudflare-Ausfall ist der Weg nicht verfügbar; dann bleibt `mkcert` (Weg 2).

**Nicht vergessen:** Der LAN-Tunnel darf **niemals** mit echten Praxisdaten
laufen. Der Start ist über `SILVIA_ALLOW_INSECURE_LAN_TEST=1` bewusst als
RAM-Demo markiert, und `lanStartSafety()` verweigert alles andere.

### Vorführ-Link für Kollegen (belegt am 15.09.2026)

**Die Homepage lässt sich über den HTTPS-Tunnel vorführen — ohne lokale
Sprachdienste.** Belegt im Browser gegen
`https://metro-mini-loans-acute.trycloudflare.com`:

| Was | Ergebnis |
|---|---|
| Sicherer Kontext / HTTPS | ✅ `true` |
| Seitenfehler | ✅ keine |
| **Marin-CTA** | ✅ „Marin anhören" → **„Pause"**, Audio 42,8 s geladen |
| **Beide Paket-Hörproben** | ✅ spielen und laufen (`advanced: true`) |
| **Trainingsmodus** | ✅ Umschalter sichtbar, Wissen-Training wählbar |
| **Trainings-Eingabe** | ✅ „Sprechen Sie – Pause heißt fertig", Formular mit „Sprechen"/„Senden" |
| **Antwort sichtbar** | ✅ „Grüß Gott, Huber. Ich bin Silvia – schulen Sie mich." |
| **Sprachdienste laufen** | ✅ Whisper 8199, STT 8178, TTS 8179 — `scripts/local-voice-service-audit.mjs` Exit 0 |
| **Antwort hörbar über den Tunnel** | ✅ 3 Audio-Antworten HTTP 200, Quelle **„Lokal"** |
| Server-Antworten | ✅ HTTP 200 |

**Was über den Link geht:** Belegt ist die **vollständige Sprachkette** — Silvia
antwortet sichtbar **und hörbar**, die Quelle bleibt „Lokal" (keine externe KI).
Voraussetzung sind die drei laufenden Sprachdienste auf `127.0.0.1`:

| Dienst | Port | Prüfung |
|---|---:|---|
| Whisper (whisper.cpp) | 8199 | Modell `ggml-small.bin` geladen (487 MB) |
| STT-Proxy | 8178 | `/health` → `ok: true` |
| TTS (Piper) | 8179 | `/health` → `ok: true`, 5 Stimmen |

Start: `C:\silvia-voice\start-voice.cmd`. Der offizielle Audit
`scripts/local-voice-service-audit.mjs` ist danach grün:

```json
{"ok":true,"onlyLoopback":true,"syntheticInput":true,
 "tts":{"status":200,"wav":true,"audioBytes":100396},
 "stt":{"status":200,"transcriptReceived":true}}
```

Browserbeleg über den Tunnel: Frage „Wie sind Ihre Öffnungszeiten?" →
Antwort „Grüß Gott, Ordination Huber, Silvia am Apparat." →
**3 Audio-Antworten HTTP 200**, `#sprechen-llm-source` = **„Lokal"**, keine
Seitenfehler.

**Bekannte Stolperfalle:** `start-voice.cmd` startet Whisper mit `start "…"` in
einem eigenen Fenster. Wird das Skript aus einer Umgebung mit
Ausgabeumleitung aufgerufen, bricht Whisper mit „Die Eingabeumleitung wird
nicht unterstützt" ab und STT bleibt rot. Dann Whisper direkt starten:

```powershell
C:\silvia-voice\whisper\Release\whisper-server.exe `
  -m C:\silvia-voice\models\ggml-small.bin -l de `
  --host 127.0.0.1 --port 8199 --convert -t 4
```

**Was über den Link NICHT geht:** Die Live-Hörprobe (GPT-Live-1). Sie ist an
eine ausdrücklich gestartete RAM-Sandbox gebunden und über den Tunnel mit
**403** gesperrt — fremde Herkunft wird vor dem Versand blockiert. Das ist
gewollt.

**Zwei offene Punkte für eine Vorführung:**

1. Silvia begrüßt auf der Homepage als **„Huber"** (Wiener Demo-Praxis). Für
   eine Vorführung wäre der eigene Ordinationsname besser.
2. Der **„Korrigieren"-Knopf** erscheint erst nach einer gespeicherten Regel,
   nicht bei der Begrüßung. Der Trainingsablauf braucht zwei Runden, damit der
   eigentliche Aha-Moment sichtbar wird.

**Ablauf für einen Kollegen:**

1. Link öffnen (Safari/Chrome, auch Mobilfunk).
2. Auf „Trainieren" schalten.
3. Regel eintippen, z. B. „Bei der Begrüßung sagen Sie: Grüß Gott, …".
4. Senden — Silvia bestätigt sichtbar.
5. Optional die fertigen Hörproben im Hero und im Paketbereich abspielen.

Es dürfen **nur erfundene Inhalte** genannt werden — der Ton läuft über
Cloudflare.

### Live-Hörprobe lokal testen (freigegeben am 15.09.2026)

Der Inhaber hat **GPT-Live-1 für lokale Tests freigegeben**. Telefonie und
Vquadrat-Schreiben bleiben gesperrt.

```powershell
# Voraussetzungen: OPENAI_API_KEY in .env, SILVIA_LIVE_GUARD_DIR absolut
$env:SILVIA_LIVE_GUARD_DIR = "C:\silvia-live-guard"
npm run live:sandbox -- --confirm-synthetic
# → http://127.0.0.1:8093
```

Auf der Seite zu „Interaktive Live-Hörprobe" scrollen, die Bestätigung
anklicken und **Hörprobe starten** wählen. **Ausschließlich erfundene Inhalte**
nennen.

Aktive Schutzschranken (im Browser belegt):

| Schranke | Verhalten |
|---|---|
| Datenspeicher | nur RAM, keine `DATABASE_URL` — sonst verweigert der Launcher |
| Schutzordner | muss absolut und dauerhaft sein; `.output`, `temp`, `tmp` sind gesperrt |
| Bestätigung | nicht vorausgewählt; ohne sie ist der Startknopf gesperrt |
| Mikrofon | wird erst nach dem Start angefordert |
| Gleichzeitigkeit | höchstens eine aktive Sitzung |
| Zeitlimit | 120 Sekunden, dann Stopp-Anforderung |
| Abschluss | ohne bestätigtes `session.closed` bleibt der Slot gesperrt |

Die Sperre greift **vor** Mikrofon, WebRTC und jedem Anbieter-WebSocket — auch
wenn der Schlüssel vorhanden ist.

**Was die Freigabe nicht abdeckt:** Kostenobergrenze, Anbieter-Aufbewahrung,
echte Sprachqualität, Unterbrechung im Gespräch und die Frage, was jemand
tatsächlich ins Mikrofon spricht. Die Bestätigung ist eine sichtbare
Schutzschranke, kein technischer Beweis.

Die sichere Reihenfolge für den gemeinsamen Handy- und Browsertest steht in
[`GEMEINSAME-ABNAHME.md`](GEMEINSAME-ABNAHME.md).

## Produktions-Preflight

Mit `npm run preflight:production` lässt sich die bestehende isolierte
Produktionsprüfung starten. Sie prüft Build und isolierten Start mit einer
frischen Testkopie. Der Befehl ersetzt keine HTTPS-, Handy-/Fremdrechner-,
Vquadrat- oder Versionswechsel-Abnahme und ist keine Produktionsfreigabe.

Voraussetzung ist Node.js mindestens 22.12.0. Auf dem aktuellen Praxis-PC
meldet `node --version` noch 20.19.0; der Preflight bricht deshalb bewusst vor
dem Build ab. Das Laufzeit-Update ist offen, kein bestandener Preflight.

## Verlauf ab hier — historische Tagesstände

Die folgenden Abschnitte sind ein **Protokoll**. Überschriften mit
Prozentzahlen („70 %“, „50 %“, „825/825“) nennen den Stand **dieses Tages**,
nicht den heutigen. Maßgeblich sind ausschließlich Nachweisindex und
Umsetzungsstand im Kopf dieser Seite.

## Arbeitsfortschritt ohne Schlussabnahme: 70 % (15.09.2026, historisch)

Dieser Arbeitswert zählte die umgesetzte Produktarbeit, nicht die abschließenden
gemeinsamen Tests. Er ist **überholt** und durch die gezählte Tabelle im Kopf
dieser Seite ersetzt.

## Nachweis- und Betriebsindex: 50 % (15.09.2026, historisch)

Die folgenden Nachträge und die detaillierte Bereichstabelle beziehen sich
auf den damaligen konservativen Nachweisindex. Er zählt erst nach belastbarer
Abnahme und bleibt deshalb bewusst niedriger als die Umsetzung.

Nachtrag 15.09.2026: Die browsernahen Praxis-Module sind nun auch im
Quellcode von den Datenbankmodulen getrennt; ein Regressionstest verhindert
einen direkten Datenbankimport in diesen Modulen. Der aktuelle Stand bestand
825/825 Programmtests, Lint und Typprüfung sowie den isolierten
Produktions-Audit (Build, Neustart, Browser, CSRF, Sprachgrößen- und
Audio-Range-Prüfung). Die Testkopie wurde entfernt und die laufende Ausgabe
blieb unverändert. Der Standardbefehl `node` auf diesem PC ist weiterhin
20.19.0; der Audit nutzte deshalb die geprüfte Node-24-Laufzeit. Das ersetzt
keine Node-Aktualisierung, Handy-, Live-, Telefon-, Vquadrat-, Fremdrechner-
oder Rechtsabnahme; Arbeitsfortschritt 70 % und Nachweisindex 50 % bleiben
unverändert.

Nachtrag 15.09.2026: Der neue `audit:fresh-install` bestand gegen eine
temporäre Kopie des gestageten Stands: `npm ci --offline --ignore-scripts`,
Build und ausschließlich `GET /login` auf einem eigenen Loopback-Port. Dabei
wurde eine fehlende Sperrdatei-Abhängigkeit entdeckt und repariert. Die Kopie
enthält keine `.env`, Praxisdaten oder Zugangsdaten und wird danach entfernt;
der vorhandene lokale npm-Cache ist bewusst eine Eingabe. „Offline“ bezieht
sich nur auf npm, nicht auf eine Betriebssystem-Netzsperre für Projektcode.
Kein Nachweis für einen frischen PC, Upgrade/Rollback oder Echtbetrieb;
Arbeitsfortschritt 70 % und Nachweisindex 50 % bleiben unverändert.

Nachtrag 15.09.2026: Termin-Walk-ins, Umlegen und Wieder-Einsetzen werden
jetzt zusätzlich direkt in PostgreSQL/PGlite pro Ordination gesperrt. Damit
kann eine parallele Bedienung keinen zweiten Termin in denselben Slot schreiben
und eine veraltete Ansicht keinen zwischenzeitlich geänderten Termin
überschreiben. Der PGlite-Test prüft paralleles Anlegen, paralleles Umlegen und
den veralteten Schreibversuch; Typprüfung, Lint und Migrationskompatibilität
bestanden. Der entsprechende Zwei-Verbindungs-PostgreSQL-Test ist in der CI
hinterlegt, konnte wegen des GitHub-Zahlungsblocks aber noch nicht laufen.
Der isolierte Produktionsstart hat die Migrationen `0023` und `0024` ebenfalls angewendet und
Build sowie Neustart bestanden. Browser- und Telefonbuchungen sowie die
Reaktivierung `abgesagt → bestätigt` nutzen dieselbe Sperre; ein isolierter
Buchungsablauf bestätigte genau einen Termin am gewünschten Tag und keinen in
der geschlossenen Vergleichspraxis. Die Audit-Fixtures laden dabei künftig
alle vorhandenen Top-Level-Migrationen.
Bestätigt Vquadrat einen Termin, während die lokale Tafel zeitgleich einen
Konflikt meldet, wird kein zweiter lokaler Termin angelegt: Ein sichtbarer
`Tafelkonflikt`-Hinweis mit der externen Terminnummer bleibt für die
Tierarzthelferin bestehen; Gespräch, Telefonantwort und internes Protokoll
behaupten dann keine lokale Buchung.
Das ist kein Telefon-, Vquadrat- oder echter PostgreSQL-Lasttest;
Arbeitsfortschritt 70 % und Nachweisindex 50 % bleiben unverändert.

Nachtrag 15.09.2026: Dieser Frischinstallations-Audit prüft jetzt zusätzlich
`/sprechen`, `/preise` und den deaktivierten Live-Status vor **und** nach einem
vollständigen Neustart der leeren Testkopie. Alle vier Routen lieferten `200`;
der Live-Status blieb jeweils deaktiviert. Das ist ein stärkerer lokaler
Startnachweis, ersetzt aber weder einen frischen Windows-PC noch Upgrade,
Rollback oder echten Betrieb; Arbeitsfortschritt 70 % und Nachweisindex 50 %
bleiben unverändert.

Nachtrag 15.09.2026: `audit:version-switch` bestand mit zwei tatsächlichen,
temporär gebauten Git-Versionen und ausschließlich erfundenen Daten. Die
Altversion startete mit ihrem passenden Datenstand; die aktuelle Version
übernahm denselben Stand. Danach verweigerte der gebaute Altserver den
angemeldeten Datenzugriff mit `500`; nach Rückkehr zur passenden alten
Sicherung lieferte er wieder `200`. Beide Testkopien wurden entfernt. Der
Audit nutzt absichtlich den vorhandenen lokalen Paketbestand und ist kein
frischer Rechner, veröffentlichter Installer, PostgreSQL- oder Praxisnachweis;
Arbeitsfortschritt 70 % und Nachweisindex 50 % bleiben unverändert.

Nachtrag 15.09.2026: Auf dem aktuellen lokalen Stand bestanden die
Typprüfung und 839/839 Programmtests. Der vollständige isolierte
Homepage-Lauf bestand alle 14 Gruppen: zwei Paket-Hörproben, Desktop und
Mobilansicht, Dialoge/Links, Produktfilm, Training, Korrektur, Gesprächs-
Abbruch, Unterbrechung und die gesperrte Live-Hörprobe. Der isolierte
Produktions-Audit bestand ebenfalls; der ursprüngliche Ausgabeordner blieb
unverändert. Ein zusätzlicher Build-Gate prüft künftig, dass der Browser-Build
keine Datenbank-, `node:crypto`-, `node:fs`- oder Vite-Externalisierungs-
bausteine enthält und bricht bei als Browser-Variable markierten Schlüsseln
vor der Ausgabe ab. `npm audit --omit=dev` meldete keine bekannte
Produktions-Abhängigkeitsschwachstelle. Datenschutz-/Mandantentrennung sowie
Anmeldung und Sprachkorrektur bestanden getrennt mit ausschließlich
synthetischen Daten. Das ersetzt weder den gemeinsamen Handy-/Hörtest noch
Live-, Telefon-, Vquadrat-, Fremdrechner- oder Rechtsabnahme.
Arbeitsfortschritt 70 % und Nachweisindex 50 % bleiben daher unverändert.

Nachtrag 15.09.2026: Der strikt lesende Vquadrat-Bridge-Ende-zu-Ende-Audit
bestand erneut gegen die fest verdrahtete lokale Testkopie. Stammdaten-Sync,
Cache, Echtzeit-Slots und der kontrollierte Connector-Ausfall meldeten Erfolg;
Termin-Schreiben blieb deaktiviert, die Outbox leer. Zusätzlich prüft die
Windows-CI nun produktive Abhängigkeiten bei jedem Lauf. Der Remote-Lauf,
Vquadrat-GUI, Termin-Schreiben und die externe Freigabe bleiben offen;
Arbeitsfortschritt 70 % und Nachweisindex 50 % bleiben unverändert.

Nachtrag 15.09.2026: GitHub Actions enthält zusätzlich einen getrennten
Ubuntu-Lauf für die echte PostgreSQL-Parallelprüfung der Hörkorrekturen und
des Praxiswissens. Er nutzt einen frischen, flüchtigen Container namens
`silvia_audit_test`, nur erfundene Daten und keine Produktions-URL oder
Zugangsdaten. Der Fakten-Audit prüft zwei unabhängige Verbindungen an der
40er-Grenze sowie zwei gleichzeitige Änderungen derselben Regel. Der erste
Remote-Lauf ist noch nicht belegt; deshalb bleiben Arbeitsfortschritt 70 % und
Nachweisindex 50 % unverändert.

Nachtrag 14.09.2026: Der aktuelle Stand bestand lokal die Typprüfung, den
isolierten Homepage-Audit mit zwölf Browser-Szenarien und den isolierten
Datenschutz-Audit mit drei Trennungsfällen. Beide verwendeten ausschließlich
synthetische Daten, entfernten ihre Testkopie und ließen den laufenden
Ausgabeordner unverändert. Öffentliche Kompatibilitäts-Ziele für Chat,
Erkennung oder Ausgabe werden vor dem Netzwerkzugriff gesperrt; lokale IPv6-
Loopback-Ausgabe bleibt zulässig. Die zwei bisher sichtbaren GitHub-Läufe
scheiterten jeweils innerhalb weniger Sekunden noch vor dem ersten
Projektschritt. GitHubs Prüfmeldung nennt fehlgeschlagene Kontozahlungen oder
ein zu niedriges Ausgabenlimit als Ursache. Das ist kein Codebefund; ein
externer Push bestätigt den Repository-Zugang, nicht den CI-Runner. Der
Remote-Nachweis bleibt offen. Arbeitsfortschritt 70 % und Nachweisindex 50 %
bleiben daher unverändert.

Nachtrag 14.09.2026: Beschädigte GZIP-Sicherungen werden vor PGLite mit einem
begrenzten Streaming-Lauf geprüft. Das verhindert einen Parser-Abbruch, bevor
ein Datenordner umbenannt wird; höchstens 1 GiB entpackter Inhalt ist zulässig.
Der vollständige isolierte Backup-/Restore-Audit prüfte einen beschädigten
Trailer, gültige Sicherung, Rückwechsel und unveränderte Alt-Daten mit
synthetischen Tempdaten. Kein echter Datenträger- oder Praxisnachweis;
Arbeitsfortschritt 70 % und Nachweisindex 50 % bleiben unverändert.

Nachtrag 14.09.2026: Beim Ende einer Live-Hörprobe wird die empfangene
Audioausgabe nun pausiert und vom Browser getrennt, zusätzlich zum Mikrofon-
Stopp. Der isolierte Live-Browseraudit erzeugte dafür eine künstliche
Audioverbindung und bestätigte Pause, Trennung und Track-Stopp; der vollständige
Homepage-Audit mit zwölf Fällen blieb grün. Keine Anbieter- oder Praxisdaten;
Arbeitsfortschritt 70 % und Nachweisindex 50 % bleiben unverändert.

Nachtrag 14.09.2026: Der Tagesstart erkennt nun auch versionierte lokale
Änderungen und baut nicht mehr aus einem alten Build. Der Vquadrat-Connector
steht standardmäßig auf nur lesen; produktives Schreiben bleibt mehrfach
gesperrt. Telefonie mit unverschlüsseltem SIP/RTP ist ohne bewussten
Testnetz-Opt-in gesperrt. Lokale CI-Workflows sichern diese Checks künftig in
Silvia, Connector, Telefonie und Betriebsmappe ab; sie sind noch nicht remote
gelaufen. Die fokussierten Tests verwendeten keine Dienste oder Praxisdaten.
Das erhöht den Nachweisindex nicht: Telefon-, Vquadrat- und Fremdrechner-
Abnahme bleiben offen.

Nachtrag 14.09.2026: Tages- und Entwicklungsstart mit dauerhaftem
Praxisdatenspeicher dürfen nicht mehr direkt per HTTP im LAN lauschen. Sie
bleiben auf dem eigenen Rechner; für mobilen Praxiszugriff ist ein
HTTPS-Reverse-Proxy erforderlich. Nur eine ausdrücklich aktivierte
RAM-Vorführung ohne Datenbank darf ins LAN. Die Cloud-Live-Hörprobe bleibt
getrennt davon eine Sandbox. `npm test` (806/806), Typecheck und Lint (0
Fehler) bestanden; die Startregeln wurden mit 23 Tests geprüft. Ohne echten
HTTPS-Proxy, fremden Rechner und Handy-Abnahme bleibt der Nachweisindex bei
50 %.

Nachtrag 14.09.2026: Auch die browserinternen Schreibwege für Wiederherstellung
und Praxissoftware-Synchronisierung verlangen nun dieselbe Herkunft. Der
isolierte Produktionslauf bestätigte für beide Wege bei fremder Origin `403`;
die getrennten Telefon-Gateway-Wege behalten ihren Zugangstoken. Kein echter
Praxissoftware- oder Handy-Nachweis, Index bleibt 50 %.

Nachtrag 14.09.2026: Private Oberflächen und Schnittstellen liefern jetzt
`no-store` sowie eine Suchmaschinen-Sperre; Browser sollen daraus keine
Praxisdaten im Cache behalten. Zusätzlich sind sichere Basis-Header aktiv.
Der isolierte Produktionslauf bestätigte die Header im gebauten Server. Das
ersetzt keinen HTTPS-Proxy- oder Handy-Nachweis; Index bleibt 50 %.

Nachtrag 14.09.2026: Der vollständige lokale Vquadrat-Test gegen die fest
vorgegebene Testkopie ist erneut grün: Nur-Lesen, Stammdaten-Sync, Bridge-Cache,
Live-Slots und ein kontrollierter Connector-Ausfall. Der Test druckt keine
Datensätze, schreibt keine Termine und ruft keine externen Dienste auf. Die
Vquadrat-GUI, produktive Datenbank und fachliche Freigabe bleiben offen; Index
bleibt 50 %.

Nachtrag 14.09.2026: Die Gesprächsoberfläche hat im echten Anruf nur noch
einen roten Hauptknopf „Auflegen“; nur nach einem sichtbaren Mikrofonfehler
wird er zum erneuten „Sprechen“. Training behält „Sprechen“, „Fertig“ und
„Schulung beenden“. `npm run typecheck`, `npm test` (805/805), der isolierte
Homepage-Audit mit zwölf Browser-Szenarien und der isolierte Datenschutz-Audit
mit drei Szenarien bestanden. Die Live-Hörprobe wurde dabei ausschließlich
als RAM-Sandbox gemockt; keine echte Praxisdaten- oder Anbieterabnahme. Der
Nachweisindex bleibt 50 %.

Nachtrag 14.09.2026: Ein beim angemeldeten Sprachkorrekturtest entdecktes
externes Grok-Browserskript ist nun standardmäßig aus. Es kann nur für eine
bewusst freigegebene Plattform-Vorschau beim Build eingeschaltet werden; ein
lokaler Produktionsaufbau sperrt es immer. `npm test` (805/805), Typecheck,
der Homepage-Audit (12 Szenarien), Produktions-Audit und der angemeldete
Sprachkorrektur-Audit bestanden danach. Letzterer bricht jede externe Anfrage
ab und prüft die Korrektur dennoch vollständig mit synthetischen Daten. Kein
Nachweis für externe Anbieter- oder Praxisdatenbetrieb; Index bleibt 50 %.

Nachtrag 14.09.2026: Die lokale Betriebsmappe prüft neue Backup-Zips jetzt auf
einen vollständigen Datenstand, bevor sie Erfolg meldet. Ihre 14-Tage-Rotation
löscht nur geprüfte Datumsbackups; Rettungskopien und defekte Zips bleiben
erhalten. Ein Restore prüft das Zip vor dem Umschalten und stellt bei
Startfehlern Daten und ersetzte Konfiguration automatisch zurück. Zwei neue
Skripte testen ungültiges Backup, gültigen Restore und erzwungenen Startfehler
nur mit Tempdaten. Kein Test gegen echten Datenträger, echte Sicherung oder
fremden Rechner; Index bleibt 50 %.

Nachtrag 14.09.2026: Offline-Pakete prüfen Pflichtkomponenten und sperren
lokale Backup-/Restore-Ordner, bevor ein Zip entsteht. Das Update prüft sein
Zip vor dem Dienststopp, schützt Konfiguration und Daten beim Umschalten und
rollt bei einem roten Starttest automatisch zurück; Telefonie bleibt bei einem
Paket ohne Telefonie unverändert und wird beim fehlerhaften Telefonie-Update
zurückgestellt. Lokale Tests für Backup, Restore, Paketbau, Installer sowie
erfolgreiche und absichtlich fehlschlagende Updatepfade liefen nur mit frischen
Tempdaten grün; jeder Paketbau nutzt einen eigenen Staging-Ordner. GitHub CI
erzwingt künftig zusätzlich Build,
Lint sowie Produktions-, Homepage-, Datenschutz- und Sprach-Audits; die
Remote-Ausführung ist noch nicht nachgewiesen. Index bleibt 50 %.

Nachtrag 14.09.2026: Der lokale Erstinstaller bricht bei fehlendem
Pflichtinstaller/-paket, Kopier-, Pip- oder Smoke-Fehler ab statt eine
scheinbar erfolgreiche Installation zu melden. Bei einer neuen Connector-
Konfiguration setzt er den gleichen geheimen Token in Silvias PMS-Konfiguration
oder stoppt bei einem bestehenden Konflikt ohne Überschreiben. Syntax und die
Platzhalterregel wurden ohne Installation geprüft; vorhandenes Node wird nur
ab 22.12 akzeptiert. Ein echter frischer Windows-PC bleibt als Abnahme offen.
Index bleibt 50 %.

Nachtrag 14.09.2026: Die Cloud-Live-Hörprobe startet nur noch in einer
ausdrücklich gesetzten RAM-Sandbox; ein persistenter Datenspeicher oder eine
`DATABASE_URL` sperren sie vor Mikrofon, WebRTC und Anbieteraufruf. Der
Vquadrat-Cache entfernt bei vollständiger leerer Antwort veraltete Einträge
weich. Die Outbox reserviert fällige Termine atomar (`SKIP LOCKED`), damit
parallele Hintergrundläufe denselben Termin nicht doppelt senden. 73 gezielte
Live-/Bridge-Tests und Typecheck bestanden; der Volltest und isolierte
Homepage-Audit liefen erneut. Das ist kein echter Anbieter-, PostgreSQL-,
Telefon- oder Vquadrat-GUI-Nachweis; der Nachweisindex bleibt 50 %.

Nachtrag 13.09.2026: `npm test`, `npm run typecheck` und der lokale Lauf
`npm run audit:production` liefen grün. Der Nachweis betrifft ausschließlich
synthetische/lokale Tests; keine Aussage über echte Telefonie, Live-Betrieb
oder Praxisdaten. Der Fortschrittsindex bleibt 50 %.

Nachtrag 13.09.2026: Browseranfragen für Erkennung, Antwort und Sprachausgabe
haben 35-Sekunden-Grenzen. Lokale synthetische Tests belegen Abbruch, sichere
Behandlung verspäteter Antworten, Wiederaufnahme nach Erkennungsfehlern,
Sprachstück-Vorladung und Signalübernahme beim Unterbrechen. Commits
`68996c5`, `85d569b`, `4d1d701`, `aa417e3`, `6139b51`, `cffa9e1`;
genauer Umfang in `docs/HOMEPAGE-ABNAHME.md`. Keine Aussage über Rücknahme
serverseitiger Speicherung, Anbieter-Kosten oder echte Sprachqualität.
Gesamtindex unverändert; keine Aktivierung auf Port 8092.

Nachtrag 13.09.2026: Die normale Modelllaufzeit startet nun lokal, auch wenn
ein OpenAI-Schlüssel vorhanden ist. Chat, STT und TTS lehnen zusätzlich jeden
nicht-lokalen Zielhost und jeden Proxy vor `fetch` ab; 58 gezielte Tests prüfen
Cloud-, Umleitungs- und Proxy-Fälle. Die getrennte Live-Hörprobe überträgt nur
einen statisch getesteten fiktiven Prompt und bleibt separat deaktiviert. Das
ist kein Nachweis über Anbieteraufbewahrung oder menschliche Sprachqualität.

Nachtrag 14.09.2026: `npm run audit:privacy` baut eine frische, schlüssellose
Tempkopie und prüft drei lokale Datenschutzfälle: strikte Demo-Kennzeichnung,
Trennung zweier synthetischer Praxen im Antwortpfad sowie deren Trennung im
lokalen STT-Transport. Alle drei Läufe bestanden; die Kopie und die
Testdatenbank wurden danach entfernt, der laufende Ausgabeordner blieb
unverändert. Dies ersetzt keine rechtliche Datenfluss- oder Anbieterabnahme.

Nachtrag 14.09.2026: Die isolierten Homepage- und Datenschutz-Audits beenden
unter Windows jetzt ihren eigenen Testprozessbaum und prüfen anschließend die
Freigabe des Test-Ports. Beide vollständigen Läufe bestanden nacheinander; der
Port war danach frei. Das stabilisiert die Testumgebung, ist aber keine
Produktionsfreigabe.

Nachtrag 14.09.2026: Die aktuelle lokale Qualitätsrunde endete grün:
`npm test` mit 796 bestandenen Tests, `npm run typecheck`, `npm run
audit:homepage` mit 12 Browser-Szenarien, `npm run audit:production` sowie
`npm run audit:privacy` mit drei Datenschutz-Szenarien. Die isolierten
Prüfungen verwendeten nur Testdaten, berührten Port 8092 nicht und ließen den
ursprünglichen Ausgabeordner unverändert. Der Linter hat keine Fehler (53
bewusst offene Hinweise). Das ersetzt weder Telefon-, Stimm-, Live- noch
Praxissoftware-Abnahme; der Nachweisindex bleibt daher 50 %.

Nachtrag 14.09.2026: Der Homepage-Audit prüft zusätzlich einen echten lokalen
Demo-Versand mit sichtbarer Bestätigung und Form-Reset sowie zehn zentrale
interne Header-/Footer-Links per Klick. Der vollständige isolierte Lauf mit 12
Audits bestand; externe oder unerwartete Requests blieben blockiert.

Nachtrag 14.09.2026: Der Hörproben-Audit zeigt beide absichtlich ausgelösten
Ladefehler sichtbar und belegt danach Stoppen sowie erneutes Starten einer
lokalen WAV-Hörprobe. Das ist ein Browser-Nachweis, kein menschlicher Klangtest.

Nachtrag 14.09.2026: Der Produktions-Abhängigkeitscheck meldet keine bekannte
Lücke mehr; die hohe `js-yaml`-Lücke wurde verbindlich auf 4.3.2 geschlossen.
Der Volltest besteht mit 796/796. Der produktive Tagesstart hält bei älterem
Node jetzt mit einer klaren Meldung an; verlangt wird Node 22.12+.

Nachtrag 14.09.2026: Node 24.19-x64 ist im Benutzerbereich dieses PCs
installiert und wird für neu geöffnete Terminals vor dem alten systemweiten
Node 20.19 gewählt. Mit genau dieser Installation bestanden der isolierte
Standalone-Produktionscheck (Anmeldung, Sprechen, Preise und deaktivierter
Live-Status vor und nach Neustart mit 200; 22 Migrationen), Typecheck,
Volltest 796/796, Homepage-Audit mit zwölf Browser-Szenarien, Datenschutz-Audit
mit drei Szenarien sowie der isolierte Auth-/Sprachkorrektur-Audit. Die Audits
erstellten nur frische Testkopien und ließen den ursprünglichen Ausgabeordner
unverändert. Bereits geöffnete Terminals müssen einmal neu gestartet werden.

Nachtrag 14.09.2026: Bei bekannten Anruferdaten fragt die Homepage- und
Gesprächs-Demo nur noch nach der Adresse. Der rote Auflegeknopf ist zu einer
dezenten Textaktion reduziert; das sofortige Beenden von Mikrofon, Antwort und
Audio bleibt im vollständigen Homepage-Audit geprüft. Volltest 796/796 und alle
zwölf Homepage-Audits bestanden danach erneut.

Nachtrag 14.09.2026: Der Bridge-Reader und der PMS-Sync übernehmen rohe
Adapter- oder Datenbankfehler nicht mehr in Logs oder gespeicherte Sync-Läufe.
Zwei gezielte Tests speisen Namen, Telefonnummer und E-Mail als Fehlertext ein
und belegen deren Ausschluss. Das schützt die lokale Protokollierung; die
separate Vquadrat-Gesamtabnahme bleibt offen.

Nachtrag 14.09.2026: Auch Telefon-Gateway und PMS-Hintergrundlauf schreiben
bei Fehlern nur noch technische Statusmeldungen. Rohfehler, Anrufkennung und
gespeicherte Antwortobjekte bleiben aus dem Log. Zwei neue Regressionstests
belegen dies mit synthetischen Kontaktdaten; der vollständige Testlauf umfasst
794 bestandene Tests. Das ersetzt keine externe Datenschutzfreigabe.

Nachtrag 14.09.2026: Eine Vquadrat-Verbindung wird nur noch aktiviert, wenn
Adresse und nichtleerer, ausschließlich serverseitiger Zugangsschlüssel
hinterlegt sind. Eine einzelne Adresse bleibt ohne Netzwerkanfrage lokal
gesperrt; ein gezielter Test prüft genau diesen Fall. Die Zuordnung zu echten
Vquadrat-Feldern, der Anschluss an ein echtes Testsystem und die Fachabnahme
bleiben bewusst offen.

Nachtrag 14.09.2026: Der vollständig lesende Vquadrat-Bridge-Test bestand
auch unter einer geprüften Node-24-x64-Testlaufzeit gegen die getrennt
markierte Testkopie. Stammdaten-Sync, lokaler Cache, freie Slots und ein
kontrollierter Connector-Ausfall blieben grün; Termin-Schreiben war deaktiviert
und die Outbox leer. Das ist keine GUI-, Feld- oder Fachfreigabe.

Nachtrag 14.09.2026: Der getrennte lokale Connector wurde temporär nur auf
`127.0.0.1` gegen die vorhandene, von der Live-Datei verschiedene Testkopie
gestartet. Gesundheitsprüfung, Zugangsschlüssel-Prüfung und eine erfundene
Suche liefen grün; es gab keinen Schreibaufruf. Danach bestand seine gesamte
Testsuite. Der enthaltene Testtermin wird ausschließlich in der Testkopie
angelegt und im selben Ablauf wieder entfernt; eine getrennte reine Zählung
ergab danach null verbliebene Testtermine. Silvia selbst bleibt ohne
eingetragene Connector-Adresse weiterhin abgekoppelt. Eine menschliche
Vquadrat-Oberflächenprüfung und die individuelle Feld-/Freigabeabnahme bleiben
offen; der Nachweisindex bleibt 50 %.

Ein zusätzlicher temporärer Lauf durch Silvias echte Brückenschicht bestätigte
gegen dieselbe Testkopie Gesundheitsprüfung, Zugangsschlüssel und erfundene
leere Suche. Die temporäre Adresse und der Schlüssel wurden danach entfernt;
kein Termin wurde geschrieben. Das ist ein lokaler Integrationsnachweis, keine
Freischaltung der Produktkonfiguration.

Nachtrag 14.09.2026: Die Bridge prüft die Connector-Adresse vor jedem
Netzaufruf. Ungültige, private oder unverschlüsselte externe Ziele bleiben ohne
`fetch`; die Sync-HTTP-Antwort gibt externe Halter-/Patientenschlüssel nicht
mehr aus. Outbox-Lesen und -Ändern sind zusätzlich an Praxis und
Praxissoftware-Kind gebunden, sodass ein fremder Scope weder lesen noch ändern
kann. 55 gezielte Sicherheits- und Bridge-Tests, der vollständige Lauf mit 791
Tests sowie die Typprüfung sind grün. Es wurden keine echten Praxisdaten
verwendet. Der anschließende isolierte Produktionsstart liefert Login, Sprechen,
Preise und Live-Status vor sowie nach Neustart ohne Browserfehler. Vquadrat-GUI,
Terminablauf, externe PMS- und Rechtsfreigabe bleiben offen; der Nachweisindex
bleibt 50 %.

Nachtrag 14.09.2026: Der getrennte Connector akzeptiert nur lokale
Loopback-Verbindungen. Sein normaler Testlauf und die Windows-CI kontaktieren
keine Datenbank; ein Testkopie-Zugriff ist ausdrücklich separat freizugeben.
Produktives Termin-Schreiben verlangt drei voneinander unabhängige lokale
Freigaben. Das senkt das Risiko eines versehentlichen Betriebs, ersetzt aber
keine Vquadrat-GUI-, Feld-, Rechts- oder Produktivfreigabe; der Nachweisindex
bleibt 50 %.

Nachtrag 14.09.2026: Eine ausstehende lokale Tafel-Wiederherstellung wird jetzt
als vollständiges Paket veröffentlicht: Dump und Freigabedaten liegen zuerst in
einem Zwischenordner und werden danach gemeinsam umbenannt. Eine bereits
vollständige Übergabe wird nicht überschrieben; ältere Übergabedateien bleiben
lesbar. Die gezielten Restore-Tests, der Backup/Restore-Audit, Typprüfung und
der vollständige Testlauf mit 786 bestandenen Tests sind grün. Dies ist ein
lokaler Sicherheitsnachweis und ersetzt keinen Stromausfall- oder Mehrrechner-
Betriebstest; der Nachweisindex bleibt 50 %.

Nachtrag 14.09.2026: `npm run audit:postgres-hoer` ist als zusätzlicher,
strikt gesperrter Nachweis vorbereitet, aber auf diesem Rechner noch **nicht
ausgeführt**: Es gibt keine lokale native PostgreSQL-Testdatenbank. Er startet
nur mit einer ausdrücklich gesetzten lokalen `HOER_AUDIT_DATABASE_URL` auf
eine Datenbank namens `silvia_audit_*`; niemals mit der Produkt-URL. Zwei
unabhängige Verbindungen prüfen mit erfundenen Daten beide Reihenfolgen von
Import und Korrektur an der 2000er-Grenze, in einem eigenen Zufallsschema und
mit anschließender Entfernung von Schema und Testdatei. Bis zum echten
Testlauf erhöht das den Nachweisindex nicht. Für verpflichtende CI-Läufe setzt
`HOER_AUDIT_REQUIRED=1`; dann führt eine fehlende oder unzulässige URL zu Exit 1
statt zum sicheren lokalen `SKIP`. Ohne diese Variable bleibt `SKIP` erhalten.

Nachtrag 13.09.2026: Film-Sprungfunktion und begrenzte Audio-Teilauslieferung
lokal abgenommen, Commit `e1ca190`; Nachweise in `docs/HOMEPAGE-ABNAHME.md`.
Ein kontrollierter Sprung auf Filmsekunde 6 startet die Aufnahme bei 2,803 s.
Keine Aktivierung in der laufenden Homepage, keine Gesamtfreigabe und keine
Änderung des Fortschrittsindex allein aufgrund dieser Teilabnahme.

Historischer Datenverlust bei Demo-Praxiswissen (Stand `eba5256`): Zwei getrennte
Store-Instanzen mit gemeinsamem simuliertem Browserspeicher zeigen, dass eine
Korrektur aus einem veralteten zweiten Tab eine zuvor im ersten Tab ergänzte
Regel überschreibt. Historischer Nachweis im Commit `63b3d45`:
`scripts/trained-facts-multitab-repro.mts`;
Exit 0 bedeutet hier **Fehler reproduziert**, nicht Abnahme bestanden.
Der lokale Speicherumbau ist inzwischen mit Migration, gleichzeitigen
Schreibvorgängen, Konflikten und Neuladen browsergeprüft (Ergänzung unten).
Noch nicht in der laufenden Homepage aktiviert; keine gemischte Alt-/Neuversion-
Freigabe. Die bisherigen Einzeltab-Nachweise bleiben auf ihren Umfang beschränkt.

Ergänzende Homepage-Abnahme: Sprachkorrektur mit Speicherfehler und Rückwechsel
bestanden. Gelernte Demo-Begrüßung wird jetzt nach Reload im neuen Gespräch
übernommen; sichtbarer Text, echter lokaler TTS-Pfad und vollständige Wiedergabe
beider Audioabschnitte geprüft. Menschliche Klang-/Gesprächsabnahme weiterhin
offen. Nachweise und genaue Grenzen: `docs/HOMEPAGE-ABNAHME.md`.
Beide Hörproben melden inzwischen auch Fehler vor vollständiger Interaktivität;
Neuladen, paralleles Nachladen und Stoppen beim Seitenwechsel sind lokal geprüft.
Produktfilm: Tonfortsetzung nach Pause repariert; Start, Pause, Fortsetzen,
vollständiges 32-Sekunden-Ende und Neustart lokal geprüft. Kein Ersatz für
die weiterhin offene menschliche Gesprächs- und Live-Abnahme.
Praxiswissen: Regel über die Homepage gespeichert und korrigiert; nach
Reload im neuen Gespräch sichtbar richtig beantwortet. Fachfremde Frage
bleibt getrennt. Sechzehn Helfertests und Typecheck bestanden; klare
Gegenpaare derselben Regel einschließlich „erlaubt“/„verboten“ führen zu einer Rückfrage. Automatische
Priorisierung, Bereinigung und weitergehende semantische Auflösung bleiben offen.
Solche Gegenpaare werden auch nicht in den internen Modelltext übernommen.
Speicherfehler beim Anlegen und Korrigieren von Demo-Praxiswissen werden
abgefangen: Eingabe/alte Regel bleiben erhalten, Wiederholung und Reload
lokal geprüft. Dauerhafter Schreibfehler zusätzlich mit zwei Storetests geprüft.

Neuer Regressionserfolg: Reine Nichtsprachmarker werden im lokalen STT-Dienst
zu leerem Text. `artifacts/homepage-correction-marker-regression-20260912.log`
zeigt nur einen Benutzerbeitrag statt zusätzlicher `[Musik]`-Einträge.
Der tatsächliche Öffnungszeiten-Beitrag lässt sich korrigieren; Speicherfehler,
anderer Wiederholungswert und Reload bestehen bei unveränderten übrigen
Demodaten und POSTs (7 → 7). Dieser Lauf ersetzt den unten genannten
Folgeturn-Nachweis für die Korrektur. Wie/Wir und echte Sprachqualität bleiben offen.

Teilabnahme Gesprächskorrektur bestanden: `scripts/homepage-correction-audit.mjs`
prüft den Homepage-Korrekturweg in einer isoliert gebauten Version mit lokalem
synthetischem STT/TTS. Beleg: `artifacts/homepage-correction-audit.raw.20260912-final-main.log`.
„Wie sind die Öffnungszeiten?“ wird sichtbar berichtigt; ein erzwungener
Speicherfehler erhält Original und Eingabe. Wiederholung mit dem anderen Text
„Wann ist die Ordination geöffnet?“ speichert tatsächlich den neuen Wert,
der nach Reload erhalten bleibt. Weitere lokale Demodaten bleiben identisch;
keine neuen POSTs im geprüften Korrektur-/Wiederholungsfenster (21 → 21).
Gilt für kurze Homepage-Demokorrekturen bis 40 Zeichen, nicht für automatische
Terminberichtigung oder vollständige Praxis-/Sprachabnahme. Das Diagnosescript
endet weiterhin absichtlich mit Exit 2. „Wie/Wir“ und zusätzliche „[Musik]“-Erkennung
bei Folgeaufnahmen bleiben Qualitätsprobleme; die korrigierte letzte Zeile war
ein solcher Folgeturn, nicht die ursprüngliche Öffnungszeitenfrage.
Frühere Vite-Läufe scheiterten am automatischen Neuladen; sie sind kein
Nachweis eines dauerhaften Produktfehlers. Typecheck und fünf gezielte Tests
bestanden separat; keine Freischaltung oder Änderung der laufenden Homepage.

Technischer Meilenstein: Der synthetische lokale Sprachablauf wurde jetzt
durch die Homepage-Testkopie verfolgt: Browseraufnahme → STT → passende
lokale Öffnungszeiten-Antwort → TTS → vollständig abgespieltes Audio.
Siehe `audio-stt-homepage-local-chain-20260912.log` und präzise Einordnung in
der Datenschutz-Abnahme. Diagnose-Exit 2 bleibt: Wie/Wir-Erkennungsfehler,
echte Stimme/Akzent und vollständige Trainings-/Gesprächsqualität offen.
Kein Wechsel auf die nächste Gesamtstufe allein durch diesen Einzelfall.

Kontakt-Abnahme erweitert: Telefonnummer und E-Mail bleiben nach weiteren
Bestätigungen auf derselben Karte. SMS-, WhatsApp- und E-Mail-Empfänger vor
und nach Reload sind exakt geprüft (nur Links gelesen, nichts versendet).
Beleg: `artifacts/appointment-date-audit-final-run-20260912.log`, Exit 0.
Der offene Link-/E-Mail-Hinweis im folgenden früheren Zwischenstand ist damit
für diesen synthetischen Ablauf erledigt. Die abschließende Wiederverwendung
des bestehenden Namensparsers statt einer separaten Regex wurde durch zehn
Board-Tests und Typecheck geprüft, nicht erneut im Browser.

Weiterer bestandener Teiltest: Nach Buchung, Öffnungszeitenfrage, korrigierter
Handynummer und erneuter Bestätigung bleibt die neue Nummer in derselben
Patientenkarte, ohne zusätzlichen Termin. Beleg:
`artifacts/appointment-date-audit-contact-final-20260912.log` (Exit 0).
Die Zielnummer des SMS-/WhatsApp-Bestätigungslinks und E-Mail-Korrektur im
vollständigen UI-Ablauf bleiben offen; neun fokussierte Board-Tests und
Typecheck bestanden. Kein Anstieg der groben Gesamtstufe allein daraus.

Teilabnahme nach Terminbestätigung: Der erweiterte synthetische Gesprächstest
mit „morgen statt heute“ und anschließender Öffnungszeitenfrage besteht nach
dem Fix gegen Patientenanlage bei Info-Antworten: zwei ursprüngliche Patienten-IDs,
genau ein Termin, geprüfte Patientenfelder der zweiten Praxis unverändert.
Beleg: `artifacts/appointment-date-audit-final2-20260912.log` (UI/DB, Exit 0).
Die konkreten Bestätigungs-, Korrektur- und Auskunftsantworten wurden zusätzlich
am gespeicherten Log geprüft. 22 gezielte Tests bestehen; die abschließende
Einschränkung auf vollständige Berichtigungsformulierungen wurde damit geprüft,
nicht erneut im Browser. Eine erklärte manuelle Änderung auf der Tafel ist kein automatisch
verschobener Termin. Dafür wären zusätzlich Wunschdatum/-zeit, Verfügbarkeit,
Bestätigung und die Änderung desselben Termins zu prüfen; Auskünfte, Absagen,
Notfälle und neue Buchungswünsche dürfen nicht als Datumsberichtigung abgefangen
werden. Der Fortschrittsindex bleibt unverändert.

Konservative Managementbewertung, keine gemessene Fehlerfreiheit und keine
Schätzung der verbleibenden Arbeitszeit. Fünf Bereiche zählen jeweils 20 %.
Stufen: 0 = ohne Nachweis, 25 = teilweise umgesetzt/dokumentiert,
50 = umgesetzt mit Teilprüfungen, 75 = Kernabläufe vollständig lokal geprüft,
100 = alle vereinbarten Abnahmen und Freigaben dieses Bereichs belegt.
Bewertungen steigen nur mit konkreter Evidenz und können bei neuen Fehlern sinken.

| Bereich | Stand | Noch wesentlich offen |
|---|---:|---|
| Homepage und Pakete | 50 % | vollständige Inhalts-/Bedienprüfung, Leistungs- und Preisfreigabe |
| Praxiswissen und Sprachtraining | 50 % | reale Sprachqualität und weitere Fehlerfälle |
| Live-Gespräch | 50 % | echter Provider-Hörtest, Unterbrechung, öffentliche Betriebsabsicherung |
| Datentrennung und Datenschutz | 50 % | vollständige Datenfluss- und Betriebsabnahme weiter offen; externe Chat-/STT-/TTS-Ziele und Proxys vor Versand blockiert |
| Betrieb und Praxisanbindung | 50 % | fremder Windows-Rechner, Anwendungs-Downgrade, reale Praxissoftware-Abnahme |

Rechnung: (50 + 50 + 50 + 50 + 50) / 5 = 50 %.

Aktuelle Sicherheits- und Laufzeitnachweise:
[Zwischenabnahme vom 12. September](DATENSCHUTZ-ABNAHME-2026-09-12.md).
Lokale Spracherkennung, Antwortmodell und Ausgabe sind technisch getestet,
aber Gesprächsqualität und Antwortzeit nicht akzeptiert. Die Cloud-Live-Demo
ist ausschließlich für erfundene Inhalte vorgesehen. Der laufende Prozess
auf 8092 wurde nicht neu gestartet; sein Ausgabeordner wurde versehentlich
neu gebaut. Vor gemeinsamer Nutzung bleibt eine kontrollierte Betriebsabnahme
erforderlich. Die neuen Einzeltests erhöhen den Gesamtindex deshalb nicht.
Fortschritt 45 → 50: Betrieb steigt auf die Stufe „umgesetzt mit Teilprüfungen“.
Der allein kopierte Programmaufbau startet außerhalb des Projekts, lädt lokale
JavaScript-/CSS-Dateien und startet mit unverändertem Migrationsstand erneut.
Zusammen mit dem geprüften Altbackup-Upgrade und den Restore-Fehlerfällen
belegt das einen eigenständigen lokalen Betrieb. Fremdrechner, Downgrade und
Praxissoftware-Anbindung bleiben offen; daher keine höhere Betriebsstufe.
Fortschritt 40 → 45: `scripts/practice-isolation-audit.mjs` besteht mit zwei
synthetischen Praxen, regulären UI-Anmeldungen und echten Server-Anfragen.
Praxis B sieht den Hinweis von A nicht, kann eigene Hinweise verwalten und
kann A weder durch fremde Änderungs- noch Löschanfragen verändern. Abschließende
Datenbankprüfung bestätigt A unverändert. Der Nachweis gilt für Praxiswissen,
nicht pauschal für sämtliche Praxisdaten oder rechtliche Konformität.
Für den zusätzlichen Commit-Fall kann derselbe Audit mit
`FACTS_AUDIT_AFTER_COMMIT=1` gestartet werden: Der erste eigene Fakten-POST
wird echt an den lokalen Server gesendet; nur wenn HTTP-Antwort und
deserialisiertes Ergebnis `ok: true` melden, wird seine ID gemerkt und danach
der kontrollierte 503 ausgelöst. Der normale Wiederholungs-Klick lässt genau
eine Zeile mit derselben ID zurück. Ohne diese Umgebungsvariable bleibt der
bisherige Standardlauf unverändert.
Offene Sicherheits- oder Rechtsfreigaben verhindern einen Produktionsstart
unabhängig vom Prozentwert. Die Detailtabelle darunter bleibt maßgeblich.

| Bereich | Tatsächlicher Status | Beweis | Nächster fehlender Nachweis |
|---|---|---|---|
| Termin im Gespräch | Sichtbarer Texteingabe-Ablauf mit synthetischer Anmeldung geprüft: „morgen“ und „Ja, passt“ ergeben genau einen Termin am Wunschtag; letzte Antwort nennt die gespeicherte Uhrzeit; keine zusätzliche Patientenkarte. Der isolierte Ablauf prüft zusätzlich: ein konkreter Uhrzeitwunsch erzeugt sichtbar einen `Terminwunsch` für die Tierarzthelferin, aber keinen Termin-Slot; eine spätere Uhrzeitänderung lässt den bestehenden Termin unverändert statt einen zweiten anzulegen, und derselbe Termin wird nach vollständigem Server-Neustart über seine Bestätigungs-ID wiedergefunden. Zwei parallele synthetische Versuche für denselben festen Test-Slot ergeben genau eine Buchung und eine sichtbare Konfliktantwort; es entsteht keine zweite Patientenkarte. Kontakt-Empfang wird inzwischen ohne ungeprüfte Speicherzusage bestätigt (separater Test). | `npm run audit:appointment` (isoliert), `scripts/appointment-date-audit.mjs` (Temp-Pfad; optional `--ui`), `artifacts/appointment-ui-identity-20260912.log`, `src/lib/alma/ask-alma.test.ts` | Sprachaufnahme durch denselben Ablauf |
| Praxiswissen-Persistenz | Anlegen und Wiederholung geprüft; auch UI-Zusammenführen nach verlorener erfolgreicher Speicherantwort erhält Original/Edittext und Quell-ID, entfernt Duplikat und lässt A-Kontrollhinweis unverändert. Ein strikter PostgreSQL-Audit für zwei unabhängige Verbindungen an der 40er-Grenze und bei gleichzeitiger Änderung ist in CI vorbereitet | `scripts/practice-isolation-audit.mjs`, `scripts/auth-speech-retry-audit.mjs` mit `PRACTICE_MERGE_AUDIT=1`, `src/lib/practice/facts-replace.test.ts`, `scripts/postgres-practice-facts-parallel-audit.ts` | Ersten isolierten Remote-Lauf belegen; darüber hinaus echte Mikrofon-/Akzenttests |
| Separates Sprachtraining | lokal implementiert, Erkennungsqualität offen | `src/lib/alma/train.test.ts`, `src/lib/alma/speech-scope.test.ts`, `scripts/demo-speech-audit.mjs` | echte Mikrofon-/Akzent-/Worttests |
| Tenant-Isolation | Praxiswissen, Sprachkorrekturen, Patientensuche/-abruf/-änderung und Terminstatus/-verschiebung mit zwei authentifizierten Testpraxen geprüft; keine Gesamtgarantie | `scripts/practice-isolation-audit.mjs` (inkl. Patienten-/Termin-Modi), `scripts/auth-speech-retry-audit.mjs`, `src/lib/auth/gate-identity.test.ts` | weitere Praxisdaten-Zugriffspfade Ende-zu-Ende prüfen |
| Korrekturfehler / Retry | Demo- und authentifizierte Sprachkorrektur, Praxiswissen-Anlegen und UI-Merge mit Wiederholung geprüft; nach kontrolliertem 503 bleiben Original und Edittext erhalten; fremde `practiceId`/`userId` werden ignoriert, Cookie-freier Request und `demo:true` abgelehnt; Audio simuliert | `npm run audit:auth-speech` (isoliert, optionaler Merge-Modus), `scripts/training-retry-audit.mjs`, `scripts/practice-isolation-audit.mjs` | Gleichzeitige Änderungen sowie echte Mikrofon-/Akzenttests |
| Paketdarstellung | zwei Varianten; unbelegte Preis-/Testfrist-, EU-/AVV- und Löschzusagen in Hero, Datenschutzbereich und Demo-Dialog entfernt; Layout/Hörproben bei 320/1440 geprüft | `src/components/silvia-varianten.tsx`, `scripts/homepage-acceptance-audit.mjs`, `docs/SILVIA-SPEZIFIKATION.md` | übrige Inhalte, Links und Dialoge vollständig prüfen; Preis-/Leistungsfreigabe offen |
| Echtes Live | lokal implementiert, standardmäßig deaktiviert; persistente Startsperre bei ungeklärtem Abschluss auch nach simuliertem Neustart geprüft; zwei getrennte lokale Prozesse können nicht gleichzeitig starten. Oberfläche prüft vollständige Freigabe und verlangt eine nicht vorausgewählte Bestätigung ausschließlich erfundener Inhalte vor Mikrofonzugriff. Anbieter und Audioverbindung dabei simuliert | `src/lib/live-demo.server.test.ts` (25/25), `scripts/live-demo-audit.mjs` (isolierter Browserlauf Exit 0), `docs/SILVIA_LIVE_DEMO.md` | echter genehmigter Hör-/Unterbrechungstest; Kostenobergrenze, Anbieter-Aufbewahrung und Akzent abnehmen. Die Bestätigung beweist nicht, was nachher gesprochen wird. Stoppanforderung nach 120 Sekunden ist keine garantierte Anbieterbeendigung |
| Backup / Restore | echter lokaler Dump/Restore mit synthetischer Praxis, Hinweis und Termin geprüft; beschädigtes GZIP, vorhandene Rettungssicherung, verweigertes Umbenennen/Anlegen und fehlgeschlagener Rückwechsel geprüft; alte Datensätze bleiben erhalten, unsichere Zugriffe auch nach Neustart gesperrt, Schreiblock nach Erfolg geprüft. Ein teilweiser synthetischer Restore-Ordner mit anschließendem simulierten `ENOSPC` wird entfernt; die alte Tafel öffnet danach unverändert. Scheitert nur der finale Sicherungsstempel, wird der alte Stempel soweit möglich zurückgenommen und kein Download als Erfolg geliefert. Der Audit läuft in einer getrennten Kopie, damit Vite-Arbeitsdateien den echten Datenordner nicht berühren. | `npm run audit:backup-restore` (isoliert), `scripts/backup-restore-audit.mjs`, `scripts/backup-restore-subprocess.mjs`, `src/lib/practice/desk-backup-dump.server.test.ts`; fokussierte Tests und Typecheck Exit 0 | Die Bedienanleitung liegt unter `docs/BETRIEBSANLEITUNG-SICHERUNG.md`; große Sicherungen und die angeleitete manuelle Wiederherstellung sind trotzdem noch nicht abgenommen. Kein echter voller Datenträger oder Stromausfall: der Teilordner- und Stempeltest simuliert nur gezielte Fehler; bei weiter unbeschreibbarer Platte ist die Stempel-Rücknahme ausdrücklich nur bestmöglich. |
| Deployment / Betrieb | lokaler Node-Build samt PGLite-Dateien und isoliertem Start geprüft; saubere Offline-Installation mit vier Kernrouten vor/nach Neustart sowie synthetischer Alt-/Neubau mit gesperrtem Rückwechsel und passender Sicherung bestehen. Der Chromium-Release-Gate startet seinen Server mit genau der prüfenden Node-Laufzeit und bestätigt Homepage, Anmeldung, Registrierung und Preise ohne externe Browseranfrage. | `scripts/build-local-node-server.mjs`, `scripts/production-smoke-audit.mjs`, `scripts/fresh-install-audit.mjs`, `scripts/version-switch-audit.mjs`, `scripts/start-desk.test.mjs`, `playwright.release-gate.config.ts`, `scripts/release-gate-config.test.mjs` | Installation auf frischem Rechner sowie tatsächlichen Upgrade und Rollback protokollieren |
| Datenschutz / Löschung | Löschroutine mit aktuellem Datenbankschema und zwei synthetischen Praxen geprüft; Grenzzeitpunkt und nicht betroffene Daten bleiben erhalten. Normale Modelllaufzeit ist lokal voreingestellt und blockiert externe Chat-/STT-/TTS-Ziele vor dem Versand; die Cloud-Live-Demo hat einen statischen fiktiven Prompt. Externe Rechtsfreigabe offen | `src/lib/practice/retention.ts`, `src/lib/practice/retention.integration.test.ts`, `src/lib/practice/desk-legal.test.ts`, `src/lib/alma/llm-runtime-guard.test.ts`, `src/lib/live-demo.server.test.ts` | Sicherungs-/Anbieteraufbewahrung sowie Datenfluss, Anbieterbedingungen und AVV durch zuständige externe Stelle freigeben; nicht automatisch erfüllt |
| Praxissoftware-Bridge | Adapter-/Spiegelpfad dokumentiert; der lesende lokale Vquadrat-Testkopie-Audit bestätigt 11/11 erwartete Tabellen und Spalten ohne Datensatzausgabe oder Änderung. Der echte Connector akzeptiert nur Loopback; sein Standardtest und die Windows-CI berühren keine Datenbank. Ein Testkopie-Integrationstest ist separat opt-in. Produktives Termin-Schreiben verlangt drei unabhängige lokale Freigaben. Der vollständige lesende Pfad Testkopie → Connector → flüchtige Silvia-Bridge besteht für Stammdaten-Sync, Cache, Echtzeit-Slots und leere Outbox. Nach kontrolliertem Connector-Ausfall bleibt der frische Cache lesbar, Slots sind gesperrt, Schreibaufrufe bleiben `0` und die Outbox leer; die Ausgabe enthält nur Status, Mengen und Prüfergebnisse. GUI, Termin, vollständiger Rollback und externe PMS-Freigabe offen | `docs/PMS-BRIDGE.md`, `src/lib/practice/bridge/*.test.ts`, `scripts/vquadrat-schema-read-audit.mjs`, `scripts/connector-readonly-diagnose.mjs`, `scripts/connector-owner-patient-audit.mjs`, `scripts/vquadrat-bridge-e2e-audit.mjs` (lokal, Exit 0) | GUI-/Terminabnahme, weitere Fehlerfälle und separate Freigabe durch PMS-/Rechtspartner |

## Drei nächste echte lokale Maßnahmen

Sprachkorrektur-Eingaben (12.09.2026): Der Server lehnt mehr als 40 Zeichen,
Leertexte, falsche Datentypen und ungültige Wiederholungs-IDs ab, statt Texte
still abzuschneiden. Gültige 40 Zeichen bleiben unverändert. Zwei gezielte
Validierungstests und Typecheck bestehen. Ungültige Eingaben erreichen laut
geprüfter Handler-Reihenfolge weder Sitzungssuche noch Datenbankschreiben;
keine zusätzliche Browser-/Datenbank-Abnahme für diese Änderung.

Altimport-Sprachkorrekturen (12.09.2026): Migration `0022` begrenzt den
Import einschließlich bestehender Korrekturen auf 2000 pro Ordination.
Bei Überlauf werden weder Teilimporte noch Abschlussmarker gespeichert;
die Quelle bleibt erhalten. Die Sperre nutzt dieselbe Praxiszeile wie
normale Korrekturen. Ein Dateilimit von 2 MiB begrenzt bereits das Einlesen.
17 gezielte Tests und Typecheck bestehen; der anschließend erweiterte
Zwei-Praxen-Überlauftest besteht separat. Wiederholung nach freier Kapazität
importiert vollständig, erneuter Aufruf dupliziert nichts. Lokale PGLite-
Nachweise, keine Abnahme paralleler unabhängiger PostgreSQL-Verbindungen.
Die früher als offen genannte Altimport-Mengenbegrenzung ist damit lokal
abgesichert. Bestehende übergroße Datenbestände werden nicht gelöscht.
Ergänzung: 18 Hörkorrekturtests bestehen einschließlich gemischtem Altimport
und normaler Korrektur am letzten freien Platz. Beide tatsächlich beobachteten
SQL-Startreihenfolgen halten 2000 Einträge ein; nur der erfolgreiche Import
setzt den Abschlussmarker. Beide Aufrufe sind an der SQL-Grenze gleichzeitig
offen, PGlite führt sie über eine Verbindung aus. Unabhängige PostgreSQL-
Verbindungen bleiben ausdrücklich ungeprüft.

Teilabsicherung Versionswechsel (12.09.2026): Unbekannte angewendete
Migrationen sperren den lokalen Datenzugriff vor weiteren Schemaänderungen;
neun Planertests und `scripts/migration-compatibility-audit.mjs` bestehen.
Der Audit prüft zweimalige Ablehnung und unveränderte synthetische Daten
über den Produktionshelfer `getSql`, zunächst im Arbeitsspeicher und zusätzlich
nach getrennten Prozessstarts mit einer eigenen temporären PGLite-Datei.
Schema, Migrationsliste und Kontrollwert bleiben dort nach beiden Ablehnungen
unverändert.
Zusätzlich besteht das synthetische Upgrade von der ersten auf alle 23
aktuellen Migrationen; ursprünglicher Zeitstempel und Kontrollwert bleiben
erhalten, wiederholter Zugriff verändert die Migrationsnachweise nicht.
Typecheck bestanden. Kein vollständiger Anwendungs-Downgrade und keine
PostgreSQL-Betriebsabnahme: siehe [Versionswechsel](VERSIONSWECHSEL.md).
Gesamtindex unverändert; laufende Seite nicht neu gestartet.

Ergänzung Homepage/Pakete (11.09.2026): Preis- und Hörprobenseite verwenden
dieselben zwei Paketdefinitionen „Silvia Premium“ und „Silvia Live“. Alte
Dreierpakete und feste Akte-Aufpreise wurden aus den betreffenden Seiten und
Datenexporten entfernt; Beträge und Vertragsbedingungen bleiben abzustimmen.
Live bleibt öffentlich als in Vorbereitung gekennzeichnet. Der neue
`scripts/homepage-controls-audit.mjs` prüft 14 Desktop- und 13 mobile lokale
Navigationsziele, einen FAQ-Wechsel, Pflichtfelder ohne echte Formularsendung,
Dialoge und mobiles Menü; finaler Lauf Exit 0. Die Preisseite ist bei 320/1440
Pixeln ohne Überlauf geprüft und visuell kontrolliert. Das ist keine Prüfung
aller Inhalte oder aller Buttons; Kundenreferenzen benötigen noch Bestätigung.

Ergänzung Sprachkorrektur-Sicherung (11.09.2026): Migration `0015` speichert
Korrekturen in der Praxisdatenbank. Typecheck und 11 Hörlog-Tests bestanden;
der atomare Altimport ist auf Fehler, parallele Erstaufrufe, unbekannte Praxis
und ausbleibenden Wiederimport nach Löschung geprüft. Restore-Audit bestätigt
Quellkorrekturen statt fremder Zielkorrekturen und die Migration eines alten
Backups ohne Korrekturtabelle. Der authentifizierte Browser-Retry endet mit
genau einem UI-B-Datenbankeintrag und unverändertem A-Eintrag. Der ergänzende
lokale HTTP-Audit sendet den aufgezeichneten ServerFn-Request mit fremder
Praxis-/User-ID, prüft die echte Antwort und bestätigt: Mutation nur in B,
cookie-frei und `demo:true` ohne Speicherung; A bleibt unverändert und B
enthält exakt die erwarteten Zeilen (Audit Exit 0). Reale Sprache,
Cloud-Datenbankbetrieb und sämtliche übrigen Datenpfade sind damit nicht
pauschal abgenommen.

Ergänzung Wiederholung nach Speicherbestätigung (11.09.2026): Migration `0016`
ergänzt eine optionale, je Praxis eindeutige Vorgangsnummer. Die Oberfläche
verwendet eine zufällige UUID ohne Gesprächsinhalt; derselbe Korrekturversuch
behält sie, ein geänderter Vorgang erhält eine neue. Identische Wiederholungen
speichern nicht doppelt, widersprüchliche Inhalte unter derselben Nummer werden
abgelehnt. Der Browser-Audit mit `SPEECH_AUDIT_AFTER_COMMIT=1` prüft zuerst die
echte erfolgreiche Serverantwort, ersetzt sie durch einen kontrollierten 503
und bestätigt nach dem normalen UI-Retry exakt eine Korrekturzeile. Audio bleibt
simuliert. 16 gezielte Tests, 656 Gesamttests, Typecheck, lokaler Build, Start-
und Restore-Audit bestanden. Altschnittstellen ohne Vorgangsnummer haben diese
Wiederholungsgarantie nicht; Praxiswissen-Anlegen mit Wiederholung ist lokal
belegt. Ergänzend sind identische Server-Anfragen beim Ändern und Zusammenführen
geprüft: `FACTS_AUDIT_REPLACE_RETRY=1` reproduzierte zunächst „Hinweis nicht
gefunden“. Die atomare Ersetzung bewahrt jetzt die bearbeitete Quell-ID und
entfernt gleichlautende Hinweise nur derselben Praxis. Der echte Server-Audit
prüft Wiederholung und finalen Zeilenbestand; drei Datenbanktests verwenden
denselben Produktionshelper und belegen Merge/Retry, fremde/fehlende Quelle
und vollständigen Rollback bei einem erzwungenen Update-Fehler. Allgemeine
Parallelität ist damit noch nicht vollständig abgenommen.

Ergänzung UI-Merge (11.09.2026): `PRACTICE_MERGE_AUDIT=1 node
scripts/auth-speech-retry-audit.mjs` besteht mit Exit 0. Die echte
Wissenstraining-Oberfläche legt den Quellhinweis an. Nach erfolgreicher,
dekodierter Merge-Speicherantwort erhält der Browser kontrolliert einen 503.
Originalzeile und Edittext bleiben erhalten; der normale Korrektur-Klick
wiederholt die Aktion. Die bei der Anlage erhaltene Quell-ID stimmt mit der
ersten Merge-Antwort und dem abschließenden Datenbankeintrag überein.
Der doppelte Zielhinweis ist entfernt, der Kontrollhinweis von Praxis A
unverändert. Log: `artifacts/auth-speech-practice-merge-audit.log`.
Audio und Modellantwort sind simuliert; dieser Nachweis ersetzt weder
reale Sprachtests noch Tests gleichzeitig eintreffender Änderungen.

Ergänzung gleichzeitige Neuanlage (11.09.2026): Der Test der bisherigen
getrennten Prüfung reproduziert 41 Hinweise bei 39 vorhandenen und zwei
gleichzeitigen Neuanlagen. Migration `0017` bündelt Neuanlage, Duplikatprüfung
und 40er-Grenze in einer Datenbankfunktion mit Praxiszeilen-Sperre.
Fünf lokale Tests prüfen den alten Fehler, identische parallele Neuanlagen,
39 plus zwei verschiedene Anfragen, Wiederholung bei tatsächlich 40 Hinweisen
und getrennte Praxen. Der Funktionsaufruf gilt ausdrücklich als Schreibzugriff
und bleibt hinter Anzeige- und Sicherungssperren.
Die Browser-/Server-Trennung ist korrigiert: Die Kennung entsteht nur im
Server-Handler; der reine Datenbankhelfer importiert keine Server-Laufzeit.
664 Gesamttests, Typecheck und lokaler Build bestanden. Der frische
Browserlauf `artifacts/auth-speech-practice-merge-audit-run-20260911-2347.log`
bestätigt echte Neuanlage und Merge-Wiederholung samt Datenbank-Endzustand.
Die parallelen Tests nutzen PGlite. Mehrere unabhängige Cloud-Verbindungen
bleiben separat abzunehmen.
Bestehende Altdubletten werden durch diese Migration nicht gelöscht.

Ergänzung gemeinsamer Schreibschutz (11.09.2026): Migration `0018` bringt
auch Zusammenführen unter dieselbe Praxiszeilen-Sperre. Die Reihenfolge ist
Praxis, Quellhinweis, Duplikate entfernen, Quelle aktualisieren; alle Schritte
gehören zu derselben Transaktion. Fehlende oder fremde Quellen ändern nichts,
ein erzwungener Update-Fehler stellt auch entfernte Duplikate wieder her.
Beide Datenbankfunktionen gelten im Anzeige-/Sicherungsschutz als Schreibzugriff.
Neun gezielte Tests einschließlich gemischtem Anlegen/Zusammenführen und
665 Gesamttests bestehen, ebenso Typecheck, lokaler Build und der echte
UI-Merge-Retry-Audit. Dessen Log liegt unter
`%TEMP%/silvia-practice-merge-audit-e651d907-b9a2-4cf3-9806-a852a4556acc.log`.
Der gemischte Paralleltest verwendet eine lokale PGlite-Verbindung und ist
kein Nachweis für mehrere unabhängige PostgreSQL-Verbindungen.

Ergänzung Sprachkorrektur-Grenze (12.09.2026): Der lokale PGlite-Test mit
1.999 vorhandenen Zeilen und zwei unterschiedlichen gleichzeitigen Vorgängen
endet bei genau 2.000 Zeilen; genau eine Neuanlage gelingt. Identische
Wiederholungen am Limit bleiben erfolgreich, widersprüchliche Inhalte unter
derselben Vorgangsnummer werden abgelehnt. Das ist kein Cloud-Paralleltest.
Die damals mögliche gleichzeitige Zählprüfung verschiedener PostgreSQL-Verbindungen
wird inzwischen durch Migration `0019_hoer_korrektur_atomic.sql` abgesichert:
Praxiszeile sperren, Wiederholung prüfen, zählen und speichern in einer
Datenbankfunktion. Der Betrieb mit mehreren echten PostgreSQL-Verbindungen
bleibt separat abzunehmen.
Der frühere Importfall 1.999 vorhandene plus zwei gültige Alteinträge ist
jetzt atomar gesperrt: Import, Abschlussmarker und Quelldatei bleiben
unverändert. Löst der Fall beim Speichern einer Hörkorrektur aus, zeigt die
Oberfläche den Kapazitätsgrund statt einer allgemeinen Fehlermeldung. Die
Browserabnahme dieses Hinweises bleibt Teil der Schlussabnahme; vorhandene
Altdaten werden nicht stillschweigend gelöscht.
Nachweis: `src/lib/alma/hoer-log.test.ts`,
`%TEMP%/silvia-speech-cap-tests.log` (ursprünglicher Test ohne Produktänderung).
Abnahme der anschließenden Migration 0019: 23 Fokustests, darunter unbekannte
Praxis ohne Speicherung, Typprüfung, 668 Gesamttests und lokaler Programmaufbau
bestanden. Der zusätzliche neue Unbekannte-Praxis-Test ist im Fokustest enthalten.
Authentifizierter Browser-Korrektur-/Wiederholungstest ebenfalls Exit 0
(`artifacts/auth-speech-retry-final.log`); Audio simuliert, keine Anbieteraufrufe.

1. Nach bestandener Demo- und authentifizierter Sprachkorrektur,
   Praxiswissen-Anlegen-und-Wiederholung, Zwei-Praxen-Isolation und lokaler
   HTTP-Mutationsprüfung sind auch verlorene Merge-Speicherantworten in der
   Korrektur-Oberfläche geprüft. Als Nächstes gleichzeitig eintreffende
   Änderungen mit unabhängigen PostgreSQL-Verbindungen sowie die
   Mengenbegrenzung beim Altimport der Sprachkorrekturen absichern. Lokale Fakten-Neuanlage
   und gemischtes Anlegen/Zusammenführen sind geprüft.
Ergänzung Altbackup-Nutzbarkeit (12.09.2026): Der vollständige
`backup-restore-audit.mjs` besteht mit Exit 0. Sowohl ein aktueller Dump als
auch ein Backup vor Migration `0015` laufen durch die echte Wiederherstellung
und den aktuellen Datenbankstart. Danach verwenden die Produktionshelfer
die neuen Funktionen aus `0017`/`0018`: Neuanlage, identische Wiederholung
mit gleicher ID und Zusammenführen unter Erhalt der Quell-ID bestehen.
Die ursprüngliche Altpraxis und ihr Kontrollhinweis bleiben unverändert;
fremde Hörkorrekturen werden nicht übernommen. Die bisherigen Datei- und
Rollback-Fehlerfälle bleiben Bestandteil desselben Laufs.
Beleg: `%TEMP%/silvia-backup-restore-integrity.log`.
Das belegt den lokalen Upgrade-Pfad eines alten Backups, nicht die
Installation auf einem fremden Rechner oder ein Downgrade der Anwendung.

Ergänzung getrennte Installation (12.09.2026):
`SILVIA_STANDALONE_AUDIT=1 node scripts/production-smoke-audit.mjs` besteht
mit Exit 0. Nur `.output` wird in einen neuen temporären Ordner kopiert;
der Server läuft von dort mit leerem `NODE_PATH`, separater Dateidatenbank
und deaktiviertem Live. Login, Sprechen, Preise und Live-Status liefern 200.
Die Browserprüfung bestätigt keine fatalen Fehler und sechs erfolgreiche
lokale Assetabrufe (drei JavaScript, drei CSS; nicht zwingend unterschiedliche
Dateien). Nach vollständigem Stoppen und Neustart bleiben alle 19
Migrationsnamen und ihre Zeitstempel identisch. Datenbankprüfungen erfolgen
nur bei beendetem Testserver. Beleg: `%TEMP%/silvia-standalone-final.log`.
Dieselbe Windows-/Node-Installation bleibt Testvoraussetzung; ein Test auf
einem fremden Rechner oder mit echten Praxisdaten ist damit nicht ersetzt.

2. Nach bestandenem synthetischem Backup/Restore-Lauf Installation,
   Upgrade und Rollback auf einem sauberen Windows-Profil dokumentieren.
   Eine verbliebene `.prev`-Rettungssicherung sperrt den normalen Start
   vorsorglich: nicht löschen; manuelle Wiederherstellung separat abnehmen.
3. Erst danach einen ausdrücklich freigegebenen Live-Testkonto-Hörtest
   durchführen und Provider-Aufbewahrung, Kosten und Sprachqualität messen.

Bis diese Nachweise vorliegen, ist Silvia lokal testbar, aber nicht als
öffentliche Produktionsreife oder als rechtlich freigegebenes Produkt zu
bezeichnen.

Ergänzung Patienten-Isolation (12.09.2026): Der lokale A/B-Lauf
`PATIENT_ISOLATION_AUDIT=1 node scripts/practice-isolation-audit.mjs` besteht
mit Exit 0. Synthetische Patientenakten bleiben bei Suche, Detailabruf und
Änderung an die jeweilige Praxis gebunden; ein gültiger cookie-freier POST
wird als `Unauthorized` abgelehnt. Die A-Akte bleibt im vollständigen
Vorher-/Nachhervergleich unverändert, die B-Akte erhält nur die kontrollierte
Änderung. Beleg: `artifacts/patient-isolation-final.log`.
Das ist ein lokaler synthetischer Server-Funktions-Test, keine UI-Abnahme und
kein Nachweis für echte Praxisdaten. Die übrigen offenen Produktions- und
Rechtsnachweise bleiben bestehen; die Produktionsreife bleibt daher bei
50 %.

Ergänzung Termin-Isolation (12.09.2026): Der optionale Lauf
`APPOINTMENT_ISOLATION_AUDIT=1 node scripts/practice-isolation-audit.mjs`
besteht mit Exit 0 (`artifacts/appointment-isolation-final-2.log`). Nach echten
lokalen Anmeldungen verweigern Statusänderung und Verschiebung eine fremde
Termin-ID mit „Termin nicht gefunden.“; dieselben gültigen Eingaben funktionieren
für den eigenen Termin. Der abschließende vollständige Datenvergleich bestätigt
den fremden Termin unverändert und beim eigenen nur die erwartete Zeit und den
Status. Synthetischer Server-Funktions-Test, keine Kalender-UI- oder
Praxissoftware-Abnahme. Keine Produktänderung; Fortschrittsindex bleibt 50 %.

Ergänzung Löschroutine (12.09.2026):
`src/lib/practice/retention.integration.test.ts` spielt alle aktuellen
SQL-Migrationen in eine isolierte PGlite-Datenbank ein. Zwei synthetische
Praxen mit 30/90 Tagen Aufbewahrung: Nur abgelaufene Anrufe, Threads und Mails
der kürzeren Frist werden entfernt; Einträge exakt am Grenzzeitpunkt bleiben.
Vollständige Zeilenvergleiche bestätigen die übrigen Einträge sowie Patienten,
Termine, Praxiswissen und Sprachkorrekturen unverändert. Fokustest und
Typprüfung Exit 0. Kein Nachweis für Sicherungslöschung, Anbieteraufbewahrung,
Cloud-Datenbank oder rechtliche Freigabe; Fortschrittsindex bleibt 50 %.

Ergänzung IP-Vertrauensgrenze (12.09.2026): Die gemeinsame IP-Ermittlung für
Anmeldung und Demo-Mengenbegrenzungen ignoriert standardmäßig `x-forwarded-for`
und `x-real-ip`. Sie verwendet die validierte Laufzeitadresse, ansonsten eine
gemeinsame konservative `unknown`-Begrenzung. Proxy-Header sind nur mit
`SILVIA_TRUST_PROXY_HEADERS=1` zulässig; der Betreiber muss beide Header durch
seinen vorgeschalteten Server ersetzen/entfernen und Direktzugriffe verhindern.
Helper-Tests prüfen manipulierte, ungültige und überlange Angaben, Ketten und
IPv6. Typprüfung, 670 Gesamttests, lokaler Build und bestehender authentifizierter
Browser-Korrekturtest bestehen (letzterer `artifacts/auth-speech-ip-final.log`,
Exit 0). Der Browserlauf bestätigt Anmeldung/Korrektur, nicht die Proxykonfiguration.
Kein Mehrserver-Kostenlimit: Zähler bleiben pro Prozess, öffentliche Infrastruktur
und gemeinsames Budget sind noch separat abzusichern. Fortschrittsindex 50 %.

Ergänzung Demo-Anfragegrößen (12.09.2026): Globale Start-Request-Middleware
ordnet die drei Sprachfunktionen anhand ihrer erzeugten URLs zu, nicht anhand
einer erst später vorhandenen Funktions-Metadatenstruktur. POST-Grenzen:
Chat 64 KiB, Sprachausgabe 16 KiB, Erkennung 5 MiB. Tatsächliche Stream-Bytes
werden auch ohne verlässliches Content-Length gezählt; Abbruch und zehnsekündige
Lesegrenze sind berücksichtigt. Andere Funktionen und Routen bleiben unberührt.
Lokale HTTP-Prüfung: drei übergroße Zielanfragen sowie eine URL mit zusätzlichem
Pfad/Query liefern 413. Kleine ungültige bzw. fremde Funktionsanfragen lieferten
500 statt 413; das allein belegt keinen normalen Betrieb. Ergänzend besteht der
authentifizierte Browser-Korrekturablauf mit aktiver Middleware
(`artifacts/auth-speech-body-final.log`, Exit 0; Provider-Audio simuliert).
675 Gesamttests und lokaler Build bestanden. Kein öffentlicher Lasttest und
keine Aussage über vorgeschaltete Serverlimits; Fortschrittsindex bleibt 50 %.

Ergänzung Größenprüfung im ausgelieferten Programm (12.09.2026):
`SPEECH_BODY_AUDIT=1 node scripts/production-smoke-audit.mjs` prüft die drei
Sprachfunktionen anhand der tatsächlich erzeugten Funktions-IDs im separat
kopierten `.output`-Paket. Übergroße Chat-/Ausgabe-Anfragen sowie eine in neun
Teilen ohne Content-Length gesendete Erkennungsanfrage werden mit 413 abgelehnt.
Eine kleine, korrekt verpackte leere Audioanfrage erreicht dagegen die Funktion
und liefert 200 mit `ok:false`, `reason:"quiet"`, ohne Anbieteraufruf.
Login, Sprechen, Preise, deaktivierter Live-Status, lokale Browser-Dateien und
Neustart mit unveränderten Migrationszeitstempeln bestehen im selben Lauf.
Beleg: `artifacts/speech-body-audit-final.log`, Exit 0.
Der Test verwendet frische HTTP-Verbindungen mit absoluter Zeitgrenze. Ein
vorheriger Hänger war auf den damaligen Testtransport eingegrenzt: dieselbe
Route antwortete unmittelbar über eine frische Verbindung und im Browser.
Eine bestimmte Bibliotheksursache ist damit nicht bewiesen. Kein öffentlicher
Lasttest, kein echter Sprachtest und keine neue Produktionsfreigabe; weiterhin 50 %.

Ergänzung Homepage-Inhalte und Bedienung (12.09.2026): Unbelegte feste
Einrichtungs-/Test-/Rückruffristen und pauschale EU-/Export-/Löschzusagen in
FAQ und Anfrageformular sind entfernt. Nachrichten werden als manuell zu
versendende Entwürfe beschrieben; Nachtdienstkontakt ist keine automatische
Verbindung. Produktfilm und Öffnungszeitenhinweise folgen derselben Grenze,
einschließlich Entfernung der nicht implementierten SMS-Absage per „STOP“.
Praxissoftware-Anbindung bleibt separat zu prüfen. Die feste Kennung der drei
Einrichtungsschritte hängt nicht mehr vom Wortlaut ihrer Überschriften ab.

Der lokale Browserlauf `scripts/homepage-controls-audit.mjs` besteht mit
Exit 0 (`artifacts/homepage-honesty-controls-final.log`): 14 Desktop- und
13 mobile Navigationsziele, alle elf Homepage- und vier Preise-FAQ mit vollständig
aufgeklappter Antwort, Dialog-Pflichtfelder ohne Versand, Paketkennzeichnung und
mobiles Menü. Der Test wartet bis zur vollen Antwort-Höhe statt bereits einen
sichtbaren Ausschnitt während der Animation zu akzeptieren. Desktop (1440),
Mobile (320), Anfrageformular und geöffnete FAQ wurden zusätzlich visuell geprüft.
Nur lokale GET-Anfragen sind erlaubt; externe Ressourcen und alle anderen
Methoden sind gesperrt. Typprüfung, 40 Anzeige- und 20 Öffnungszeiten-Tests
sowie der lokale Build bestehen. Keine neue vollständige Gesamttestrunde.
Der Test belegt weder eine echte Anfrageübermittlung noch Sprachqualität.
Kundenstimmen und Erfolgskennzahl samt Messbehauptung sind inzwischen entfernt
und durch gekennzeichnete Beispielszenarien bzw. einen Testhinweis ersetzt.
41 gezielte Quelltext-/Anzeige-Prüfungen und Typecheck bestehen; die letzte
Ergänzung prüft auch direkt die öffentlichen Kennzahlendaten (2/2).
Bestehende Navigation-/Dialognachweise werden wiederverwendet, keine neue
visuelle Komplettprüfung behauptet. Unbelegte Wettbewerbsvergleiche sind durch
eigene Funktionen und vor dem Einsatz nötige Prüfungen ersetzt; keine garantierte
Dialekterkennung. 43 gezielte Tests und Typecheck bestehen. Fachrechtliche
Aussagen benötigen weiterhin Belege bzw. Freigaben.
Keine vollständige Inhalts-/Produktionsfreigabe; Fortschrittsindex bleibt 50 %.

Ergänzung Demo-Anfragen (12.09.2026): `scripts/lead-request-audit.mjs` prüft
das echte Anfrageformular gegen den lokalen Build und eine isolierte Datenbank.
Ein kontrollierter 503 vor dem Speichern zeigt einen Fehler, erhält alle Felder
und gibt den Knopf wieder frei. Der Wiederholungsversuch liefert 200 sowie ein
erfolgreiches Anwendungsergebnis; nach Schließen und Öffnen ist das Formular
zurückgesetzt. Erst nach vollständigem Serverstopp bestätigt der Datenvergleich
genau einen Antrag mit den eingegebenen Feldern und der zurückgegebenen ID.
Praxen, Patienten, Termine, Anrufe, Threads und Mails bleiben leer.
Beleg: `artifacts/lead-request-audit-final.log`, Exit 0. Nur synthetische Daten,
keine Anbieteraufrufe oder Nachrichten. Eine verlorene Antwort nach bereits
erfolgtem Speichern wurde damit nicht getestet; keine allgemeine
Doppelübermittlungs-Garantie. Betreiber-Bearbeitungsweg, Benachrichtigung und
Aufbewahrung dieser globalen Anfragen fehlen noch als Betriebsfreigabe.
Fortschrittsindex unverändert 50 %.

Ergänzung sicherer Testanruf (12.09.2026):
`TEST_CALL_AUDIT=1 node scripts/training-role-audit.mjs` besteht mit Exit 0
(`artifacts/training-test-call-audit.log`). Der echte angemeldete Einstieg
über Training öffnet `/sprechen?test=ja`. Eine gezielt simulierte Antwort mit
Termin-Aktion wird genau einmal verarbeitet; der sichtbare Testhinweis wird
abgewartet. Nach vollständigem Serverstopp sind die vollständigen Inhalte
von practices, patients, appointments, calls, threads, mails, emergencies,
practice_facts, hoer_corrections und hoer_legacy_imports unverändert.
Eine zweite Phase derselben isolierten Datenbank ohne Testmodus verarbeitet
dieselbe simulierte Antwort, liefert eine erfolgreiche echte Speicherantwort
und hinterlässt den gezielten Audit-Termin und -Anruf. Die positive Kontrolle
zeigt damit, dass die Testdaten tatsächlich einen Schreibvorgang auslösen können.
Nur künstliche Daten, unterdrückte lokale Audiowiedergabe und keine
Provider-Audioantwort; keine Aussage über echte Erkennung oder Stimme.
Der Nachweis gilt für diesen regulären Testeinstieg und Terminfall, nicht für
sämtliche Gesprächsaktionen, manipulierte Eingänge oder externe Praxissoftware.
Produktcode unverändert, kein neuer Build erforderlich. Diese Ergänzung
schließt den zuvor fehlenden lokalen Termin-Testanrufnachweis; Gesamtindex 50 %.

Ergänzung Training / Rollen (12.09.2026):
`scripts/training-role-audit.mjs` prüft mit zwei echten Anmeldungen derselben
synthetischen Praxis das Speichern von Ton und Verhalten durch die Inhaberin
und den unveränderten Wert nach Neuladen. Bei Rolle `kassa` sind Textfeld und
Speichern deaktiviert. Auch die Wiederholung des tatsächlich aufgezeichneten
Speicheraufrufs mit Mitarbeiterinnen-Sitzung und anderem Inhalt liefert ein
dekodiertes `ok: false` mit Rollenhinweis. Nach vollständigem Serverstopp
bestätigt der Vergleich der gesamten Praxiszeile, dass ausschließlich der
gewünschte Verhaltenstext geändert wurde. Beleg:
`artifacts/training-role-audit.log`, Exit 0. Kein Produktcode geändert.
Dieser lokale Browsernachweis prüft weder weitere Rollen/Berechtigungen noch
die Befolgung des Verhaltenstexts durch ein echtes Sprachmodell. Der sichere
Testanruf ohne Dateneinträge bleibt separat nachzuweisen; Gesamtindex 50 %.

Ergänzung Wiederholung von Demo-Anfragen (12.09.2026): Migration `0020`
und der gemeinsam von Anwendung und Datenbanktest verwendete Speicherhelper
sichern identische Anfragen mit Vorgangsnummer gegen doppelte Speicherung.
Der aktualisierte Formularaudit prüft zunächst einen 503 vor dem Speichern,
danach eine echte erfolgreiche Speicherung mit dekodiertem Ergebnis, deren
Bestätigung kontrolliert durch einen 503 ersetzt wird. Der dritte Klick liefert
dieselbe ID. Nach vollständigem Serverstopp steht exakt eine korrekte Anfrage
in der Datenbank; die sechs geprüften Praxistabellen bleiben leer.
Beleg: `artifacts/lead-request-audit-final.log`, Exit 0, `postCount: 3` und
identische `postCommitReturnedId`/`returnedId`. Zwei gezielte Tests bestehen:
Formular-Vorgangsnummer sowie gemeinsamer Speicherhelper mit parallelen
identischen Aufrufen, unveränderter vollständiger Zeile bei Inhaltskonflikt
und zwei eigenständigen Altanfragen ohne Vorgangsnummer. Typprüfung und
lokaler Build bestehen. Kein separater Vor-Fix-Reproduktionslauf; keine neue
vollständige Gesamttestrunde. Der Paralleltest verwendet eine lokale
PGlite-Instanz, keinen externen Mehrverbindungs-Datenbankserver.
Altaufrufer ohne Vorgangsnummer und bewusst neue Formulare sind nicht
dedupliziert. Betreiber-Bearbeitung und Aufbewahrung bleiben offen.
Diese Ergänzung ersetzt die frühere Einschränkung zum ungetesteten
Antwortverlust nach Speicherung. Fortschrittsindex bleibt 50 %.

Ergänzung Protokoll-Zugriffstrennung (12.09.2026): Der optionale Lauf
`PROTOCOL_ISOLATION_AUDIT=1` von `scripts/practice-isolation-audit.mjs`
besteht mit Exit 0 (`artifacts/practice-isolation-protocol.log`). Zwei echte
Praxis-Anmeldungen und synthetische Datensätze prüfen sieben Serverfunktionen:
Anrufsuche, Anrufdetail, Anrufstatus, Protokollsuche, Threaddetail, Maildetail
und Gelesen-Markierung. Praxis B erhält bei fremden IDs und Suchbegriffen
keine Inhalte von A. Gleich benannte Tiere mit unterschiedlichen Kontakten
bleiben korrekt zugeordnet. Alle sieben Funktionen weisen Anfragen ohne
Sitzung ab. Vollständige Datenzeilen werden nach Serverstopp verglichen:
A bleibt unverändert, bei B ändern sich nur der angeforderte Anrufstatus und
die Gelesen-Markierung; Mails und Patientenbestand bleiben unverändert.
Kein Produktcode geändert. Dies belegt die getesteten lokalen Zugriffswege,
nicht die vollständige Datenschutz-, Mehrserver- oder Produktionsfreigabe.
Patienten- und Protokollmodus sind wegen unterschiedlicher Testdaten getrennt
auszuführen. Fortschrittsindex bleibt 50 %.

Ergänzung Demo-Praxiswissen (12.09.2026): Der frühere Mehrtab-Reproduktionsfall
ist in Commit `63b3d45` festgehalten. Die neue lokale IndexedDB-Speicherung wird
mit zwei echten Browser-Tabs geprüft: Ein bewusst nicht benachrichtigter, alter
Tab B löscht nach Tab A eine andere Regel; nach Reload bleiben exakt die übrigen
Regeln erhalten. Der Audit prüft zudem Migration, leeren Bestand, Abbruch und
Retry, 40er-Grenze sowie fehlende externe Requests. Ein separater Homepage-Test
prüft zusätzlich den Seitenwechsel während verzögert geladenem Praxiswissen.
Nach Korrektur der Testverzögerung bestanden: vor Freigabe und 500 ms nach
Freigabe auf der anderen Seite jeweils 0 Mikrofon- und Audiostarts; auf der
Startseite startet die gleiche positive Kontrolle innerhalb von 3 Sekunden.
Auflegen, verspätete Mikrofonfreigabe und Audiostopp beim Seitenwechsel sind
ebenfalls lokal geprüft, ohne Browserfehler. Frühere fehlerhafte Testläufe
zählen nicht als Nachweis. Die laufende Homepage wurde nicht aktualisiert.
Die Nachweise sind lokal und keine Server-, Cloud- oder gemischte
Alt-/Neuversion-Garantie. Fortschrittsindex bleibt 50 %.
