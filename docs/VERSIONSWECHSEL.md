# Sicherer Versionswechsel

Stand: 12. September 2026. Arbeitsanweisung für die technische Betreuung,
keine Freigabe für einen ungeprüften Produktivwechsel.

## Vor dem Wechsel

- Gespräche und Schreibarbeiten beenden. Programmversion festhalten und die
  bisherige lauffähige Programmkopie getrennt aufbewahren.
- Über „Tafel sichern“ eine Sicherung erstellen. Sie enthält vertrauliche
  Praxisdaten: ausschließlich lokal bzw. in freigegebenem geschütztem Speicher
  aufbewahren, niemals in GitHub oder an externe KI übermitteln.
- Wiederherstellung und neue Version zuerst mit synthetischen Daten prüfen.
  Die tatsächliche Umstellung benötigt ein abgestimmtes Wartungsfenster.

## Rückkehr zur vorherigen Version

Eine alte Programmversion darf nicht ungeprüft auf eine bereits aktualisierte
Datenbank zugreifen. Datenbankänderungen heißen hier „Migrationen“.
Fehlen der Anwendung bereits angewendete Migrationen, muss der Start des
Datenzugriffs abbrechen. Ein solcher Abbruch ist kein erfolgreicher Rückwechsel.

Zuerst die zur Datenbank passende Programmversion wieder einsetzen. Ist eine
Rückkehr zwingend nötig, alte Programmkopie und zugehörige Sicherung gemeinsam
in einer getrennten Umgebung wiederherstellen und prüfen. Die aktuelle
Datenbank unverändert aufbewahren. Seit der Sicherung neu erfasste Vorgänge
fehlen im alten Stand und müssen vor der Freigabe abgeglichen werden.
Migrationsnachweise niemals löschen, um die Sperre zu umgehen.

## Grenzen und Freigabe

Teilnachweis: `node --test scripts/migration-plan.test.mjs` besteht mit neun
Tests. `node scripts/migration-compatibility-audit.mjs` besteht lokal mit Exit 0:
Der echte Datenzugriff lehnt eine synthetische unbekannte Migration zweimal
ab; Tabellen, Migrationsnachweis und Kontrollwert bleiben unverändert.
Ein zweiter isolierter Lauf startet mit ausschließlich der ersten Migration:
Der Produktionshelfer ergänzt alle 22 aktuellen Migrationen, erhält den
ursprünglichen Zeitstempel und den Kontrollwert. Wiederholter Datenzugriff
ändert keine Migrationszeitstempel. Das prüft ein synthetisches Schema-Upgrade,
nicht den vollständigen Wechsel zwischen zwei installierten Programmversionen.
Der Audit verwendet ausschließlich eine Arbeitsspeicher-Datenbank und keine
Schlüssel. Der PostgreSQL-Startpfad verwendet dieselbe Prüfung, ist hier aber
nicht gegen einen echten PostgreSQL-Server abgenommen.

Zusätzlich besteht `npm run audit:version-switch`: Der Audit baut die letzte
Git-Version vor der jüngsten Migration und die aktuelle Version in zwei
temporären Kopien. Mit erfundener Ordination und Sitzung prüft er den echten
Serverablauf: Altversion → aktuelle Version → Altserver verweigert den
angemeldeten Zugriff → Rückkehr zur passenden alten Datenkopie → Altserver
liefert wieder `200`. Er verwendet den vorhandenen lokalen Paketbestand und
einen vollständigen Git-Verlauf; die CI lädt diesen deshalb vollständig. Die
Testkopien und Daten werden entfernt.

Der Vergleich der Migrationsnamen erkennt weder nachträglich geänderte
SQL-Dateien noch jede inkompatible Programmänderung bei gleichem Schema.
Auch der neue Audit ersetzt keinen dokumentierten Wechsel eines veröffentlichten
Installers auf frischem Windows, keine PostgreSQL- oder Fremdrechner-Abnahme.

Vor Freigabe: Anmeldung, Datenbestand, Termin-/Kontaktablauf, lokale Stimme,
Datensperren, Sicherung und erneuter Neustart prüfen; Version, Ergebnis und
verantwortliche Person protokollieren. Die laufende Testseite auf Port 8092
wird durch diese Anleitung nicht verändert oder neu gestartet.
