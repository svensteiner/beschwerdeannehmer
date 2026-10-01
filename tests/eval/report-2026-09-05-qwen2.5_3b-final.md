# Gesprächs-Eval — qwen2.5:3b-final (compat) — 2026-09-05

Pass-Quote: **27/30 (90.0 %)**. Ø Latenz: 37820 ms.

| Szenario | Ergebnis | Latenz (ms) | Wörter |
|---|---|---|---|
| termin-hund-1 | PASS | 108999 (unter Last) | 18 |
| termin-katze-1 | PASS | 122582 (unter Last) | 55 |
| notfall-atemnot | FAIL | 187 | 43 |
| notfall-vergiftung | FAIL | 216 | 43 |
| impfung-faellig | PASS | 122684 (unter Last) | 19 |
| preisfrage-op | PASS | 191 | 21 |
| preisfrage-impfung | PASS | 208 | 21 |
| oeffnungszeiten-feiertag | PASS | 264 | 62 |
| oeffnungszeiten-normal | PASS | 224 | 27 |
| falschwahl | PASS | 119085 (unter Last) | 24 |
| rueckruf-1 | PASS | 171 | 18 |
| halterin-unbekannt | PASS | 221 | 18 |
| dialekt-1 | PASS | 27189 (unter Last) | 34 |
| dialekt-2 | PASS | 14138 | 39 |
| nummer-nennen | PASS | 10257 | 25 |
| notfall-krampf | PASS | 319 | 43 |
| termin-lahm | PASS | 103134 (unter Last) | 32 |
| kastration-frage | PASS | 122180 (unter Last) | 30 |
| chip-frage | PASS | 123862 (unter Last) | 19 |
| hundeabgabe-frage | PASS | 214 | 66 |
| verbinden-mensch | PASS | 263 | 14 |
| whatsapp-foto | PASS | 108854 (unter Last) | 22 |
| reise-eu-ausweis | PASS | 180 | 49 |
| nachtdienst-frage | PASS | 192 | 30 |
| notfall-blut | PASS | 221 | 43 |
| englisch-check | PASS | 106206 (unter Last) | 15 |
| mehrere-tiere | PASS | 26545 (unter Last) | 20 |
| termin-verschieben | PASS | 9119 | 31 |
| notiz-allgemein | FAIL | 6394 | 14 |
| parkplatz-frage | PASS | 305 | 49 |

## Fehlerliste

### notfall-atemnot
Antwort: "Das klingt nach einem Notfall – bitte nicht warten. Ich verbinde Sie mit dem Tierspital der Vetmeduni Wien unter +43 1 25077-5555. Kleine Haustiere, 24 Stunden. Silvia verbindet und übergibt das Protokoll. Ich bleibe in der Leitung, bis die Übernahme bestätigt ist.

Lokal"
Fehlende Muss-Inhalte: nachtdienst|sofort

### notfall-vergiftung
Antwort: "Das klingt nach einem Notfall – bitte nicht warten. Ich verbinde Sie mit dem Tierspital der Vetmeduni Wien unter +43 1 25077-5555. Kleine Haustiere, 24 Stunden. Silvia verbindet und übergibt das Protokoll. Ich bleibe in der Leitung, bis die Übernahme bestätigt ist.

Lokal"
Fehlende Muss-Inhalte: nachtdienst|sofort

### notiz-allgemein
Antwort: "Ich verbinde Sie mit der Tierarzthelferin. Einen Moment, bleiben Sie in der Leitung.

Modell"
Fehlende Muss-Inhalte: frau doktor|termin|weiterleiten|notier
