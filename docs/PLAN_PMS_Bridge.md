# Plan: PMS-Bridge — eigene Datenbank, gebridged zur Praxissoftware (AP 41–46)

Stand: 2026-09-08. Branch `offline-vquadrat`. Verantwortlich: Senior-Design (Fable), Umsetzung durch AP-Agenten.

## 1. Ziel

Silvia bekommt eine **eigene, herstellerneutrale Praxis-Datenbank** ("Bridge-DB") in der bestehenden
Postgres/PGLite-Instanz. Diese wird über einen **Adapter** mit der jeweiligen Praxissoftware (heute
Vquadrat über `silvia-connector`) synchronisiert. Silvia, Buchung und Tafel lesen künftig **zuerst aus der
Bridge-DB** und fallen nur bei Miss/Stale auf den Live-Adapter zurück. Schreibvorgänge (Termine) laufen
über eine **Outbox** mit Idempotenz und Wiederholung.

Ergebnis: Plug-and-play. Eine neue Praxissoftware = ein neuer Adapter (eine Datei + Registry-Eintrag),
kein Eingriff in Silvia/Buchung/Tafel.

## 2. Nicht-Ziele / Leitplanken (nicht verhandelbar)

- Silvia spricht **nie direkt** mit Firebird/Vquadrat. Grenze bleibt `silvia-connector` (HTTP, Bearer).
- Keine erfundenen APIs. Adapter-Vertrag = bestehender `PraxissoftwarePort` (`src/lib/practice/praxissoftware.ts`).
- Keine Verhaltensänderung an Silvia-Dialogen, Tafel, Telefon. Nur die Datenquelle wechselt.
- `sendAkte/sendSlot/sendKontakt` bleiben `notConnected` (Tafel-Pfad, bewusst).
- Keine PII in Logs. `raw`-JSON nur in der DB, nie in Konsolenausgaben.
- Alle Tests `node:test` + `node:assert/strict`, keine neuen Test-Frameworks. Neue `*.test.ts` **in `scripts/run-tests.mjs` `TS_TEST_FILES` eintragen**.
- Node 20.19: kein `--experimental-strip-types`-only-Syntax, kein `using`, keine Node-22-APIs.
- DB-Zugriff ausschließlich über `getSql()` aus `src/lib/db.ts` (Tagged-Template, parametrisiert). Kein Kysely für App-Daten.
- Migrationen: `migrations/0010_pms_bridge.sql` ff., idempotent (`if not exists`), eine Transaktion.
- Ergebnis-Parität pg/PGLite beachten (int8/date, siehe Kommentar in `db.ts`). Zeiten als `timestamptz`, IDs als `text`.
- Deutsch in User-Texten und Kommentaren, Englisch in Bezeichnern.

## 3. Architektur

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
| `schema.ts` | TS-Typen der Bridge-Zeilen, Hash-Funktion |
| `repo.ts` | Repository: upsert/find/outbox über `Sql` |
| `sync.ts` | SyncEngine: `syncMasterData`, `syncOwnerByPhone`, `flushOutbox` |
| `reader.ts` | `bridgeReader(sql, adapter, opts): PraxissoftwarePort` (read-through, implementiert den **selben Port**) |
| `scheduler.ts` | Intervall-Sync für `npm start` (opt-in per Env) |

## 4. Verträge

### 4.1 Adapter-Registry (`registry.ts`)

```ts
export type PraxissoftwareKind = "vquadrat" | "stub";           // erweitert das bestehende Literal
export interface PraxissoftwareAdapterFactory {
  kind: PraxissoftwareKind;
  label: string;                                                 // z. B. VQUADRAT_LABEL
  create(env?: NodeJS.ProcessEnv): PraxissoftwarePort;
}
export function registerAdapter(f: PraxissoftwareAdapterFactory): void;
export function adapterFor(kindOrLabel: string, env?: NodeJS.ProcessEnv): PraxissoftwarePort; // unbekannt → stub
export function listAdapters(): ReadonlyArray<{ kind; label }>;
```
- `vquadrat` registriert sich mit der bestehenden `vquadratAdapter(env)`-Fabrik.
- `praxissoftwareFor()` in `praxissoftware.ts` delegiert an `adapterFor()` (Verhalten für unbekannte Labels bleibt: Stub).
- Env bleibt Quelle für Live/Offline (`SILVIA_PMS_URL`, `SILVIA_PMS_TOKEN`). Neu: `SILVIA_PMS_KIND` (optional, überschreibt das Profil-Label).

### 4.2 Bridge-Schema (`migrations/0010_pms_bridge.sql`)

Alle Tabellen mit `practice_id text not null` (Mandant), `pms_kind text not null`, `external_id text not null`,
`external_hash text not null`, `raw jsonb not null`, `synced_at timestamptz not null default now()`,
`deleted_at timestamptz null`. Unique `(practice_id, pms_kind, external_id)`.

