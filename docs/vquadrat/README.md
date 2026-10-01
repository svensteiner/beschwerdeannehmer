# Vquadrat — Orientierung

Laptop = Vquadrat + Verkauf (`/demo`). Praxis-PC = Live-Tafel `/app`. Nicht Silvia in Vquadrat installieren.

## Code

```
src/lib/practice/praxissoftware.ts      gemeinsamer Port
src/lib/practice/vquadrat/
  README.md                             diese Karte, beim Code
  adapter.ts                            Laptop-Stub
  daten.ts                              Tafel-Felder, Vquadrat-Namen leer
  spiegel.ts                            lokale Spiegelzeilen (Tafel-Namen)
  angebot.beispiel.json                 Beispiel-Angebot der Tafel
  oeffentlich.ts                        nur öffentliche Fakten (vquadrat.at)
  index.ts
migrations/0008_praxissoftware_spiegel.sql
```

Am Praxis-PC: `npm start`, Heute **Walk-in legen**. Kein GitHub. Die Kopplung selbst bleibt zu, bis der echte Vquadrat-Feldname da ist.

Alte Import-Datei `src/lib/practice/praxissoftware-vquadrat.ts` zeigt nur noch hierher.

## Aktueller Abnahme-Stand (12.09.2026)

Wichtige Punkte aus der Zwischenabnahme:

- Lokale Lesetests auf der Testkopie liefen erfolgreich (u. a. Vquadrat-Schema-Read + Connector-Owner/Patient-Probe).
- Die Lesetests änderten keine Praxisdatensätze. Neben Metadaten wurde eine vorhandene Halter-Tier-Zuordnung lokal geprüft; ausgegeben wurden nur Statuswerte, keine Praxisinhalte.
- Eine zusätzliche Testkopie für Schreibtests konnte wegen fehlender `CREATE`-Rechte nicht erstellt werden, daher wurden keine echten Termin-Schreibtests durchgeführt.
- Keine echte Vollabnahme der Vquadrat-Anbindung. Zusätzlich: **keine echten Praxisdaten (inkl. Audio/Abschriften) an externe KI-Dienste**.

## Daten, die du als Admin füllst

In `daten.ts` steht jedes Feld so:

```
{ tafel: "pet", vquadrat: null }
```

`vquadrat: null` bleibt, bis du den echten Spalten- oder Formularnamen aus der Software einträgst. Keine erfundenen IDs.

Was die Tafel schon schickt, steht in `angebot.beispiel.json`.

## Was Cloud nicht hat

Kein DSN, kein COM, kein Dateiformat, keine öffentliche Rezeptions-API, kein Vquadrat-Dump. Partnerports (Idexx, Laboklin, Animaldata, ELORD) sind Vquadrat-intern — Silvia koppelt sie nicht. Der Spiegel speichert deshalb nur Tafel-Namen.
