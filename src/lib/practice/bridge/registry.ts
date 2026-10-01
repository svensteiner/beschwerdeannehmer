/**
 * Adapter-Registry für Praxissoftware-Ports (AP 41).
 *
 * Plug-and-play: eine neue Praxissoftware = eine neue Fabrik-Datei + ein
 * `registerAdapter(...)`-Aufruf dort, kein Eingriff hier.
 *
 * Wichtig für die Import-Reihenfolge (siehe Plan Abschnitt 4.1): Diese Datei
 * importiert absichtlich KEINE konkreten Adapter (z. B. `praxissoftware-vquadrat.ts`)
 * auf Modulebene — sonst entsteht ein Zirkelimport (`praxissoftware.ts` →
 * `registry.ts` → `praxissoftware-vquadrat.ts` → `praxissoftware.ts`). Stattdessen
 * registriert sich jeder Adapter selbst, indem er `registerAdapter()` beim Laden
 * seines eigenen Moduls aufruft. `bridge/adapters.ts` importiert alle Adapter-Module
 * nur wegen ihrer Nebenwirkung (Registrierung) und reicht `adapterFor` durch — das
 * ist die Datei, die Aufrufer tatsächlich importieren, wenn sie alle Adapter brauchen.
 */

import {
  praxissoftwareKindOf,
  stubPraxissoftwarePort,
  type PraxissoftwareKind,
  type PraxissoftwarePort,
} from "../praxissoftware.ts";

export interface PraxissoftwareAdapterFactory {
  kind: PraxissoftwareKind;
  label: string;
  create(env?: NodeJS.ProcessEnv): PraxissoftwarePort;
}

/** Modul-globale Registry. Idempotent nach `kind`, damit Dev-HMR nicht doppelt registriert. */
const registry = new Map<PraxissoftwareKind, PraxissoftwareAdapterFactory>();

export function registerAdapter(factory: PraxissoftwareAdapterFactory): void {
  registry.set(factory.kind, factory);
}

/**
 * Live-Befund 2026-09-08: Im Nitro-Build kann dieses Modul in mehr als einem Chunk
 * landen — dann sieht der Anruf-Pfad eine leere Map, obwohl `adapters.ts` registriert
 * hat. Deshalb löst `adapterFor` zusätzlich über eine statische Tabelle auf, die der
 * Aufrufer mitgibt (`adapters.ts`). Registry bleibt für Tests/Erweiterungen.
 */
function lookup(kind: string, builtin?: ReadonlyMap<string, PraxissoftwareAdapterFactory>): PraxissoftwareAdapterFactory | undefined {
  return registry.get(kind as PraxissoftwareKind) ?? builtin?.get(kind);
}

/**
 * Auflösung, wie im Plan (4.1) beschrieben:
 * 1. `env.SILVIA_PMS_KIND`, falls gesetzt UND registriert
 * 2. `kindOrLabel` direkt als `kind` (registriert)
 * 3. `kindOrLabel` als Label über `praxissoftwareKindOf()`
 * Unbekannt → Stub (nie werfend, nie `null`).
 */
export function adapterFor(
  kindOrLabel: string,
  env: NodeJS.ProcessEnv = process.env,
  builtin?: ReadonlyMap<string, PraxissoftwareAdapterFactory>,
): PraxissoftwarePort {
  const override = String(env?.SILVIA_PMS_KIND ?? "").trim();
  if (override) {
    const byOverride = lookup(override, builtin);
    if (byOverride) return byOverride.create(env);
  }

  const direct = lookup(kindOrLabel, builtin);
  if (direct) return direct.create(env);

  const kind = praxissoftwareKindOf(kindOrLabel);
  if (kind) {
    const byKind = lookup(kind, builtin);
    if (byKind) return byKind.create(env);
  }

  const label = String(kindOrLabel ?? "").trim() || "Unbekannt";
  return stubPraxissoftwarePort("stub", label);
}

export function listAdapters(): ReadonlyArray<{ kind: PraxissoftwareKind; label: string }> {
  return [...registry.values()].map((f) => ({ kind: f.kind, label: f.label }));
}