| Tabelle | Fachfelder |
|---|---|
| `pms_owners` | `name text`, `phone text`, `phone_norm text` (E.164-ähnlich, nur Ziffern, Index), `email text` |
| `pms_patients` | `owner_external_id text`, `name text`, `species text`, `chip text` |
| `pms_resources` | `name text` |
| `pms_vets` | `name text` |
| `pms_hours` | eine Zeile je Praxis: `hours jsonb` (ConnectorHours) |
| `pms_sync_runs` | `id text pk`, `practice_id`, `pms_kind`, `scope text` ('master'\|'owner'\|'outbox'), `started_at`, `finished_at`, `ok boolean`, `stats jsonb`, `error text` |
| `pms_outbox` | `id text pk` (= Idempotenzschlüssel), `practice_id`, `pms_kind`, `kind text` ('appointment'), `payload jsonb`, `status text` ('pending'\|'sent'\|'conflict'\|'forbidden'\|'failed'), `attempts int default 0`, `next_attempt_at timestamptz`, `result jsonb null`, `created_at`, `updated_at` |

`external_hash` = SHA-256 über die kanonisch serialisierten Fachfelder (stabile Key-Reihenfolge). Upsert nur, wenn Hash abweicht.

### 4.3 Repository (`repo.ts`)

```ts
export interface BridgeRepo {
  upsertOwners(p: Scope, rows: ConnectorOwner[]): Promise<{ inserted; updated; unchanged }>;
  upsertPatients(p: Scope, ownerExternalId: string, rows: ConnectorPatient[]): Promise<Counts>;
  upsertResources(p: Scope, rows: ConnectorResource[]): Promise<Counts>;
  upsertVets(p: Scope, rows: ConnectorVet[]): Promise<Counts>;
  saveHours(p: Scope, hours: ConnectorHours): Promise<void>;
  findOwners(p: Scope, q: { phone?: string; name?: string }): Promise<BridgeHit<ConnectorOwner[]>>;
  patientsOf(p: Scope, ownerExternalId: string): Promise<BridgeHit<ConnectorPatient[]>>;
  resources(p: Scope): Promise<BridgeHit<ConnectorResource[]>>;
  vets(p: Scope): Promise<BridgeHit<ConnectorVet[]>>;
  hours(p: Scope): Promise<BridgeHit<ConnectorHours>>;
  enqueue(p: Scope, item: { id: string; kind: "appointment"; payload: ConnectorAppointmentRequest }): Promise<void>;
  dueOutbox(p: Scope, now: Date, limit: number): Promise<OutboxRow[]>;
  markOutbox(id: string, patch: Partial<OutboxRow>): Promise<void>;
  recordRun(run: SyncRun): Promise<void>;
  lastRun(p: Scope, scope: SyncScope): Promise<SyncRun | null>;
}
export type Scope = { practiceId: string; pmsKind: PraxissoftwareKind };
export type BridgeHit<T> = { hit: true; data: T; syncedAt: Date } | { hit: false };
export function bridgeRepo(sql: Sql): BridgeRepo;
```
Namenssuche: `ilike '%' || $q || '%'` auf `name`; Telefonsuche über `phone_norm` (Suffix-Match der letzten 9 Ziffern, wie österreichische Nummern ohne Vorwahlvarianten). Soft-Delete berücksichtigen (`deleted_at is null`).

### 4.4 SyncEngine (`sync.ts`)

```ts
export interface SyncEngine {
  syncMasterData(): Promise<SyncRun>;                 // resources, vets, hours → Bridge
  syncOwnerByPhone(phone: string): Promise<SyncRun>;  // findOwners + patientsOf je Treffer → Bridge
  syncOwnerByName(name: string): Promise<SyncRun>;
  flushOutbox(now?: Date): Promise<SyncRun>;          // sendet fällige Outbox-Einträge über adapter.createAppointment
}
export function syncEngine(deps: { repo: BridgeRepo; adapter: PraxissoftwarePort; scope: Scope; now?: () => Date; log?: (msg: string) => void }): SyncEngine;
```
Outbox-Regeln:
- `ok` → `sent`, `result = ConnectorAppointmentResult`.
- `conflict` / `forbidden` → Endstatus gleichen Namens, **keine** Wiederholung (fachliche Entscheidung liegt beim Dialog).
- `error` / `timeout` / `notConnected` → `attempts+1`, `next_attempt_at = now + min(2^attempts, 60) min`, ab `attempts >= 8` → `failed`.
- Jeder Adapter-Aufruf ist bereits nicht-werfend; SyncEngine wirft ebenfalls nie, sondern liefert `SyncRun{ok:false,error}`.

### 4.5 BridgeReader (`reader.ts`) — Herzstück für Plug-and-play

