import { createServerFn } from "@tanstack/react-start";
import { registerDeskExistingOf, registerDeskFormOn } from "./desk-storage";

/** One-shot dump Inhaberin email after Tafel holen without a session. */
export const loadHolenLoginEmail = createServerFn({ method: "GET" }).handler(async () => {
  const { isTafelAnzeige } = await import("@/lib/pglite-anzeige");
  const { resolvePgliteDataDir } = await import("@/lib/pglite-data-dir");
  const { takeHolenLoginEmailForDesk } = await import("@/lib/pglite-holen-pending");
  return takeHolenLoginEmailForDesk(resolvePgliteDataDir(), isTafelAnzeige());
});

/** One-shot fail line after Tafel holen did not apply — old Tafel remains. */
export const loadHolenFailNotice = createServerFn({ method: "GET" }).handler(async () => {
  const { isTafelAnzeige } = await import("@/lib/pglite-anzeige");
  const { resolvePgliteDataDir } = await import("@/lib/pglite-data-dir");
  const { takeHolenFailForDesk } = await import("@/lib/pglite-holen-pending");
  return takeHolenFailForDesk(resolvePgliteDataDir(), isTafelAnzeige());
});

/** Empfang PC — Anmelden / Registrieren show Nur-Anzeige before login. */
export const loadTafelAnzeigeFlag = createServerFn({ method: "GET" }).handler(async () => {
  const { isTafelAnzeige } = await import("@/lib/pglite-anzeige");
  return isTafelAnzeige();
});

/** PGLite already has a Tafel — hide Ordination eröffnen on Anmelden / Startseite. */
export const loadDeskRegisterCta = createServerFn({ method: "GET" }).handler(async () => {
  const { isTafelAnzeige } = await import("@/lib/pglite-anzeige");
  const { resolvePgliteDataDir } = await import("@/lib/pglite-data-dir");
  const { holenPendingIsOpen, holenPendingShouldWait } = await import("@/lib/pglite-holen-pending");
  const anzeige = isTafelAnzeige();
  const dir = resolvePgliteDataDir();
  if (holenPendingShouldWait({ anzeige, open: holenPendingIsOpen(dir) })) return false;
  const { dbSource, getSql } = await import("@/lib/db.server");
  if (dbSource !== "pglite") return true;
  const sql = await getSql();
  const rows = await sql<{ n: number }>`select count(*)::int as n from practices`;
  return registerDeskFormOn({
    anzeige,
    existing: registerDeskExistingOf({
      anzeige,
      pglite: true,
      practiceCount: Number(rows[0]?.n ?? 0),
    }),
  });
});

/** Registrieren: fail sidecar + whether this PGLite folder already has a Tafel. */
export const loadRegisterDeskNotice = createServerFn({ method: "GET" }).handler(async () => {
  const { isTafelAnzeige } = await import("@/lib/pglite-anzeige");
  const { resolvePgliteDataDir } = await import("@/lib/pglite-data-dir");
  const { holenPendingIsOpen, holenPendingShouldWait, takeHolenFailForDesk } = await import(
    "@/lib/pglite-holen-pending"
  );
  const dir = resolvePgliteDataDir();
  const anzeige = isTafelAnzeige();
  if (holenPendingShouldWait({ anzeige, open: holenPendingIsOpen(dir) })) {
    return { fail: "", existing: false, anzeige };
  }
  const fail = takeHolenFailForDesk(dir, anzeige) ?? "";
  const { dbSource, getSql } = await import("@/lib/db.server");
  if (dbSource !== "pglite") {
    return { fail, existing: registerDeskExistingOf({ anzeige, pglite: false }), anzeige };
  }
  const sql = await getSql();
  const rows = await sql<{ n: number }>`select count(*)::int as n from practices`;
  return {
    fail,
    existing: registerDeskExistingOf({
      anzeige,
      pglite: true,
      practiceCount: Number(rows[0]?.n ?? 0),
    }),
    anzeige,
  };
});
