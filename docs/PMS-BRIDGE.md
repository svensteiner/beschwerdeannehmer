# Praxissoftware-Bridge (PMS-Bridge)

Stand: AP 41–46, siehe `docs/PLAN_PMS_Bridge.md` für die vollständige Architekturentscheidung.
Diese Seite ist die Betriebs- und Entwickler-Doku dazu — für Praxis-IT-Admins und für
Entwickler:innen, die einen neuen Praxissoftware-Adapter anbinden.

**Aktueller Sicherheitsrahmen (14.09.2026):** Nur der lokale, strikt lesende
Testpfad gegen `C:\\silvia-connector-test` und dessen festgelegte Testkopie ist
nachgewiesen. Vertrauliche Praxisdaten verlassen dabei nie den lokalen Rechner und
gehen nie an externe KI-Dienste. Es gibt keine Freigabe für produktive Anbindung,
Termin-Schreiben, Vquadrat-GUI oder Telefonbetrieb. Das bleibt bis zu einer
separaten fachlichen, rechtlichen und technischen Abnahme gesperrt.

## 1. Was die Bridge ist

Sicherheitsnachtrag 12.09.2026: Der HTTP-Connector folgt keinen Weiterleitungen.
Das gilt sowohl für die Patientensuche als auch für Termin-Schreibanfragen,
damit Zielwechsel keine Anfrageinhalte oder Zugangsdaten weiterreichen.
Die konfigurierte Adresse muss direkt den freigegebenen Connector erreichen.
Adressprüfung, Netzfreigabe und dessen interne Datenwege bleiben Aufgaben
der Betriebsabnahme. Dieser Schutz ist keine Garantie gegen Datenweitergabe
durch einen falsch konfigurierten oder kompromittierten Connector.

Nachweis: `praxissoftware-connector.test.ts` prüft mit zwei lokalen HTTP-Servern
und erfundenen Daten die Statuscodes 301/302/303/307/308 für Lesen und Schreiben.
Das Umleitungsziel erhält null Anfragen. Reguläre Erfolge sowie 403/409 bleiben
korrekt unterscheidbar. Typecheck bestanden, keine echte Praxissoftware kontaktiert.

Sicherheitsnachtrag 14.09.2026: Silvia prüft die Connector-Adresse vor jedem
Netzaufruf. Erlaubt sind nur direkte HTTP(S)-Adressen ohne Benutzerkennung,
Passwort, Suchparameter oder Fragment. Eine externe Adresse braucht HTTPS;
unverschlüsseltes HTTP bleibt auf Loopback beschränkt und braucht in Produktion
zusätzlich die ausdrückliche lokale Testfreigabe. Private und interne Ziele außerhalb von Loopback werden
abgewiesen. Ein abgewiesenes Ziel bleibt lokal `notConnected` und löst keinen
Netzaufruf aus. Die Sync-HTTP-Antwort ersetzt externe Halter-/Patientenschlüssel
durch reine Zählwerte. Outbox-Lesen und -Ändern binden zusätzlich Praxis und
Praxissoftware-Kind. Das sind technische Schutzmaßnahmen, keine Freigabe einer
produktiven Verbindung oder eine vollständige Datenflussabnahme.

Sicherheitsnachtrag 14.09.2026: Der getrennte Connector selbst nimmt nur
Loopback-Verbindungen an. Seine normalen Tests und die Windows-CI berühren
keine Vquadrat-Testkopie; ein solcher Integrationstest braucht eine ausdrückliche
lokale Opt-in-Freigabe. Produktives Termin-Schreiben bleibt zusätzlich hinter
drei unabhängigen lokalen Freigaben gesperrt. Diese Schranken verhindern einen
versehentlichen Schreibbetrieb, ersetzen aber weder Feldprüfung noch fachliche,
rechtliche oder technische Produktivfreigabe.

Die **Zielarchitektur** ist eine eigene, herstellerneutrale Praxis-Datenbank
("Bridge-DB") in der bestehenden Postgres/PGLite-Instanz. Ein Adapter verbindet sie
mit der jeweiligen Praxissoftware (heute Vquadrat Veterinär über
`silvia-connector`). Für den aktuellen Nachweis läuft dies ausschließlich lokal gegen
die Testkopie; ein produktiver Fallback oder Termin-Schreiben ist nicht freigegeben.
Die Architektur bleibt adapterfähig, damit spätere Systeme ohne Umbau der Silvia-Oberfläche
angebunden werden können.

