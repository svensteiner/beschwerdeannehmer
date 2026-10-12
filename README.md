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

## Vorführung mit Sprache

Die Startseite zeigt das Formular und eine kurze Chat-Vorschau. Für die
vollständige Vorführung mit Mikrofon öffnen Sie `/telefon-demo`.

1. Lokale Sprachdienste starten: `C:\silvia-voice\start-voice.cmd`.
2. Die Anwendung lokal starten und `/telefon-demo` öffnen.
3. Mikrofon freigeben, ein erfundenes Anliegen sprechen und die erkannten
   Angaben im Live-Protokoll kontrollieren.
4. Mit **Ins Beschwerdeformular übernehmen** gelangen die Angaben als Entwurf
   ins bestehende Formular. Erst dessen Absenden mit Einwilligung speichert
   einen Vorgang.

Whisper (Spracherkennung) und Piper (Sprachausgabe) laufen dabei ausschließlich
auf diesem Rechner. Wenn die Sprachdienste nicht laufen, bleibt Text-Eingabe
weiter nutzbar und die Seite zeigt eine verständliche Fehlermeldung.

## Kleine, wartbare Bausteine

| Bereich | Datei | Aufgabe |
| --- | --- | --- |
| Gesprächsregeln | `src/lib/beschwerden/chat.server.ts` | Erkennt Kategorie, Standort, Zeitpunkt, Dringlichkeit und Rückrufnummer; fragt immer nur die nächste fehlende Angabe nach. |
| Formularregeln | `src/lib/beschwerden/validation.ts` | Prüft Eingaben und schützt vor unvollständigen oder falschen Daten. |
| Speicherung | `src/lib/beschwerden/store.server.ts` | Legt Vorgänge lokal ab und verwaltet ihren Bearbeitungsstatus. |
| Betreiberliste | `src/lib/beschwerden/inbox.ts` | Sortiert Sicherheit und Dringlichkeit vor normalen Vorgängen. |
| Startseite | `src/routes/index.tsx` | Zeigt die Demo und das bewährte Beschwerdeformular. |
| Sprachdemo | `src/routes/telefon-demo.tsx` | Verbindet Mikrofon, lokale Sprache, Live-Protokoll und Formularentwurf. |

Die Regeln sind bewusst klein gehalten. Neue Kategorien oder Formulierungen
werden in den jeweiligen Beschwerde-Dateien geändert, nicht in einer externen
KI oder Datenbank versteckt.

## Betreiberbereich

1. `.env.garage.example` nach `.env` übernehmen und einen langen eigenen `GARAGEN_OPERATOR_KEY` setzen.
2. Anwendung starten und `/bearbeitung` öffnen.
3. Schlüssel nur im Betreiber-Browser eingeben; er wird nicht gespeichert.

Die Vorgänge liegen standardmäßig im lokalen Ordner `.garagen-data`. Dieser Ordner gehört nicht ins Git-Repository.
Die Standard-Aufbewahrung beträgt 180 Tage und kann mit `GARAGEN_RETENTION_DAYS` (1–3650 Tage) angepasst werden.

Die öffentliche Anwendung enthält nur das Beschwerdeformular, die lokale
Sprachdemo, den geschützten Betreiberbereich und die rechtlichen
Informationsseiten. Alte Silvia-Routen und Praxis-APIs sind nicht Bestandteil
dieses Projekts.

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
