# Gesprächs-Eval — unbekannt (compat) — 2026-09-06

Pass-Quote: **29/31 (93.5 %)**. Ø Latenz: 554 ms.

| Szenario | Ergebnis | Latenz (ms) | Wörter |
|---|---|---|---|
| termin-bestaetigung-1 | PASS | 904 | 17 |
| termin-hund-1 | PASS | 2317 | 35 |
| termin-katze-1 | FAIL | 1119 | 26 |
| notfall-atemnot | PASS | 18 | 46 |
| notfall-vergiftung | PASS | 10 | 46 |
| impfung-faellig | PASS | 693 | 14 |
| preisfrage-op | PASS | 10 | 20 |
| preisfrage-impfung | PASS | 14 | 20 |
| oeffnungszeiten-feiertag | PASS | 17 | 61 |
| oeffnungszeiten-normal | PASS | 14 | 26 |
| falschwahl | PASS | 711 | 20 |
| rueckruf-1 | PASS | 18 | 17 |
| halterin-unbekannt | PASS | 11 | 17 |
| dialekt-1 | PASS | 1065 | 34 |
| dialekt-2 | PASS | 915 | 19 |
| nummer-nennen | PASS | 957 | 27 |
| notfall-krampf | PASS | 9 | 46 |
| termin-lahm | PASS | 1775 | 54 |
| kastration-frage | PASS | 1175 | 54 |
| chip-frage | PASS | 1198 | 38 |
| hundeabgabe-frage | PASS | 8 | 65 |
| verbinden-mensch | PASS | 6 | 13 |
| whatsapp-foto | PASS | 953 | 27 |
| reise-eu-ausweis | PASS | 9 | 55 |
| nachtdienst-frage | PASS | 8 | 29 |
| notfall-blut | PASS | 6 | 46 |
| englisch-check | PASS | 959 | 23 |
| mehrere-tiere | PASS | 799 | 32 |
| termin-verschieben | PASS | 686 | 21 |
| notiz-allgemein | FAIL | 795 | 19 |
| parkplatz-frage | PASS | 9 | 48 |

## Fehlerliste

### termin-katze-1
Antwort: "Das klingt nach einem Notfall. Ich werde Sie sofort mit dem Nachtdienst des Tierspitals der Vetmeduni Wien verbinden. Einen Moment, bleiben Sie bitte in der Leitung."
Fehlende Muss-Inhalte: termin|slot

### notiz-allgemein
Antwort: "Ich kann Sie mit der Tierarzthelferin verbinden, die das Protokoll weiterleitet. Einen Moment, bleiben Sie bitte in der Leitung."
Fehlende Muss-Inhalte: frau doktor|termin|weiterleiten|notier
