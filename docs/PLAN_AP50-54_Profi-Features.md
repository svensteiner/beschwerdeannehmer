# Plan AP 50–54: Profi-Features aus der Recherche (fonio, Wettbewerb)

Stand 2026-09-09. Quellen: docs/RECHERCHE-fonio.md, docs/RECHERCHE-Feature-Ideen.md, docs/RECHERCHE-Sprachstack.md.
Regeln wie in docs/PLAN_PMS_Bridge.md Abschnitt 2 (node:test, Tests in scripts/run-tests.mjs eintragen, kein
top-level Import von @/lib/db in Lib-Modulen, Deutsch in UI, keine PII in Logs, Migrationen idempotent).

| AP | Titel | Kern |
|---|---|---|
| 50 | Demo spricht, was sie zeigt; Demo hört über den Server | Startseiten-Demo: Begrüßung per TTS aus dem angezeigten Text statt fertiger MP3 (MP3 nur als Fallback ohne Schlüssel). Spracherkennung der Demo über den bestehenden Server-Transkriptionspfad (`startRecordFallback` + `/api/stimme/hoeren`) statt Chrome SpeechRecognition; Chrome-SpeechRecognition nur noch, wenn der Server keine STT hat. Sichtbare Fehlermeldung statt stillem Scheitern ("Mikrofon liefert keinen Ton" wenn Pegel 0 nach 3 s). |
| 51 | Freitext-Verhalten je Praxis | Einstellungen: Textfeld "So soll Silvia sich verhalten" (max 2000 Zeichen, Spalte `practices.behavior`), wird als eigener Block in den System-Prompt der Praxis eingefügt, nach den Fakten. Migration 0011. |
| 52 | Anruf-Zusammenfassung | Nach Gesprächsende (detectEndCall / Auflegen) erzeugt Silvia 3–5 Zeilen Zusammenfassung (LLM, bestehender Provider), speichert sie am `calls`-Datensatz (Spalte `summary`), zeigt sie in der Tafel bei Anrufe und legt einen E-Mail-Entwurf an die Praxis-Adresse in Nachrichten an. Kein Versand. Migration 0012. |
| 53 | Einwilligungsansage | Begrüßung bekommt einen konfigurierbaren Zusatz (Default: "Das Gespräch wird zur Terminvereinbarung verarbeitet."), Schalter in Einstellungen, Zeitstempel `consent_announced_at` am Anruf. Migration 0013. |
| 54 | AVV-Seite | `/avv`: Auftragsverarbeitungsvertrag nach Art. 28 DSGVO als statische Seite im Stil von /datenschutz, Link im Footer, Platzhalter für Praxisdaten. Keine Rechtsberatung, Hinweis "Muster, vor Nutzung juristisch prüfen". |

Reihenfolge: 50 und 54 parallel, dann 51, dann 52, dann 53. Jedes AP: Typecheck, `npm test`, `npm run build`, Commit `AP <n>: …`.
