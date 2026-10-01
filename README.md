# Garagenwächter – Beschwerdemanagement

Abgeleitet aus Silvia: eine klare, sichere Annahme und Bearbeitung von Beschwerden für Garagenbetreiber.

## Aktueller Produktkern

- mobile Startseite mit verständlichem Beschwerdeformular
- Standort, Kategorie, Schilderung, Kontakt und Einwilligung
- clientseitige Pflichtfeld- und Mindestlängenprüfung
- keine Zahlungsdaten oder Passwörter im Formular
- Erfolgsmeldung nach dem Absenden

## Lokal starten

```bash
npm install
npm run dev
```

Die Anwendung läuft danach lokal. Vor einer öffentlichen Freigabe müssen Betreiberangaben, E-Mail-Versand und Aufbewahrungsfristen noch festgelegt werden.

## Betreiberbereich

1. `.env.garage.example` nach `.env` übernehmen und einen langen eigenen `GARAGEN_OPERATOR_KEY` setzen.
2. Anwendung starten und `/bearbeitung` öffnen.
3. Schlüssel nur im Betreiber-Browser eingeben; er wird nicht gespeichert.

Die Vorgänge liegen standardmäßig im lokalen Ordner `.garagen-data`. Dieser Ordner gehört nicht ins Git-Repository.
Die Standard-Aufbewahrung beträgt 180 Tage und kann mit `GARAGEN_RETENTION_DAYS` (1–3650 Tage) angepasst werden.

## Sicherheitsgrenze

Dieses Repository enthält keine echten Beschwerden, Zugangsdaten, `.env`-Dateien oder Produktionsdaten.
