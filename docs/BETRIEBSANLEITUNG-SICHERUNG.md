# Sicherung und Wiederherstellung

Diese Anleitung ist für die Inhaberin der Ordination. Sie betrifft nur die
lokale Silvia-Tafel. Sie ersetzt keine Datenbanksicherung bei PostgreSQL und
keine spätere Testwiederherstellung mit erfundenen Daten.

## Sicherung erstellen

1. In Silvia anmelden und **Einstellungen** öffnen. Auf der Tagesstartseite
   ist derselbe Bereich ebenfalls erreichbar.
2. Im Abschnitt **Sicherung** auf **Tafel sichern** klicken.
3. Warten, bis **„Sicherung heruntergeladen.“** und ein Zeitstempel sichtbar
   sind.
4. Die heruntergeladene `.tar.gz`-Datei auf ein getrenntes,
   geschütztes Speichermedium kopieren. Sie nicht per E-Mail oder Chat senden.

Die Datei enthält nur die lokale PGlite-Datenbank. Bei PostgreSQL zeigt Silvia
stattdessen einen Hinweis: Die Sicherung erfolgt dort über die Datenbank.

## Wiederherstellung

Eine Wiederherstellung ersetzt den aktuellen lokalen Stand. Sie ist deshalb
nur für eine bekannte Sicherungsdatei vorgesehen.

1. Als **Inhaberin** in Silvia anmelden und **Einstellungen** öffnen.
2. Im Abschnitt **Sicherung** die gewünschte `.tar.gz`-Sicherungsdatei auswählen.
3. Den neben dem Feld angezeigten Bestätigungstext exakt in
   **„Zum Holen … eintippen“** eingeben.
4. **Tafel holen** klicken und warten. Währenddessen erscheint **„Holt…“**
   oder ein Wartehinweis.
5. Erfolg ist erst erreicht, wenn **„Tafel geholt.“** erscheint oder die Seite
   neu lädt. Danach Silvia neu anmelden und nur prüfen, ob Tagesstartseite und
   Einstellungen erreichbar sind.

Bei einem Fehler keine Sicherungsdatei versenden. Notieren Sie nur Uhrzeit,
sichtbare Fehlermeldung und ob die alte Tafel noch erreichbar ist. Die
Wiederherstellung prüft die Datei vor dem Umschalten; bei einem Fehler bleibt
der bisherige Datenstand erhalten.

## Eingebaute Schutzmaßnahmen

- Nur die Inhaberin sieht den Wiederherstellungsweg.
- Datei, Bestätigungstext, Größe und GZIP-Inhalt werden vor dem Umschalten
  geprüft.
- Anzeige-/Schreibschutz und eine bereits laufende Wiederherstellung sperren
  neue Schreibvorgänge.
- Es sind höchstens vier Wiederherstellungsversuche pro IP-Adresse in
  15 Minuten möglich.
- Nach einer erfolgreichen Wiederherstellung wird die Anmeldung sicher
  erneuert; gegebenenfalls erscheint wieder die Anmeldeseite.

## Vor der produktiven Nutzung noch gemeinsam testen

Mit einer **erfundenen** Testordination eine Sicherung erstellen, sie auf ein
zweites Medium kopieren und in einer getrennten Testumgebung wiederherstellen.
Echte Praxisdaten, die produktive Vquadrat-Datenbank und externe KI-Dienste
bleiben dabei außen vor. Ein Stromausfall, ein vollständig voller Datenträger
und PostgreSQL benötigen eine eigene Betriebsabnahme.
