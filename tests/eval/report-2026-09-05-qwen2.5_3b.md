# Gesprächs-Eval — qwen2.5:3b (compat) — 2026-09-05

Pass-Quote: **23/30 (76.7 %)**. Ø Latenz: 2346 ms.

| Szenario | Ergebnis | Latenz (ms) | Wörter |
|---|---|---|---|
| termin-hund-1 | FAIL | 1542 | 7 |
| termin-katze-1 | FAIL | 2169 | 9 |
| notfall-atemnot | FAIL | 11 | 42 |
| notfall-vergiftung | FAIL | 11 | 42 |
| impfung-faellig | PASS | 4022 | 24 |
| preisfrage-op | PASS | 12 | 20 |
| preisfrage-impfung | PASS | 9 | 20 |
| oeffnungszeiten-feiertag | PASS | 9 | 61 |
| oeffnungszeiten-normal | PASS | 8 | 26 |
| falschwahl | PASS | 4988 | 24 |
| rueckruf-1 | PASS | 18 | 17 |
| halterin-unbekannt | PASS | 16 | 17 |
| dialekt-1 | FAIL | 12811 | 15 |
| dialekt-2 | PASS | 6150 | 18 |
| nummer-nennen | PASS | 6253 | 5 |
| notfall-krampf | PASS | 11 | 42 |
| termin-lahm | PASS | 4949 | 21 |
| kastration-frage | FAIL | 5394 | 32 |
| chip-frage | PASS | 3394 | 24 |
| hundeabgabe-frage | PASS | 14 | 65 |
| verbinden-mensch | PASS | 11 | 13 |
| whatsapp-foto | PASS | 3022 | 17 |
| reise-eu-ausweis | PASS | 10 | 55 |
| nachtdienst-frage | PASS | 8 | 29 |
| notfall-blut | PASS | 7 | 42 |
| englisch-check | PASS | 4032 | 25 |
| mehrere-tiere | PASS | 4206 | 21 |
| termin-verschieben | PASS | 3600 | 15 |
| notiz-allgemein | FAIL | 3696 | 13 |
| parkplatz-frage | PASS | 11 | 48 |

## Fehlerliste

### termin-hund-1
Antwort: "Grüß Gott, wann stehen Sie zur Verfügung?"
Fehlende Muss-Inhalte: slot|termin|frei|montag|dienstag|mittwoch|donnerstag|freitag|\d{1,2}[.:]\d{2}

### termin-katze-1
Antwort: "Servus, bitte geben Sie Ihren Haltersnamen und Telefonnummer an."
Fehlende Muss-Inhalte: termin|slot

### notfall-atemnot
Antwort: "Das klingt nach einem Notfall – bitte nicht warten. Ich verbinde Sie mit dem Tierspital der Vetmeduni Wien unter +43 1 25077-5555. Kleine Haustiere, 24 Stunden. Silvia verbindet und übergibt das Protokoll. Ich bleibe in der Leitung, bis die Übernahme bestätigt ist."
Fehlende Muss-Inhalte: nachtdienst|sofort

### notfall-vergiftung
Antwort: "Das klingt nach einem Notfall – bitte nicht warten. Ich verbinde Sie mit dem Tierspital der Vetmeduni Wien unter +43 1 25077-5555. Kleine Haustiere, 24 Stunden. Silvia verbindet und übergibt das Protokoll. Ich bleibe in der Leitung, bis die Übernahme bestätigt ist."
Fehlende Muss-Inhalte: nachtdienst|sofort

### dialekt-1
Antwort: "Servus, bitte geben Sie mir Ihren Namen und Ihre Telefonnummer, damit ich die Tierarzthelferin verbinde."
Fehlende Muss-Inhalte: termin|slot

### kastration-frage
Antwort: "Ein Kater kann ab dem Alter von 4-6 Monaten kastriert werden. Es ist empfehlenswert, ihn zuerst bei einem Tierarzt zu untersuchen, um sicherzustellen, dass er gesund und geeignet für die Operation ist."
Fehlende Muss-Inhalte: frau doktor|termin|vormerken

### notiz-allgemein
Antwort: "Ich verbinde Sie mit der Tierarzthelferin. Einen Moment, bleiben Sie in der Leitung."
Fehlende Muss-Inhalte: frau doktor|termin|weiterleiten|notier
