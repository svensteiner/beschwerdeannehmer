# Gesprächs-Eval — qwen2.5:7b-instruct (compat) — 2026-09-05

Pass-Quote: **19/30 (63.3 %)**. Ø Latenz: 22883 ms.

| Szenario | Ergebnis | Latenz (ms) | Wörter |
|---|---|---|---|
| termin-hund-1 | FAIL | n/a | n/a |
| termin-katze-1 | PASS | 120922 (unter Last) | 76 |
| notfall-atemnot | FAIL | 323 | 43 |
| notfall-vergiftung | FAIL | 193 | 43 |
| impfung-faellig | FAIL | n/a | n/a |
| preisfrage-op | PASS | 177 | 21 |
| preisfrage-impfung | PASS | 173 | 21 |
| oeffnungszeiten-feiertag | PASS | 211 | 62 |
| oeffnungszeiten-normal | PASS | 182 | 27 |
| falschwahl | PASS | 89515 (unter Last) | 32 |
| rueckruf-1 | PASS | 164 | 18 |
| halterin-unbekannt | PASS | 241 | 18 |
| dialekt-1 | PASS | 68314 (unter Last) | 64 |
| dialekt-2 | FAIL | n/a | n/a |
| nummer-nennen | PASS | 122328 (unter Last) | 22 |
| notfall-krampf | PASS | 210 | 43 |
| termin-lahm | FAIL | n/a | n/a |
| kastration-frage | FAIL | n/a | n/a |
| chip-frage | PASS | 28765 (unter Last) | 59 |
| hundeabgabe-frage | PASS | 214 | 66 |
| verbinden-mensch | PASS | 231 | 14 |
| whatsapp-foto | FAIL | n/a | n/a |
| reise-eu-ausweis | PASS | 213 | 49 |
| nachtdienst-frage | PASS | 265 | 30 |
| notfall-blut | PASS | 183 | 43 |
| englisch-check | FAIL | n/a | n/a |
| mehrere-tiere | FAIL | n/a | n/a |
| termin-verschieben | PASS | 28596 (unter Last) | 39 |
| notiz-allgemein | FAIL | 41804 (unter Last) | 24 |
| parkplatz-frage | PASS | 191 | 49 |

## Fehlerliste

### termin-hund-1
Fehler: locator.waitFor: Timeout 150000ms exceeded.
Call log:
[2m  - waiting for locator('.bg-ok\\/20').nth(1) to be visible[22m


### notfall-atemnot
Antwort: "Das klingt nach einem Notfall – bitte nicht warten. Ich verbinde Sie mit dem Tierspital der Vetmeduni Wien unter +43 1 25077-5555. Kleine Haustiere, 24 Stunden. Silvia verbindet und übergibt das Protokoll. Ich bleibe in der Leitung, bis die Übernahme bestätigt ist.

Lokal"
Fehlende Muss-Inhalte: nachtdienst|sofort

### notfall-vergiftung
Antwort: "Das klingt nach einem Notfall – bitte nicht warten. Ich verbinde Sie mit dem Tierspital der Vetmeduni Wien unter +43 1 25077-5555. Kleine Haustiere, 24 Stunden. Silvia verbindet und übergibt das Protokoll. Ich bleibe in der Leitung, bis die Übernahme bestätigt ist.

Lokal"
Fehlende Muss-Inhalte: nachtdienst|sofort

### impfung-faellig
Fehler: locator.waitFor: Timeout 150000ms exceeded.
Call log:
[2m  - waiting for locator('.bg-ok\\/20').nth(1) to be visible[22m


### dialekt-2
Fehler: locator.waitFor: Timeout 150000ms exceeded.
Call log:
[2m  - waiting for locator('.bg-ok\\/20').nth(1) to be visible[22m


### termin-lahm
Fehler: locator.waitFor: Timeout 150000ms exceeded.
Call log:
[2m  - waiting for locator('.bg-ok\\/20').nth(1) to be visible[22m


### kastration-frage
Fehler: locator.waitFor: Timeout 150000ms exceeded.
Call log:
[2m  - waiting for locator('.bg-ok\\/20').nth(1) to be visible[22m


### whatsapp-foto
Fehler: locator.waitFor: Timeout 150000ms exceeded.
Call log:
[2m  - waiting for locator('.bg-ok\\/20').nth(1) to be visible[22m


### englisch-check
Fehler: locator.waitFor: Timeout 150000ms exceeded.
Call log:
[2m  - waiting for locator('.bg-ok\\/20').nth(1) to be visible[22m


### mehrere-tiere
Fehler: locator.waitFor: Timeout 150000ms exceeded.
Call log:
[2m  - waiting for locator('.bg-ok\\/20').nth(1) to be visible[22m


### notiz-allgemein
Antwort: "Natürlich, ich werde das mitteilen. Würden Sie mir bitte Ihren Namen und Ihre Telefonnummer geben? Das hilft uns, die Information korrekt weiterzuleiten. Servus!

Modell"
Fehlende Muss-Inhalte: frau doktor|termin|weiterleiten|notier
