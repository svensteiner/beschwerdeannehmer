/**
 * Registriert alle bekannten Praxissoftware-Adapter — EXPLIZIT, nicht per Nebeneffekt.
 *
 * Befund Live-Test 2026-09-08: package.json hat `"sideEffects": false`, der Bundler
 * (Vite/Rolldown im Nitro-Build) wirft einen reinen `import "../vquadrat/adapter.ts"`
 * deshalb weg. In den Unit-Tests (tsx) lief die Registrierung, im Produktions-Build
 * blieb der Vquadrat-Adapter unregistriert und Silvia lief still auf dem Stub.
 * Darum: benannter Import + Aufruf hier, das kann kein Bundler entfernen.
 *
 * `registry.ts` kennt bewusst keine konkreten Adapter (Zirkelimport). Aufrufer nehmen
 * `adapterFor()` aus DIESER Datei. Neuer Adapter = Import + `registerAdapter(...)` hier.
 */

import { VQUADRAT_KIND, VQUADRAT_LABEL } from "../praxissoftware.ts";
import { vquadratAdapter } from "../vquadrat/adapter.ts";
import { adapterFor as resolveAdapter, registerAdapter, type PraxissoftwareAdapterFactory } from "./registry.ts";
import type { PraxissoftwarePort } from "../praxissoftware.ts";

const VQUADRAT: PraxissoftwareAdapterFactory = { kind: VQUADRAT_KIND, label: VQUADRAT_LABEL, create: vquadratAdapter };

/** Statische Tabelle — unabhängig von Modul-Instanzen/Chunks des Bundlers. Neuer Adapter: Zeile hier. */
const BUILTIN: ReadonlyMap<string, PraxissoftwareAdapterFactory> = new Map([[VQUADRAT.kind, VQUADRAT]]);

registerAdapter(VQUADRAT);

export function adapterFor(kindOrLabel: string, env: NodeJS.ProcessEnv = process.env): PraxissoftwarePort {
  return resolveAdapter(kindOrLabel, env, BUILTIN);
}

export { listAdapters, registerAdapter } from "./registry.ts";
export type { PraxissoftwareAdapterFactory } from "./registry.ts";
