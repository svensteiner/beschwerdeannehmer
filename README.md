# Garagenwächter – Beschwerdemanagement

Abgeleitet aus Silvia: eine klare, sichere Annahme und Bearbeitung von Beschwerden für Garagenbetreiber.

## Aktueller Produktkern

- mobile Startseite mit verständlichem Beschwerdeformular
- Standort, Kategorie, Schilderung, Kontakt und Einwilligung
- clientseitige Pflichtfeld- und Mindestlängenprüfung
- keine Zahlungsdaten oder Passwörter im Formular
- Erfolgsmeldung nach dem Absenden
- Betreiberliste mit Sicherheits-/Dringlichkeitspriorisierung und Bearbeitungsverlauf

## Lokal starten

```bash
npm install
npm run dev
```

Die Anwendung läuft danach lokal. Vor einer öffentlichen Freigabe müssen Betreiberangaben, E-Mail-Versand und Aufbewahrungsfristen noch festgelegt werden.
Für den Produktionsstart wird `npm start` verwendet; die Betreiber-Konfiguration liegt in einer lokalen `.env`-Datei.
Nach einem Update genügt `git pull` und anschließend ein Neustart mit `npm start`.

## Betreiberbereich

1. `.env.garage.example` nach `.env` übernehmen und einen langen eigenen `GARAGEN_OPERATOR_KEY` setzen.
2. Anwendung starten und `/bearbeitung` öffnen.
3. Schlüssel nur im Betreiber-Browser eingeben; er wird nicht gespeichert.

Die Vorgänge liegen standardmäßig im lokalen Ordner `.garagen-data`. Dieser Ordner gehört nicht ins Git-Repository.
Die Standard-Aufbewahrung beträgt 180 Tage und kann mit `GARAGEN_RETENTION_DAYS` (1–3650 Tage) angepasst werden.

Die öffentliche Anwendung enthält nur das Beschwerdeformular, den geschützten Betreiberbereich und die rechtlichen Informationsseiten. Alte Silvia-Routen und Sprach-/Praxis-APIs sind nicht Bestandteil dieses Projekts.

## Telefon-Demo und Gateway

Die Homepage enthält eine lokale Chat-Vorführung. Für echte Anrufe liegt das
übernommene, getrennte Gateway unter `phone-gateway/` (SIP = Telefonie über
das Netzwerk). Es nutzt die lokalen Whisper-/Piper-Dienste aus
`C:\silvia-voice` und darf nur mit einem ausdrücklich eingerichteten privaten
SIP-Ziel gestartet werden. Zugangsdaten kommen ausschließlich in die lokale
`.env` des Gateways, niemals ins Repository.

Das Gateway spricht mit `POST /api/telefon/antwort` über Loopback. Dafür müssen
`SILVIA_API_URL=http://127.0.0.1:8091/api/telefon/antwort` und derselbe starke
`GARAGEN_PHONE_TOKEN` im Betreiber-Server und im Gateway gesetzt werden.
Ohne diese Werte bleibt Telefonie sicher deaktiviert; der Mock-Test bleibt
offline möglich.

## Sicherheitsgrenze

Dieses Repository enthält keine echten Beschwerden, Zugangsdaten, `.env`-Dateien oder Produktionsdaten.