Das Prinzip ist **Sync statt Live-Kopplung**: Silvia spricht nie direkt mit Firebird oder
der Vquadrat-Datenbank. Die Grenze bleibt immer `silvia-connector` (HTTP, Bearer-Token).
Ergebnis ist Plug-and-play — eine neue Praxissoftware ist ein neuer Adapter (eine Datei
plus ein Registry-Eintrag), ohne Eingriff in Silvia, Buchung oder Tafel.

## 2. Architektur

```
                 ┌──────────────────────────────┐
  Silvia/Buchung → │ BridgeReader (read-through)  │ ← Tafel/Status
                 └───────┬──────────────┬───────┘
                         │ hit          │ miss/stale
                 ┌───────▼───────┐  ┌───▼──────────────┐
                 │ Bridge-DB     │  │ Adapter (Port)   │
                 │ pms_* Tabellen│◄─┤ Registry: kind → │
                 └───────▲───────┘  │ vquadrat | stub  │
                         │ upsert   └───┬──────────────┘
                 ┌───────┴───────┐      │ HTTP
                 │ SyncEngine    │──────┘
                 │ pull + outbox │
                 └───────────────┘
```

Module (alle unter `src/lib/practice/bridge/`):

| Datei | Zweck |
|---|---|
| `registry.ts` | Adapter-Registry, `adapterFor(kind, env)` |
| `adapters.ts` | Importiert alle Adapter-Module (Registrierungs-Nebenwirkung), reicht `adapterFor` durch |
| `schema.ts` | TS-Typen der Bridge-Zeilen, Hash-Funktion |
| `repo.ts` | Repository: upsert/find/outbox über `Sql` |
| `sync.ts` | SyncEngine: `syncMasterData`, `syncOwnerByPhone`, `syncOwnerByName`, `flushOutbox` |
| `reader.ts` | `bridgeReader(deps): PraxissoftwarePort` (Read-through, implementiert denselben Port) |
| `runtime.ts` | Gemeinsamer Aufbau (`bridgeSyncFor`) für API-Route und Scheduler |
| `scheduler.ts` | Intervall-Sync für `npm start` (opt-in per Env) |
| `status.ts` | Status-Zeile für Einstellungen (`praxissoftwareStatusView`, inkl. Bridge-Zeile) |

`src/lib/practice/praxissoftware-runtime.ts` baut daraus die eigentliche Runtime-Fabrik
(`praxissoftwareRuntime`), die Silvia-Dialog und Import statt eines direkten Adapters
verwenden.

## 3. Tabellenübersicht `pms_*`

Alle Tabellen (`migrations/0010_pms_bridge.sql`) tragen `practice_id text not null`
(Mandant), `pms_kind text not null`, `external_id text not null`, `external_hash text
not null`, `raw jsonb not null`, `synced_at timestamptz not null default now()`,
`deleted_at timestamptz null` (Soft-Delete). Unique-Key: `(practice_id, pms_kind,
external_id)`. `external_hash` = SHA-256 über die kanonisch serialisierten Fachfelder;
ein Upsert läuft nur, wenn sich der Hash geändert hat.

| Tabelle | Fachfelder | Zweck |
|---|---|---|
| `pms_owners` | `name`, `phone`, `phone_norm` (nur Ziffern, indiziert), `email` | Halter:innen |
| `pms_patients` | `owner_external_id`, `name`, `species`, `chip` | Patient:innen je Halter |
| `pms_resources` | `name` | Ressourcen (Behandlungsräume, Ärztinnen-Slots) |
| `pms_vets` | `name` | Tierärztinnen/Tierärzte |
| `pms_hours` | `hours jsonb` (eine Zeile je Praxis) | Öffnungszeiten laut Praxissoftware |
| `pms_sync_runs` | `id`, `scope` (`master`\|`owner`\|`outbox`), `started_at`, `finished_at`, `ok`, `stats`, `error` | Protokoll jedes Sync-Laufs |
| `pms_outbox` | `id` (= Idempotenzschlüssel), `kind` (`appointment`), `payload`, `status` (`pending`\|`sent`\|`conflict`\|`forbidden`\|`failed`), `attempts`, `next_attempt_at`, `result` | Ausstehende Schreibvorgänge Richtung Praxissoftware |

