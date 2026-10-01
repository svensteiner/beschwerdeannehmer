# Unbeabsichtigter lokaler Build – 13.09.2026

## Gesicherter Stand

Der ausführende Agent meldete einen versehentlichen Build im Arbeitsordner
`C:\silvia` statt in der isolierten Tempkopie. Das widerspricht der Vorgabe,
die bestehende `.output` nicht zu verändern. Root bestätigte den Zeitstempel
von `.output/server/index.mjs`: 13.09.2026, 00:15:57 (lokale Zeit).

Bei der anschließenden Prüfung war kein Listener auf Port 8092 vorhanden.
Ob dies durch den Build verursacht wurde, ist nicht belegt. Es wird weder
ein unveränderter Betrieb noch ein Datenverlust behauptet.

## Maßnahmen und offene Punkte

- Weitere Builds, Starts und Rücksetzungen der Originalausgabe gestoppt.
- Nutzer informiert; Wiederherstellung/Start angefragt, noch nicht freigegeben.
- Kein automatisches Zurückkopieren einer möglicherweise unpassenden Ausgabe.
- Laut Agent wurden im Arbeitsordner `C:\silvia` nacheinander Typprüfung,
  Kopieren der Dialogquelle in die Tempkopie und `npm run build` mit
  `SILVIA_LOCAL_NITRO=1` ausgeführt. Das Kopieren änderte den Arbeitsordner
  nicht; der Build lief deshalb am falschen Ort. Kein vollständiges
  Buildprotokoll und kein separat erfasster numerischer Exitcode vorhanden.
- Ein vorheriger Dienstzustand auf 8092 ist aus diesem Lauf nicht belegt.
  `src/routeTree.gen.ts` ist inzwischen nicht mehr als geändert gelistet;
  die Ursache ist ungeklärt. Keine automatische Wiederherstellung versucht.
- Die Homepage-Browserprüfungen verwendeten den isolierten Server auf 8183;
  deren Funktionsnachweis ist getrennt von diesem Betriebsverstoß zu bewerten.

Frühere Aussagen, die Originalausgabe sei durchgehend unverändert geblieben,
gelten ausdrücklich nicht für diesen Vorfall. Produktionsfreigabe bleibt offen.