```ts
export function bridgeReader(deps: { repo: BridgeRepo; adapter: PraxissoftwarePort; scope: Scope; maxAgeMs?: number; now?: () => Date }): PraxissoftwarePort;
```
Implementiert **exakt** `PraxissoftwarePort`:
- `health`, `capabilities`: durchreichen an Adapter (kein Cache).
- `resources`, `vets`, `hours`: Bridge-Treffer und `syncedAt` jünger als `maxAgeMs` (Default 24 h) → zurückgeben. Sonst Adapter; bei `ok` in Bridge upserten und zurückgeben; bei Adapter-Fehler und vorhandenem (auch veraltetem) Bridge-Treffer → Bridge-Daten (Offline-Resilienz). Sonst Adapter-Fehler durchreichen.
- `findOwners`, `patientsOf`: gleiche Strategie, `maxAgeMs` Default 1 h.
- `freeSlots`: **immer** Adapter (Echtzeit), kein Cache.
- `createAppointment`: `enqueue` in Outbox mit `id = sha256(practiceId|ownerId|patientId|resourceId|start)` (Idempotenz), dann sofort `flushOutbox` für genau diesen Eintrag versuchen und das Ergebnis des Adapters **synchron** zurückgeben (Dialog braucht die Antwort). Bei `error/timeout/notConnected` bleibt der Eintrag `pending` für den Scheduler, Rückgabe `{ok:false, reason:"error"}` (Dialog fällt wie heute auf Tafel zurück).
- `sendAkte/sendSlot/sendKontakt`: `notConnected`.

### 4.6 Verdrahtung

- Neue Fabrik `src/lib/practice/praxissoftware-runtime.ts`: `praxissoftwareRuntime(practiceId, pmsLabel, env): Promise<PraxissoftwarePort>` = `bridgeReader({ repo: bridgeRepo(await getSql()), adapter: adapterFor(kind, env), scope })`.
- `ask-alma.ts` (Zeile ~629) und `praxissoftware-import.ts` nutzen `praxissoftwareRuntime(profile.id, profile.pms)` statt `vquadratAdapter()` direkt. `booking.ts` erhält den Port weiter injiziert (keine Änderung dort).
- `vquadratStatusView` wird zu `praxissoftwareStatusView(practiceId, pmsLabel, env)` in `bridge/status.ts`: Zeilen wie heute + "Bridge: 12 Halter, 31 Patienten, zuletzt synchronisiert vor 4 min, Outbox 0 offen".
- API `src/routes/api/pms-sync.ts` (POST, nur eingeloggte Inhaberin, gleiche Session-Prüfung wie `tafel-backup.ts`): führt `syncMasterData` + `flushOutbox` aus, antwortet mit `SyncRun`-JSON.
- `scheduler.ts`: `startBridgeScheduler(env)`; aktiv nur wenn `SILVIA_PMS_SYNC_MINUTES` gesetzt (>0). Läuft im Nitro-Server-Prozess (Einbindung wie andere Server-Startlogik, siehe `server/`). Fehler werden geschluckt und geloggt (ohne PII).

## 5. Arbeitspakete

| AP | Titel | Abhängig von | Dateien |
|---|---|---|---|
| 41 | Adapter-Registry + `SILVIA_PMS_KIND` | – | `bridge/registry.ts`, `praxissoftware.ts` (Delegation), `praxissoftware-vquadrat.ts` (Registrierung), Tests |
| 42 | Bridge-Schema + Repository | – | `migrations/0010_pms_bridge.sql`, `bridge/schema.ts`, `bridge/repo.ts`, Tests gegen PGLite (`SILVIA_DATA_DIR=memory`) |
| 43 | SyncEngine (Pull + Outbox) | 41, 42 | `bridge/sync.ts`, Tests mit Fake-Adapter + Fake-Repo |
| 44 | BridgeReader + Runtime-Fabrik | 41, 42, 43 | `bridge/reader.ts`, `praxissoftware-runtime.ts`, Tests |
| 45 | Verdrahtung: Silvia/Import/Status/API/Scheduler | 44 | `ask-alma.ts`, `praxissoftware-import.ts`, `profile.ts`, `bridge/status.ts`, `routes/api/pms-sync.ts`, `bridge/scheduler.ts`, Tests |
| 46 | Doku + Abnahme | 45 | `docs/PMS-BRIDGE.md` (Betrieb + "Neuen Adapter anbinden in 5 Schritten"), README-Absatz, `STATUS.md` (Desktop), `npm test`, `npm run typecheck`, `npm run build` |

Definition of Done je AP: Typecheck grün, `npm test` grün (bestehende 396 + neue), keine Änderung an Dialogtexten, Commit `AP <n>: <Titel>`.

## 6. Risiken

- **Stale-Daten**: Bridge liefert veraltete Halter/Patienten. Mitigation: kurze `maxAgeMs` für Personen (1 h), Echtzeit für Slots, Status zeigt Sync-Alter.
- **Doppelbuchung**: Outbox-Idempotenz über deterministische ID; Konflikt kein Retry.
- **PGLite-Persistenz**: `.silvia-data` wächst; `raw` bleibt klein (Connector-Objekte sind flach). Soft-Delete, kein Vacuum-Bedarf in Phase 1.
- **Node 20**: `crypto.subtle` vermeiden, `node:crypto` `createHash` verwenden.
