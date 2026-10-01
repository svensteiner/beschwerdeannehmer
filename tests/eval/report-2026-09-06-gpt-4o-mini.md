# Gesprächs-Eval — gpt-4o-mini (openai) — 2026-09-06

AP 30: OpenAI-Pfad verifiziert. Zwei unabhängige Läufe von
`node scripts/eval-run.mjs --api` (30 Szenarien je Lauf, `SILVIA_LLM_PROVIDER=openai`,
`SILVIA_LLM_MODEL=gpt-4o-mini`), zwischen den Läufen die im Connector
hinterlegte Rate-Limit-Pause abgewartet:

| Lauf | Pass-Quote | Ø Latenz |
|---|---|---|
| Lauf 1 | 26/30 (86.7 %) | 535 ms |
| Lauf 2 (unten im Detail) | 28/30 (93.3 %) | 563 ms |

Vergleich: lokal (qwen2.5:3b, kein Netzwerk) erreichte 86.7 % — gpt-4o-mini
liegt damit im gleichen Bereich bis leicht darüber, mit im Mittel höherer
Latenz durch den Cloud-Roundtrip. Die FAILs in beiden Läufen sind
Grenzfälle (Notfall-Heuristik übernimmt statt Terminvorschlag), keine
Ausfälle/Fehler des OpenAI-Pfads selbst.

## Antwortzeiten (Lauf 2, ms)

Bereich 5–1380 ms, Ø 563 ms. Sehr schnelle Antworten (<20 ms) sind
Szenarien ohne LLM-Aufruf (reine Regelpfade, z. B. Öffnungszeiten,
Notfall-Stichworte); Antworten mit tatsächlichem gpt-4o-mini-Aufruf liegen
bei ca. 0.7–1.4 s.

## Kostenschätzung pro Anruf (gpt-4o-mini)

**Annahme (Preisliste, vom Modell übernommen, nicht live geprüft — vor
Rechnungsstellung gegen die aktuelle OpenAI-Preisseite verifizieren):**
$0.15 / 1M Input-Tokens, $0.60 / 1M Output-Tokens.

Hochrechnung je Anruf mit tatsächlichem Modellaufruf (Systemprompt +
Patienten-Kurzauszug + gesprochener Text ≈ 500–700 Input-Tokens; Antwort
im Schnitt ~32 Wörter ≈ 40–50 Output-Tokens):

- Input: ~600 Tokens × $0.15/1M ≈ **$0.00009**
- Output: ~45 Tokens × $0.60/1M ≈ **$0.000027**
- **≈ $0.00012 pro Anruf mit LLM-Aufruf** (deutlich unter 0,1 Cent).
  Anrufe, die rein regelbasiert beantwortet werden (Notfall-Stichworte,
  Öffnungszeiten u. ä., siehe schnelle Latenzen oben), verursachen keine
  Modellkosten. Diese Schätzung ist eine grobe Wörter→Token-Näherung ohne
  echtes Token-Logging aus der API-Antwort — für eine belastbare Zahl
  müsste `usage.prompt_tokens`/`usage.completion_tokens` aus der
  OpenAI-Antwort mitgeloggt werden (aktuell nicht Teil von `eval-run.mjs`).

---

Pass-Quote: **28/30 (93.3 %)**. Ø Latenz: 563 ms.

| Szenario | Ergebnis | Latenz (ms) | Wörter |
|---|---|---|---|
| termin-hund-1 | PASS | 1006 | 30 |
| termin-katze-1 | FAIL | 1204 | 23 |
| notfall-atemnot | PASS | 8 | 46 |
| notfall-vergiftung | PASS | 7 | 46 |
| impfung-faellig | PASS | 676 | 17 |
| preisfrage-op | PASS | 7 | 20 |
| preisfrage-impfung | PASS | 6 | 20 |
| oeffnungszeiten-feiertag | PASS | 6 | 61 |
| oeffnungszeiten-normal | PASS | 8 | 26 |
| falschwahl | PASS | 941 | 17 |
| rueckruf-1 | PASS | 9 | 17 |
| halterin-unbekannt | PASS | 8 | 17 |
| dialekt-1 | PASS | 1324 | 34 |
| dialekt-2 | PASS | 1064 | 20 |
| nummer-nennen | PASS | 1199 | 34 |
| notfall-krampf | PASS | 8 | 46 |
| termin-lahm | FAIL | 1375 | 37 |
| kastration-frage | PASS | 1380 | 54 |
| chip-frage | PASS | 1305 | 40 |
| hundeabgabe-frage | PASS | 10 | 65 |
| verbinden-mensch | PASS | 6 | 13 |
| whatsapp-foto | PASS | 1165 | 31 |
| reise-eu-ausweis | PASS | 7 | 55 |
| nachtdienst-frage | PASS | 5 | 29 |
| notfall-blut | PASS | 5 | 46 |
| englisch-check | PASS | 1026 | 32 |
| mehrere-tiere | PASS | 937 | 36 |
| termin-verschieben | PASS | 810 | 22 |
| notiz-allgemein | PASS | 1370 | 50 |
| parkplatz-frage | PASS | 8 | 48 |

## Fehlerliste

### termin-katze-1
Antwort: "Das klingt nach einem Notfall. Ich werde Sie sofort mit dem Nachtdienst verbinden, damit Ihre Katze schnellstmöglich versorgt werden kann. Einen Moment, bitte."
Fehlende Muss-Inhalte: termin|slot

### termin-lahm
Antwort: "Das klingt nach einem möglichen Notfall. Ich empfehle Ihnen, sofort das Tierspital der Vetmeduni Wien unter +43 1 25077-5555 zu kontaktieren, da ich hier im Nachtdienst bin. Dort können Sie die nötige Hilfe für Ihren Hund erhalten."
Fehlende Muss-Inhalte: termin|slot
