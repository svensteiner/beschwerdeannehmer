import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const root = resolve(process.cwd());
const buildRoot = await realpath(resolve(process.argv[2] || ""));
const tempRoot = await realpath(tmpdir());
assert(buildRoot.startsWith(join(tempRoot, "silvia-home-audit-")), "Nur eine explizite isolierte Temp-Buildkopie ist erlaubt.");
const audit = process.argv[3] || "privacy-practice-facts-audit.mjs";
assert(["privacy-practice-facts-audit.mjs", "privacy-practice-stt-audit.mjs"].includes(audit), "Nur bekannte Praxistrennungs-Audits sind erlaubt.");

async function seed(dataDir) {
  const db = new PGlite({ dataDir });
  await db.waitReady;
  try {
    await db.exec("create table _migrations (name text primary key, applied_at timestamptz not null default now())");
    const migrations = (await readdir(join(root, "migrations"))).filter((name) => name.endsWith(".sql")).sort();
    for (const name of migrations) {
      await db.exec(await readFile(join(root, "migrations", name), "utf8"));
      await db.query("insert into _migrations (name) values ($1)", [name]);
    }
    for (const [side, token, fact] of [
      ["a", "silvia-audit-token-a", "Auditregel A: nur am Vormittag."],
      ["b", "silvia-audit-token-b", "Auditregel B: nur nach Termin."],
    ]) {
      const practiceId = `audit-privacy-practice-${side}`;
      const userId = `audit-privacy-user-${side}`;
      await db.query("insert into practices (id,name,owner_name,email) values ($1,$2,$3,$4)", [practiceId, `Audit Praxis ${side.toUpperCase()}`, `Audit ${side.toUpperCase()}`, `audit-${side}@example.test`]);
      await db.query("insert into practice_users (id,practice_id,email,password_hash,name,role) values ($1,$2,$3,$4,$5,$6)", [userId, practiceId, `audit-${side}@example.test`, `audit-${side}`, `Audit ${side.toUpperCase()}`, "inhaberin"]);
      await db.query("insert into practice_sessions (id,user_id,token_hash,expires_at) values ($1,$2,$3,$4)", [`${userId}-session`, userId, createHash("sha256").update(token).digest("hex"), "2099-01-01T00:00:00.000Z"]);
      await db.query("insert into practice_facts (id,practice_id,fact) values ($1,$2,$3)", [`${practiceId}-fact`, practiceId, fact]);
      await db.query("insert into hoer_corrections (id,practice_id,heard,corrected,created_at) values ($1,$2,$3,$4,$5)", [`${practiceId}-correction`, practiceId, `gehoert-${side}`, `PraxiswortAudit${side.toUpperCase()}`, "2026-09-12T12:00:00.000Z"]);
    }
  } finally {
    await db.close();
  }
}

const fixtureRoot = await mkdtemp(join(tempRoot, "silvia-privacy-facts-"));
const dataDir = join(fixtureRoot, "data");
let mock;
try {
  await seed(dataDir);
  const mockPrompts = [];
  let localSttUrl = "";
  if (audit === "privacy-practice-stt-audit.mjs") {
    mock = createServer(async (request, response) => {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      assert.equal(request.method, "POST");
      assert.equal(request.url, "/v1/audio/transcriptions");
      mockPrompts.push(Buffer.concat(chunks).toString("utf8"));
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ text: "synthetische erkennung" }));
    });
    await new Promise((yes, no) => mock.once("error", no).listen(0, "127.0.0.1", yes));
    const address = mock.address();
    assert(address && typeof address !== "string", "Lokaler STT-Mock hat keinen Loopback-Port.");
    localSttUrl = `http://127.0.0.1:${address.port}/v1/audio/transcriptions`;
  }
  const child = spawn(process.execPath, [join(root, "scripts", "run-homepage-audit.mjs"), buildRoot, audit], {
    cwd: root,
    windowsHide: true,
    stdio: "inherit",
    env: {
      ...Object.fromEntries(Object.entries(process.env).filter(([key]) =>
        /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA)$/i.test(key))),
      AUDIT_DATA_DIR: dataDir,
      AUDIT_PRACTICE_A_TOKEN: "silvia-audit-token-a",
      AUDIT_PRACTICE_B_TOKEN: "silvia-audit-token-b",
      AUDIT_LOCAL_STT_URL: localSttUrl,
    },
  });
  const [code] = await once(child, "exit");
  assert.equal(code, 0, "Der Praxistrennungs-Audit ist fehlgeschlagen.");
  if (audit === "privacy-practice-stt-audit.mjs") {
    assert.equal(mockPrompts.length, 4, "Der lokale STT-Mock muss genau vier echte ServerFn-Anfragen erhalten.");
    const [demo, practiceA, practiceB, stringTrue] = mockPrompts;
    for (const prompt of [demo, practiceA, practiceB, stringTrue]) assert.match(prompt, /Ordination/);
    assert.match(demo, /DemoWortAudit/);
    assert.doesNotMatch(demo, /PraxiswortAuditA|PraxiswortAuditB/);
    assert.match(practiceA, /PraxiswortAuditA/);
    assert.doesNotMatch(practiceA, /DemoWortAudit|PraxiswortAuditB/);
    assert.match(practiceB, /PraxiswortAuditB/);
    assert.doesNotMatch(practiceB, /DemoWortAudit|PraxiswortAuditA/);
    assert.match(stringTrue, /PraxiswortAuditA/);
    assert.doesNotMatch(stringTrue, /DemoWortAudit|PraxiswortAuditB/);
    const result = { ok: true, requests: 4, localMock: "loopback STT transport only; no recognition-quality claim", promptIsolation: true };
    await writeFile(join(root, "artifacts", "privacy-practice-stt-audit.json"), `${JSON.stringify(result)}\n`);
    console.log(JSON.stringify(result));
  }
} finally {
  if (mock) await new Promise((yes) => mock.close(yes));
  const ownRoot = await realpath(fixtureRoot);
  assert.equal(basename(ownRoot).startsWith("silvia-privacy-facts-"), true, "Unsichere Fixture-Bereinigung verweigert.");
  assert.equal(dirname(ownRoot).toLowerCase(), tempRoot.toLowerCase(), "Fixture liegt nicht direkt unter Temp.");
  await rm(ownRoot, { recursive: true, force: true });
}
