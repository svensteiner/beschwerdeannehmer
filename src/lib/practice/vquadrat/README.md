# Vquadrat — hier liegen die Dateien

Silvia-Port bleibt vendor-neutral. Alles, was Vquadrat heißt, liegt in diesem Ordner.

| Datei | Inhalt |
| --- | --- |
| `adapter.ts` | Laptop-Port. Antwortet `notConnected`. |
| `daten.ts` | Tafel-Felder. Spalte `vquadrat` ist leer — Admin trägt den echten Namen ein. |
| `angebot.beispiel.json` | Was die Tafel anbietet (Akte, Slot, Kontakt). Kein Vquadrat-Payload. |
| `spiegel.ts` | Lokale Spiegelzeilen in `praxissoftware_spiegel`. Tafel-Namen, `vquadrat_ref` leer. |
| `oeffentlich.ts` | Was auf vquadrat.at steht: SQL im Hintergrund, Partner (Idexx, Laboklin, …). Kein Rezeptions-Protokoll. |
| `index.ts` | Re-Exports. |

Daneben, nicht hier:

- `../praxissoftware.ts` — gemeinsamer Port (Akte / Slot / Kontakt)
- `../praxissoftware.test.ts` — Tests
- `../desk-actions.ts` / `../board.ts` — Tafel schreibt, dann `offerTafelToSpiegel`
- `docs/vquadrat/README.md` — dieselbe Karte für den Laptop

Nicht hier: Partner-Schnittstellen (Labor, Chip, ELORD). Die gehören Vquadrat, nicht Silvia.