## 4. Betrieb

### 4.1 Env-Variablen

| Variable | Bedeutung | Default |
|---|---|---|
| `SILVIA_PMS_URL` | Direkte Basis-URL des `silvia-connector`. Ohne Wert bleibt der Adapter Stub. Erlaubt sind HTTPS-Ziele oder der lokale Loopback-Test; keine Zugangsdaten, Suchparameter oder Fragmente. | leer → Stub |
| `SILVIA_PMS_TOKEN` | Bearer-Token für `silvia-connector`. Server-only, wird nie an den Browser ausgeliefert. | leer |
| `SILVIA_PMS_LOCAL_TEST=1` | Erlaubt ausschließlich im ausdrücklich markierten lokalen Testbetrieb Loopback-HTTP. Nie als Produktionsfreigabe verwenden. | leer → in Produktion gesperrt |
| `SILVIA_PMS_KIND` | Überschreibt das aus dem Profil-Label aufgelöste `kind` in der Adapter-Registry (`adapterFor`). Nur wirksam, wenn dieses `kind` registriert ist. | nicht gesetzt → Auflösung über Profil-Label |
| `SILVIA_PMS_BRIDGE=0` | **Fluchtweg**: überspringt die Bridge-DB komplett und liefert den nackten Adapter zurück — für den Fall, dass die Bridge-DB selbst Probleme macht. | nicht gesetzt (Bridge aktiv) |
| `SILVIA_PMS_SYNC_MINUTES` | Aktiviert den Hintergrund-Scheduler (`startBridgeScheduler`) alle N Minuten für jede Praxis mit hinterlegter Praxissoftware. Muss eine ganze Zahl > 0 sein, sonst bleibt der Scheduler aus. | leer → Scheduler aus |
| `SILVIA_BOOKING` | Vorbereiteter, **nicht freigegebener** Schreibpfad: `connector` könnte künftig Termin-Schreiben anfordern. Im aktuellen Betrieb nicht setzen; der geprüfte Test setzt beide Schreibflags auf `0`. | leer → nur vormerken |
| `SILVIA_BOOKING_LIVE_APPROVED` | Zweite, ausdrückliche Freigabe für den Schreibpfad. Ohne exakt `1` bleibt jede Connector-Buchung gesperrt, auch wenn `SILVIA_BOOKING=connector` gesetzt ist. Nur nach dokumentierter Abnahme setzen. | leer → gesperrt |

Geprüft gegen den tatsächlichen Code in `praxissoftware-runtime.ts`, `bridge/registry.ts`,
`bridge/scheduler.ts`, `vquadrat/adapter.ts` und `alma/booking.ts`.

### 4.2 Manueller Sync per API

`POST /api/pms-sync` stößt `syncMasterData()` + `flushOutbox()` für die eingeloggte Praxis
an (dieselben Bausteine wie der Hintergrund-Scheduler, `bridge/runtime.ts`). Nur die
Inhaberin darf das auslösen (Session-Prüfung + Rollen-Gate, wie bei `/api/tafel-backup`).
Die Authentifizierung läuft über das Session-Cookie `silvia.session` (gesetzt beim
Anmelden unter `/login`) — kein separater API-Key.

```powershell
# Cookie-Wert zuvor im Browser aus den DevTools kopieren (Anwendung → Cookies →
# silvia.session) oder mit einem Login-Request selbst gewinnen.
curl -X POST http://localhost:8080/api/pms-sync `
  -H "Cookie: silvia.session=<token>"
