# Spezifikation und Pitch pflegen

Die fachliche Quelle ist `SILVIA-SPEZIFIKATION.md`. Der zentrale Pitch für
Ordinationsleitungen und Pilotpartner ist `Silvia-Pitch.pptx`. Die ältere
Kollegenfassung bleibt als eigenes Dokument erhalten, ist aber kein freigegebenes
Verkaufsdokument. Vor einer Weitergabe muss sie aus der aktuellen Quelle neu
erzeugt und visuell geprüft werden; insbesondere dürfen darin keine alten Preise
oder Testversprechen stehen.

## Sparsamer Ablauf

Zuerst Git-Änderungen und neue Entscheidungen prüfen. Nur bei inhaltlich
relevanten Änderungen die Spezifikation und `pitch-content.json` anpassen.
Bereits implementiert, geplant und geprüft sind unterschiedliche Zustände.
Preise, Kundenzahlen, Entlastung und Sicherheitsgarantien nie erfinden.

Die eingerichtete tägliche Prüfung übernimmt diesen Abgleich. Sie ist keine
Echtzeit-Synchronisierung und ersetzt die Dokumentpflege bei einer Umsetzung
nicht. Ohne Änderungen erfolgt keine Neuerstellung des Pitchs.

## Erstellung für Codex

Den Präsentations-Skill vollständig nach seiner Anleitung verwenden,
einschließlich des einmaligen Startmarkers für die jeweilige Bearbeitung.
Mit `load_workspace_dependencies` die gebündelte Laufzeit finden.
`SILVIA_ARTIFACT_RUNTIME` auf deren `dependencies`-Ordner setzen und
`SILVIA_PRESENTATIONS_SKILL` auf das aktuelle Präsentations-Skill-Verzeichnis.
Dann `docs/build-pitch.mjs` mit dem gebündelten Node ausführen.
Bei vorhandener Präsentation stattdessen `docs/update-pitch.mjs` verwenden:
Es importiert die bestehende Datei und aktualisiert Texte in ihren vorhandenen
Textfeldern. Geometrie und Gestaltung bleiben erhalten. Auch hier erst nach
Prüfung die fertige Ausgabe übernehmen.

Das Skript verwendet @oai/artifact-tool, erzeugt bearbeitbare Folien und
prüft die PowerPoint-Struktur. Entwürfe, Prüfbericht und gerenderte Folien
liegen in einem neuen Verzeichnis unter `artifacts/pitch/` und sind nicht
für Git vorgesehen. Alle finalen Folien visuell prüfen, erst dann die
geprüfte Datei aus `output/` unverändert nach `docs/Silvia-Pitch.pptx`
kopieren. Keine ungeprüften Entwürfe veröffentlichen.

Erstfassung 11. September 2026: sechs Folien, Struktur- und Layoutprüfung
ohne Befund, alle sechs gerenderten Folien visuell geprüft. Native Bedienung
in Microsoft PowerPoint wurde nicht geprüft. Der Lauf lieferte trotz
vollständiger Artefakte und bestandener Einzelprüfungen Exitcode 1. Bei
weiteren Läufen deshalb Prüfbericht und Ausgabe kontrollieren, einen
Fehlercode nicht pauschal als Erfolg behandeln.

Aktualisierung 11. September 2026, abends: Folien 4 und 6 unterscheiden die
lokal eingebaute, deaktivierte Live-Funktion vom noch offenen echten
Gesprächs- und Unterbrechungstest. Die vorhandene Aufnahme bleibt davon
getrennt. Preise nach Abstimmung, Kostenfreigabe vor dem Test.
Die bestehende Präsentation wurde importiert und gezielt bearbeitet, ohne
das Design oder die sechs Folien zu ändern. Struktur-, Layout- und erneute
Importprüfung bestanden; alle sechs final gerenderten Folien visuell geprüft.
Prüfbericht: `artifacts/pitch/2026-09-11T21-14-15-582Z/validation.json`.
SHA-256 der übernommenen Datei:
`ae2196c4e0bb313b9c9cd0781a0cdbf091559975ab8f9b7b8663317b0eee51fc`.
Die native Bedienung in Microsoft PowerPoint bleibt ungeprüft.

Aktualisierung 12. September 2026, 17:53 Uhr: Folien 4 und 6 nennen die
geprüfte kurze Demo-Textkorrektur und grenzen manuelle Terminänderungen ab.
Stimmqualität, Antwortzeit und echter Live-Unterbrechungstest bleiben offen.
Alle sechs finalen Folien visuell geprüft. Struktur-, Layout- und Importprüfung
bestanden laut `artifacts/pitch/2026-09-12T15-53-30-123Z/validation.json`.
Der Gesamtprozess endet weiterhin mit Exit 1 trotz vollständiger Ergebnisse.
Keine Behauptung eines fehlerfreien Erzeugungslaufs oder nativen PowerPoint-Tests.
SHA-256: `db6f1812a6059cb353f37f129059c94812406cb895b84ad68f8997703f051d6d`.

Aktualisierung 14. September 2026, 20:28 Uhr: Die geprüfte Fassung v4 ist als
zentraler Pitch übernommen. Alle sechs Folien wurden visuell kontrolliert;
Struktur-, Layout- und Importprüfung bestanden laut
`artifacts/pitch/2026-09-14T18-28-11-180Z/validation.json`. Keine Behauptung
eines nativen PowerPoint-Tests. SHA-256:
`b0d3579081f91cf9bffbfd236194d6df138208a9e8cb2040e01d1a3b4eef46d7`.

Nur eigene geprüfte Dokumentänderungen gezielt committen und nach einer
ausdrücklichen Freigabe mit `git push origin main` veröffentlichen.
