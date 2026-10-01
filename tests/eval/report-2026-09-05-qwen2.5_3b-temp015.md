# Gesprächs-Eval — unbekannt (compat) — 2026-09-05

Pass-Quote: **26/30 (86.7 %)**. Ø Latenz: 2793 ms.

| Szenario | Ergebnis | Latenz (ms) | Wörter |
|---|---|---|---|
| termin-hund-1 | PASS | 3964 | 22 |
| termin-katze-1 | FAIL | 3299 | 14 |
| notfall-atemnot | PASS | 12 | 46 |
| notfall-vergiftung | PASS | 10 | 46 |
| impfung-faellig | PASS | 4501 | 27 |
| preisfrage-op | PASS | 16 | 20 |
| preisfrage-impfung | PASS | 11 | 20 |
| oeffnungszeiten-feiertag | PASS | 9 | 61 |
| oeffnungszeiten-normal | PASS | 12 | 26 |
| falschwahl | PASS | 3772 | 18 |
| rueckruf-1 | PASS | 17 | 17 |
| halterin-unbekannt | PASS | 13 | 17 |
| dialekt-1 | FAIL | 3777 | 15 |
| dialekt-2 | PASS | 5709 | 27 |
| nummer-nennen | PASS | 7248 | 4 |
| notfall-krampf | PASS | 16 | 46 |
| termin-lahm | FAIL | 4240 | 13 |
| kastration-frage | PASS | 4399 | 23 |
| chip-frage | PASS | 3750 | 27 |
| hundeabgabe-frage | PASS | 12 | 65 |
| verbinden-mensch | PASS | 9 | 13 |
| whatsapp-foto | PASS | 3646 | 15 |
| reise-eu-ausweis | PASS | 14 | 55 |
| nachtdienst-frage | PASS | 12 | 29 |
| notfall-blut | PASS | 10 | 46 |
| englisch-check | PASS | 16607 | 24 |
| mehrere-tiere | PASS | 11606 | 34 |
| termin-verschieben | PASS | 3672 | 22 |
| notiz-allgemein | FAIL | 3428 | 13 |
| parkplatz-frage | PASS | 11 | 48 |

## Fehlerliste

### termin-katze-1
Antwort: "Servus, bitte geben Sie mir Ihre Telefonnummer oder Email, damit ich die Tierarzthelferin informiere."
Fehlende Muss-Inhalte: termin|slot

### dialekt-1
Antwort: "Servus, bitte geben Sie mir Ihren Namen und Ihre Telefonnummer, damit ich die Tierarzthelferin verbinde."
Fehlende Muss-Inhalte: termin|slot

### termin-lahm
Antwort: "Ohne Tierarztberatung ist dies ernst. Bitte rufe die Tierarzthelferin an: +43 1 25077-5555."
Fehlende Muss-Inhalte: termin|slot

### notiz-allgemein
Antwort: "Ich verbinde Sie mit der Tierarzthelferin. Einen Moment, bleiben Sie in der Leitung."
Fehlende Muss-Inhalte: frau doktor|termin|weiterleiten|notier