```

Antwort ist die `SyncRun`-JSON für `master` und `outbox` (Start-/Endzeit, `ok`, `stats`,
`error`). Ohne gültiges Cookie kommt 401; ohne hinterlegte Praxissoftware 400.

### 4.3 Statuszeile in den Einstellungen

`praxissoftwareStatusView()` (`src/lib/practice/bridge/status.ts`) liefert die Zeilen, die
in `/app/einstellungen` unter der Praxissoftware-Auswahl erscheinen:

- **Verbindungszeile**: `Praxissoftware: <Label> — verbunden (nur lesen)` oder
  `— nicht erreichbar`, aus `/health` + `/capabilities` des Adapters.
- **Buchungszeile**: Im aktuellen freigegebenen Stand immer `Termine: werden nur
  vorgemerkt`. Eine spätere Anzeige für eintragen setzt beide Umgebungsfreigaben,
  ein Connector-Schreibrecht und die Betriebsabnahme voraus.
- **Bridge-Zeile** (`formatBridgeLine`): z. B. `Bridge: 12 Halter, 31 Patienten, zuletzt
  synchronisiert vor 4 min, Outbox 0 offen`, oder `Bridge: noch nicht synchronisiert`.
  Zählwerte kommen aus `bridgeRepo(sql).stats(scope)`; schlägt der DB-Zugriff fehl, bleibt
  die Zeile beim "noch nicht synchronisiert"-Text — die Einstellungen-Seite stürzt nie ab.

### 4.4 Outbox-Zustände und Backoff

Jeder Termin-Schreibvorgang landet zunächst als `pending` in `pms_outbox`
(Idempotenzschlüssel = SHA-256 über Praxis, Halter, Patient, Ressource, Startzeit).
`flushOutbox()` (`bridge/sync.ts`) verarbeitet fällige Einträge:

| Ergebnis vom Adapter | Outbox-Status | Wiederholung |
|---|---|---|
| Reserviert für einen Worker | `processing` | fünf Minuten Lease; andere Worker überspringen den Eintrag |
| `ok` | `sent`, `result` = `ConnectorAppointmentResult` | keine |
| `conflict` (Slot vergeben) | `conflict` | **keine** — fachliche Entscheidung bleibt beim Dialog |
| `forbidden` (Schreib-Gate zu) | `forbidden` | **keine** |
| `error` / `timeout` / `notConnected` | bleibt `pending`, `attempts += 1` | `next_attempt_at = jetzt + min(2^attempts, 60) Minuten` |
| `attempts >= 8` | `failed` | keine — endgültig gescheitert |

`createAppointment()` versucht nach dem Enqueue sofort einen synchronen Flush für genau
diesen Eintrag, damit der Dialog eine unmittelbare Antwort bekommt; bei Fehlschlag bleibt
der Eintrag für den Scheduler `pending`, und der Dialog fällt wie bisher auf den
Tafel-Pfad ("Rezeption trägt ein") zurück.

Die Reservierung ist eine einzelne Datenbankoperation mit `FOR UPDATE SKIP LOCKED`.
Auch nach einem konkurrierenden Commit wird Status und Fälligkeit beim Update nochmals
geprüft. Dadurch verarbeitet ein zweiter lokaler Worker keinen bereits reservierten
Eintrag. Nach einem Prozessabbruch kann ein fälliger `processing`-Eintrag erst nach der
Lease erneut versucht werden. Die Regel ist lokal getestet; der Nachweis mit zwei
unabhängigen nativen PostgreSQL-Verbindungen bleibt separat offen.

### 4.5 Offline-Verhalten (Stale-Fallback)

`bridgeReader()` (`bridge/reader.ts`) liefert bei Lesezugriffen (`findOwners`,
`patientsOf`, `resources`, `vets`, `hours`) zuerst einen frischen Bridge-Treffer
(`maxAgeMs`, Default 24 h für Stammdaten, 1 h für Personen). Ist kein frischer Treffer da,
wird der Adapter gefragt; bei Erfolg wird die Bridge aktualisiert. Schlägt der
Adapter-Aufruf fehl und existiert trotzdem ein (auch veralteter) Bridge-Treffer, wird
dieser zurückgegeben — Silvia bleibt auch bei Praxissoftware-Ausfall auskunftsfähig.
`freeSlots` ist davon ausgenommen und geht immer live an den Adapter (Echtzeit-Termine
dürfen nicht aus dem Cache kommen).

Ein vollständiger erfolgreicher Stammdaten-Sync markiert Ressourcen und Tierärzt:innen,
die in der Antwort fehlen, nur weich gelöscht. Auch eine erfolgreiche leere Antwort
bereinigt damit veraltete Cache-Einträge. Bei einem Teilfehler wird nichts aus dem
fehlgeschlagenen Teil gelöscht; der Lauf wird als fehlgeschlagen protokolliert, damit
eine unvollständige Connector-Antwort nie als vollständiger Bestand gilt.

### 4.6 Fluchtweg

Im Notfall (Bridge-DB verursacht Probleme, unklares Verhalten) `SILVIA_PMS_BRIDGE=0`
setzen und den Prozess neu starten. `praxissoftwareRuntime()` liefert dann den nackten
Adapter zurück, ohne die Bridge-DB überhaupt anzufassen — Verhalten wie vor AP 44.

## 5. Neuen Adapter anbinden in 5 Schritten

1. **Datei anlegen**: `src/lib/practice/<vendor>/adapter.ts`, implementiert exakt
   `PraxissoftwarePort` (`src/lib/practice/praxissoftware.ts`).
2. **`registerAdapter()` aufrufen** — beim Laden des eigenen Moduls, damit kein
   Zirkelimport über `bridge/registry.ts` entsteht.
3. **Zeile in `bridge/adapters.ts` ergänzen** — Import nur wegen der
   Registrierungs-Nebenwirkung.
4. **Label in `PMS_OPTIONS`** (`src/lib/practice/praxissoftware.ts`) ergänzen, damit die
   Praxis den neuen Anbieter in Registrierung/Einstellungen auswählen kann.
5. **Tests schreiben** — `node:test` + `node:assert/strict`, und die neue `*.test.ts` in
   `scripts/run-tests.mjs` (`TS_TEST_FILES`) eintragen.

Codeskelett, gegen die echten Typen im Repo geprüft:

```ts
// src/lib/practice/<vendor>/adapter.ts
import {
  notConnectedRead,
  notConnectedWrite,
  notConnected,
  stubPraxissoftwarePort,
  type PraxissoftwareKind,
  type PraxissoftwarePort,
} from "../praxissoftware.ts";
import { registerAdapter } from "../bridge/registry.ts";

