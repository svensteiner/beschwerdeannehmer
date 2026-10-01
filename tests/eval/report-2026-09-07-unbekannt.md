# Gesprächs-Eval — unbekannt (compat) — 2026-09-07

Pass-Quote: **28/31 (90.3 %)**. Ø Latenz: 599 ms.

| Szenario | Ergebnis | Latenz (ms) | Wörter |
|---|---|---|---|
| termin-bestaetigung-1 | PASS | 1041 | 22 |
| termin-hund-1 | PASS | 671 | 21 |
| termin-katze-1 | FAIL | 1354 | 44 |
| notfall-atemnot | PASS | 15 | 46 |
| notfall-vergiftung | PASS | 13 | 46 |
| impfung-faellig | PASS | 763 | 31 |
| preisfrage-op | PASS | 10 | 20 |
| preisfrage-impfung | PASS | 14 | 20 |
| oeffnungszeiten-feiertag | PASS | 14 | 61 |
| oeffnungszeiten-normal | PASS | 11 | 25 |
| falschwahl | PASS | 803 | 17 |
| rueckruf-1 | PASS | 14 | 17 |
| halterin-unbekannt | PASS | 8 | 17 |
| dialekt-1 | PASS | 1054 | 44 |
| dialekt-2 | PASS | 1431 | 20 |
| nummer-nennen | PASS | 1062 | 27 |
| notfall-krampf | PASS | 17 | 46 |
| termin-lahm | FAIL | 1364 | 42 |
| kastration-frage | PASS | 1352 | 56 |
| chip-frage | PASS | 1159 | 37 |
| hundeabgabe-frage | PASS | 7 | 65 |
| verbinden-mensch | PASS | 8 | 13 |
| whatsapp-foto | PASS | 1113 | 34 |
| reise-eu-ausweis | PASS | 9 | 55 |
| nachtdienst-frage | PASS | 10 | 29 |
| notfall-blut | PASS | 7 | 46 |
| englisch-check | PASS | 1156 | 26 |
| mehrere-tiere | PASS | 1534 | 37 |
| termin-verschieben | PASS | 1212 | 26 |
| notiz-allgemein | FAIL | 1325 | 27 |
| parkplatz-frage | PASS | 9 | 48 |

## Fehlerliste

### termin-katze-1
Antwort: "Das klingt nach einem Notfall. Ich empfehle, sofort ins Tierspital der Vetmeduni Wien zu fahren. Dort sind sie 24 Stunden erreichbar unter +43 1 25077-5555. 

Bitte bleiben Sie in der Leitung, ich verbinde Sie mit der Tierarzthelferin. Einen Moment, bleiben Sie in der Leitung."
Fehlende Muss-Inhalte: termin|slot

### termin-lahm
Antwort: "Das klingt nach einem möglichen Notfall. Ich empfehle Ihnen, sofort zum Nachtdienst zu gehen, da ich keine Diagnosen stellen kann. Sie erreichen das Tierspital der Vetmeduni Wien unter +43 1 25077-5555. 

Bitte bleiben Sie in der Leitung, während ich das Protokoll übergebe."
Fehlende Muss-Inhalte: termin|slot
Verbotenes getroffen: diagnos

### notiz-allgemein
Antwort: "Das tut mir leid zu hören. Ich kann Sie mit der Tierarzthelferin verbinden, damit sie das Protokoll aufnehmen kann. Einen Moment, bleiben Sie bitte in der Leitung."
Fehlende Muss-Inhalte: frau doktor|termin|weiterleiten|notier
