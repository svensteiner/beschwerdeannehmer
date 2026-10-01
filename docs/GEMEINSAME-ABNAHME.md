# Gemeinsame Abnahme mit Sven

Diese Checkliste dient dem abschließenden gemeinsamen Test. Sie ist keine
Produktionsfreigabe. Wir verwenden nur erfundene Angaben oder Svens eigene
Testnummer. Echte Praxisdaten bleiben aus dem Test und gehen niemals an externe
KI-Dienste.

Für Sicherung und Wiederherstellung gilt zusätzlich die
[`Betriebsanleitung`](BETRIEBSANLEITUNG-SICHERUNG.md).

## Vor dem Start

- Silvia läuft lokal auf dem Testrechner. Der Browser zeigt die aktuelle Seite.
- Vquadrat bleibt abgekoppelt oder nutzt ausschließlich die getrennte Testkopie.
- Die Cloud-Live-Demo bleibt deaktiviert, bis Kosten, Aufbewahrung und
  Datenschutz ausdrücklich freigegeben sind.

## 1. Homepage

1. Startseite auf Handy und Rechner öffnen.
2. Beide Varianten anhören und prüfen, ob die Beschriftung verständlich ist.
3. Demo öffnen, einen erfundenen Hinweis eingeben und neu laden.
4. Erwartung: Der Hinweis bleibt in der Demo sichtbar. Löschen und Wiederholen
   funktionieren ohne Fehlermeldung.

## 2. Gespräch und Stimme

1. Im Trainingsbereich eine Begrüßung hinterlegen, zum Beispiel: "Grüß Gott,
   Tierordination Test."
2. Einen Testanruf starten und einen einfachen Terminwunsch mit einer
   erfundenen Adresse sprechen, zum Beispiel: „Leopoldsgasse zwölf“.
3. Während Silvia antwortet, erneut sprechen und danach auflegen.
4. Erwartung: Die Begrüßung passt, Silvia reagiert verständlich, die
   Unterbrechung stoppt die laufende Antwort und Auflegen beendet das Gespräch.
5. Direkt nach dem Auflegen die Mikrofonanzeige von Browser oder Handy prüfen.
   Erwartung: Sie erlischt; nach Neuladen darf weder Aufnahme noch Ton weiterlaufen.
6. Wenn Silvia „Leopoldsgasse“ falsch versteht, die sichtbare Zeile berichtigen
   und "Korrigieren" wählen. Erwartung: Nur die Erkennung wird korrigiert, kein
   Termin wird automatisch geändert.
7. Mit erfundenen Angaben „morgen um zehn Uhr“ für einen Termin nennen.
   Erwartung: Kein Termin-Slot entsteht; unter „An die Tierarzthelferin“ liegt
   ein `Terminwunsch` zur Prüfung der Uhrzeit.

## 3. Praxissoftware

Dieser Teil bleibt getrennt. Erst nach ausdrücklicher Freigabe verwenden wir
die lokale Vquadrat-Testkopie. Dabei prüfen wir die Oberfläche und einen
erfundenen Fall. Termin-Schreiben, echte Praxisdaten und die produktive
Vquadrat-Datenbank bleiben gesperrt.

Falls wir später das Termin-Schreiben in der Testkopie ausdrücklich freigeben:

1. Einen erfundenen Termin in Vquadrat bestätigen und gleichzeitig denselben
   Zeitpunkt auf der Silvia-Tafel belegen.
2. Erwartung: Silvia legt keinen zweiten Termin an und behauptet keine lokale
   Bestätigung. Unter „An die Tierarzthelferin“ erscheint stattdessen ein
   `Tafelkonflikt` mit der externen Terminnummer zur sofortigen Prüfung.

## Ergebnis festhalten

Für jeden Abschnitt reicht ein Eintrag: bestanden, offen oder Fehler. Bei
einem Fehler notieren wir nur Testschritt und Uhrzeit, keine Namen,
Telefonnummern oder Gesprächsinhalte.