const KIND: PraxissoftwareKind = "<vendor>"; // erweitert das PraxissoftwareKind-Literal
const LABEL = "<Anzeigename für PMS_OPTIONS>";

type Env = Record<string, string | undefined>;

export function vendorAdapter(env: Env = process.env): PraxissoftwarePort {
  const baseUrl = String(env.SILVIA_PMS_URL ?? "").trim();
  const token = String(env.SILVIA_PMS_TOKEN ?? "").trim();
  if (!baseUrl) return stubPraxissoftwarePort(KIND, LABEL);

  return {
    kind: KIND,
    label: LABEL,
    host: "other-pc",
    // Tafel-Pfad — bewusst nicht verbunden, siehe Plan Abschnitt 2.
    sendAkte: () => notConnected(),
    sendSlot: () => notConnected(),
    sendKontakt: () => notConnected(),
    // Read-only-Pfad: hier gegen den echten silvia-connector implementieren,
    // niemals Firebird/vendor-SQL direkt ansprechen.
    health: async () => notConnectedRead(),
    capabilities: async () => notConnectedRead(),
    findOwners: async () => notConnectedRead(),
    patientsOf: async () => notConnectedRead(),
    resources: async () => notConnectedRead(),
    vets: async () => notConnectedRead(),
    freeSlots: async () => notConnectedRead(),
    hours: async () => notConnectedRead(),
    createAppointment: async () => notConnectedWrite(),
  };
}

