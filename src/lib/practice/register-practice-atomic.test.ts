import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

/**
 * Registrierung (Migration 0026).
 *
 * Praxis, Benutzer und Sitzung entstehen in EINER Transaktion. Vorher waren es
 * drei einzelne Anweisungen: schlug eine spaetere fehl, blieb eine halbe
 * Registrierung stehen. Ausserdem liefen die Pruefungen (E-Mail vergeben?
 * Ordination vorhanden?) getrennt vom Anlegen, sodass zwei gleichzeitige
 * Anfragen beide bestehen konnten.
 */

function payload(name: string, owner: string, phone: string, email: string) {
  return JSON.stringify({
    name,
    owner_name: owner,
    phone,
    email,
    bundesland: "Wien",
    city: "Wien",
    street: "Testgasse 1",
    zip: "1010",
    pms: "",
    whatsapp: "",
    hours_json: "[]",
    nachtdienst_name: "",
    nachtdienst_phone: "",
    nachtdienst_note: "",
    location_hint: "Innenhof",
  });
}

test("register_practice_atomic legt alles zusammen an und sichert gegen Doppelte", async () => {
  const pg = new PGlite();
  await pg.waitReady;
  try {
    const dir = join(process.cwd(), "migrations");
    for (const name of (await readdir(dir)).filter((n) => n.endsWith(".sql")).sort()) {
      await pg.exec(await readFile(join(dir, name), "utf8"));
    }

    const register = async (
      practiceId: string,
      sessionId: string,
      email: string,
      tenant: boolean,
      token = `tok-${sessionId}`,
    ) => {
      const rows = await pg.query<{ status: string }>(
        `select register_practice_atomic($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10) as status`,
        [
          practiceId,
          `user-${practiceId}`,
          sessionId,
          payload(`Ordination ${practiceId}`, `Dr. ${practiceId}`, "0316 123", email),
          `ordination-${practiceId}`,
          email,
          "hash",
          token,
          new Date(Date.now() + 86_400_000).toISOString(),
          tenant,
        ],
      );
      return rows.rows[0]?.status;
    };

    // Eine vollstaendige Registrierung legt genau drei Zeilen an.
    assert.equal(await register("p1", "s1", "a@example.invalid", true), "created");
    const counts = await pg.query<{ p: number; u: number; s: number }>(`select
      (select count(*)::int from practices) as p,
      (select count(*)::int from practice_users) as u,
      (select count(*)::int from practice_sessions) as s`);
    assert.equal(counts.rows[0]?.p, 1, "genau eine Praxis");
    assert.equal(counts.rows[0]?.u, 1, "genau ein Benutzer");
    assert.equal(counts.rows[0]?.s, 1, "genau eine Sitzung");

    // Eine bereits vergebene E-Mail wird abgelehnt, nicht die zweite Ordination.
    assert.equal(await register("p2", "s2", "a@example.invalid", true), "email_taken");

    // Ein-Ordination-Regel (PGLite) greift innerhalb der Sperre.
    assert.equal(await register("p3", "s3", "c@example.invalid", true), "second_practice");
    // Mehrtenant (Postgres) laesst eine zweite Ordination zu.
    assert.equal(await register("p4", "s4", "d@example.invalid", false), "created");

    // Atomaritaet: die Sitzung nutzt einen bereits vergebenen Token (unique).
    // Der Insert scheitert und die ganze Funktion rollt zurueck - es darf
    // keine Praxis ohne Benutzer und keine verwaiste Zeile bleiben.
    const before = await pg.query<{ n: number }>(`select count(*)::int as n from practices`);
    await assert.rejects(
      () => register("p9", "s9", "x@example.invalid", false, "tok-s1"),
      "ein Fehler in der Mitte muss die Funktion ablehnen",
    );
    const after = await pg.query<{ n: number }>(`select count(*)::int as n from practices`);
    assert.equal(after.rows[0]?.n, before.rows[0]?.n, "keine halbe Registrierung");
    const orphan = await pg.query<{ n: number }>(
      `select count(*)::int as n from practice_users where practice_id = 'p9'`,
    );
    assert.equal(orphan.rows[0]?.n, 0, "kein verwaister Benutzer");

    // Zwei gleichzeitige Registrierungen mit derselben E-Mail: genau eine
    // gewinnt, die andere wird kontrolliert abgelehnt.
    const parallel = await Promise.all([
      register("pc1", "sc1", "parallel@example.invalid", false),
      register("pc2", "sc2", "parallel@example.invalid", false),
    ]);
    assert.equal(parallel.filter((s) => s === "created").length, 1, "genau eine Registrierung gewinnt");
    assert.equal(parallel.filter((s) => s === "email_taken").length, 1, "die andere wird abgelehnt");

    // Der Slug entsteht mit der Praxis zusammen.
    const slug = await pg.query<{ slug: string }>(`select slug from practices where id = 'p1'`);
    assert.equal(slug.rows[0]?.slug, "ordination-p1");
  } finally {
    await pg.close();
  }
});
