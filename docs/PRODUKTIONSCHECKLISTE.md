# Produktionscheckliste

Vor der öffentlichen Freigabe einmal vollständig abhaken:

- [ ] Betreibername, ladungsfähige Anschrift und Kontakt im Impressum ergänzt.
- [ ] Zuständige Datenschutzinformation und Aufbewahrungsfrist geprüft.
- [ ] `GARAGEN_OPERATOR_KEY` mit mindestens 16 zufälligen Zeichen gesetzt.
- [ ] `GARAGEN_DATA_DIR` auf einen geschützten, gesicherten Speicherort gesetzt.
- [ ] Anwendung ausschließlich über HTTPS veröffentlicht.
- [ ] `/api/gesundheit` meldet `ready: true`.
- [ ] Synthetische Testbeschwerde angenommen, bearbeitet und anschließend gelöscht.
- [ ] Keine Testdaten, `.env`-Dateien oder Schlüssel im Repository.

Die Anwendung versendet derzeit keine automatische E-Mail. Antworten werden im Betreiberbereich erfasst und können dort als E-Mail-Entwurf geöffnet werden.