registerAdapter({ kind: KIND, label: LABEL, create: vendorAdapter });
```

```ts
// src/lib/practice/bridge/adapters.ts — eine zusätzliche Zeile
import "../<vendor>/adapter.ts";
```

```ts
// src/lib/practice/praxissoftware.ts — PMS_OPTIONS ergänzen
export const PMS_OPTIONS = [
  VQUADRAT_LABEL,
  "<Anzeigename für PMS_OPTIONS>",
  "vetera",
  // …
] as const;
```

## 6. Grenzen / Nicht-Ziele (nicht verhandelbar)

- Silvia spricht **nie direkt** mit Firebird/Vquadrat. Grenze bleibt `silvia-connector`
  (HTTP, Bearer).
- Keine erfundenen APIs. Adapter-Vertrag = bestehender `PraxissoftwarePort`
  (`src/lib/practice/praxissoftware.ts`).
- Keine Verhaltensänderung an Silvia-Dialogen, Tafel, Telefon. Nur die Datenquelle wechselt.
- `sendAkte`/`sendSlot`/`sendKontakt` bleiben `notConnected` (Tafel-Pfad, bewusst).
- Keine PII in Logs. `raw`-JSON nur in der DB, nie in Konsolenausgaben.
- Alle Tests `node:test` + `node:assert/strict`, keine neuen Test-Frameworks. Neue
  `*.test.ts` **in `scripts/run-tests.mjs` `TS_TEST_FILES` eintragen**.
- Node 20.19: kein `--experimental-strip-types`-only-Syntax, kein `using`, keine
  Node-22-APIs.
- DB-Zugriff ausschließlich über `getSql()` aus `src/lib/db.ts` (Tagged-Template,
  parametrisiert). Kein Kysely für App-Daten.
- Migrationen: `migrations/0010_pms_bridge.sql` ff., idempotent (`if not exists`), eine
  Transaktion.
- Ergebnis-Parität pg/PGLite beachten (int8/date). Zeiten als `timestamptz`, IDs als
  `text`.
- Deutsch in User-Texten und Kommentaren, Englisch in Bezeichnern.

## Abnahme gegen Vquadrat (2026-09-08)

### Lokaler, strikt lesender Connector-Audit (13.09.2026)

`node scripts/connector-readonly-diagnose.mjs` startet ausschließlich den
eigenen Connector aus `C:\silvia-connector-test` kurz auf Loopback. Vor dem
Start verlangt er dessen Vquadrat-Testkonfiguration und die festgelegte
Testkopie; ein gesetzter Connector-Pfad muss per Realpfad genau dorthin
auflösen. Das aktive Datenbankziel sowie das Test-Schreibflag werden nur für
diesen Prozess auf die Testkopie beziehungsweise `0` gesetzt. Geprüft werden
danach nur Health, Auth-Sperre und die Leseendpunkte; die Ausgabe enthält nur
Status und Mengen, keine Personen-, Tier- oder Termininhalte. Der Prozess wird
anschließend beendet. Ein Lauf mit Exit 0 belegt den lokalen Leseweg, nicht
einen Termin- oder GUI-Test.

### Lokaler Bridge-Ende-zu-Ende-Audit (13.09.2026)

`node scripts/vquadrat-bridge-e2e-audit.mjs` erzwingt ebenfalls die Testkopie
und startet ausschließlich den fest verdrahteten lokalen Testconnector; ein anderer
Umgebungspfad wird abgelehnt. Er setzt beide Schreibflags auf `0` und prüft zusätzlich
`health.readOnly=true` sowie `capabilities.write.appointment=false`. Er startet den
Connector selbst und führt Silvia mit einer flüchtigen PGLite-Bridge aus:
Stammdaten-Sync, Halter-Tier-Abgleich, Bridge-Cache, Echtzeit-Slots und leere
Outbox müssen erfolgreich sein. Die Ausgabe enthält ausschließlich diese
Ergebniskennzeichen. Weder die echte Silvia-Tafel noch die Vquadrat-GUI werden
geöffnet oder verändert. Ein Termin-, Fehler-/Rollback- oder GUI-Nachweis
bleibt dadurch ausdrücklich offen.

Der Audit beendet danach den eigenen Loopback-Connector kontrolliert, bevor
der Bridge-Prozess fortfahren darf. Er belegt dann: frische Stammdaten kommen
weiter aus dem Cache ohne neuen Adapterzugriff, freie Slots bleiben gesperrt,
es gab null Schreibaufrufe und die Outbox bleibt leer. Das ist ein lokaler
Ausfallnachweis gegen die Testkopie, kein Termin- oder vollständiger
Rollback-Nachweis.

### Archivierter Altstand

Frühere Protokolle beschrieben Termin-Schreiben und einen produktionsähnlichen
Telefonlauf. Sie sind **kein gültiger Nachweis**, dürfen nicht wiederholt werden und
wurden aus dieser Betriebsanweisung entfernt. Als aktuelle, gültige Grundlage gilt
allein der obige rein lokale Leseaudit. Die beiden technischen Lehren bleiben im Code:
Adapter-Registrierung ist bundlerfest und Betriebslogs enthalten keine Personeninhalte.
