import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deleteComplaint, listComplaints, purgeExpiredComplaints, saveComplaint, updateComplaintStatus } from "./store.server";

test("Beschwerde-Speicher: speichert neu und liest nach einem erneuten Laden", async () => {
    const root = await mkdtemp(join(tmpdir(), "garagen-")); process.env.GARAGEN_DATA_DIR = root;
    await saveComplaint({ reference: "GW-TEST-1", createdAt: "2026-10-01T00:00:00.000Z", location: "Testgarage", category: "Sonstiges", description: "Eine ausreichend lange synthetische Beschwerde.", name: "Test", email: "test@example.invalid", occurredAt: "", contactPhone: "", priority: "normal" });
    assert.equal((await listComplaints())[0].status, "neu");
    delete process.env.GARAGEN_DATA_DIR; await rm(root, { recursive: true, force: true });
});

test("Beschwerde-Speicher: ändert den Status kontrolliert", async () => {
    const root = await mkdtemp(join(tmpdir(), "garagen-")); process.env.GARAGEN_DATA_DIR = root;
    await saveComplaint({ reference: "GW-TEST-2", createdAt: "2026-10-01T00:00:00.000Z", location: "Testgarage", category: "Abrechnung", description: "Eine ausreichend lange synthetische Beschwerde.", name: "Test", email: "test@example.invalid", occurredAt: "", contactPhone: "", priority: "normal" });
    const updated = await updateComplaintStatus("GW-TEST-2", "in_pruefung", "Wir prüfen den Vorgang.");
    assert.equal(updated?.status, "in_pruefung");
    assert.equal(updated?.history.length, 2);
    assert.equal(updated?.history[1]?.response, "Wir prüfen den Vorgang.");
    assert.equal(await updateComplaintStatus("GW-NICHT", "geschlossen"), null);
    delete process.env.GARAGEN_DATA_DIR; await rm(root, { recursive: true, force: true });
});

test("Beschwerde-Speicher: nimmt mehrere Vorgänge nacheinander an", async () => {
    const root = await mkdtemp(join(tmpdir(), "garagen-")); process.env.GARAGEN_DATA_DIR = root;
    const base = { createdAt: "2026-10-01T00:00:00.000Z", location: "Testgarage", category: "Sonstiges", description: "Eine ausreichend lange synthetische Beschwerde.", name: "Test", email: "test@example.invalid", occurredAt: "", contactPhone: "", priority: "normal" as const };
    await saveComplaint({ ...base, reference: "GW-TEST-3" });
    await saveComplaint({ ...base, reference: "GW-TEST-4" });
    assert.equal((await listComplaints()).length, 2);
    delete process.env.GARAGEN_DATA_DIR; await rm(root, { recursive: true, force: true });
});

test("Beschwerde-Speicher: verliert parallele Eingänge nicht", async () => {
    const root = await mkdtemp(join(tmpdir(), "garagen-")); process.env.GARAGEN_DATA_DIR = root;
    const base = { createdAt: "2026-10-01T00:00:00.000Z", location: "Testgarage", category: "Sonstiges", description: "Eine ausreichend lange synthetische Beschwerde.", name: "Test", email: "test@example.invalid", occurredAt: "", contactPhone: "", priority: "normal" as const };
    await Promise.all(Array.from({ length: 10 }, (_, index) => saveComplaint({ ...base, reference: `GW-PAR-${index}` })));
    assert.equal((await listComplaints()).length, 10);
    delete process.env.GARAGEN_DATA_DIR; await rm(root, { recursive: true, force: true });
});

test("Beschwerde-Speicher: entfernt abgelaufene Vorgänge", async () => {
    const root = await mkdtemp(join(tmpdir(), "garagen-")); process.env.GARAGEN_DATA_DIR = root; process.env.GARAGEN_RETENTION_DAYS = "1";
    await saveComplaint({ reference: "GW-TEST-5", createdAt: "2020-01-01T00:00:00.000Z", location: "Testgarage", category: "Sonstiges", description: "Eine ausreichend lange synthetische Beschwerde.", name: "Test", email: "test@example.invalid", occurredAt: "", contactPhone: "", priority: "normal" });
    assert.equal(await purgeExpiredComplaints(Date.parse("2026-10-01T00:00:00.000Z")), 1);
    delete process.env.GARAGEN_DATA_DIR; delete process.env.GARAGEN_RETENTION_DAYS; await rm(root, { recursive: true, force: true });
});

test("Beschwerde-Speicher: löscht einen Vorgang gezielt", async () => {
    const root = await mkdtemp(join(tmpdir(), "garagen-")); process.env.GARAGEN_DATA_DIR = root;
    await saveComplaint({ reference: "GW-TEST-6", createdAt: "2026-10-01T00:00:00.000Z", location: "Testgarage", category: "Sonstiges", description: "Eine ausreichend lange synthetische Beschwerde.", name: "Test", email: "test@example.invalid", occurredAt: "", contactPhone: "", priority: "normal" });
    assert.equal(await deleteComplaint("GW-TEST-6"), true);
    assert.equal((await listComplaints()).length, 0);
    delete process.env.GARAGEN_DATA_DIR; await rm(root, { recursive: true, force: true });
});

test("Beschwerde-Speicher: sichert die letzte gültige Datei vor dem Überschreiben", async () => {
    const root = await mkdtemp(join(tmpdir(), "garagen-")); process.env.GARAGEN_DATA_DIR = root;
    const base = { createdAt: "2026-10-01T00:00:00.000Z", location: "Testgarage", category: "Sonstiges", description: "Eine ausreichend lange synthetische Beschwerde.", name: "Test", email: "test@example.invalid", occurredAt: "", contactPhone: "", priority: "normal" as const };
    await saveComplaint({ ...base, reference: "GW-BACKUP-1" });
    const original = await readFile(join(root, "beschwerden.json"), "utf8");
    await saveComplaint({ ...base, reference: "GW-BACKUP-2" });
    assert.equal(await readFile(join(root, "beschwerden.json.bak"), "utf8"), original);
    delete process.env.GARAGEN_DATA_DIR; await rm(root, { recursive: true, force: true });
});

test("Beschwerde-Speicher: meldet beschädigte Dateien und überschreibt sie nicht", async () => {
    const root = await mkdtemp(join(tmpdir(), "garagen-")); process.env.GARAGEN_DATA_DIR = root;
    const target = join(root, "beschwerden.json");
    const damaged = "{ keine gueltige JSON-Datei";
    await writeFile(target, damaged, "utf8");
    await assert.rejects(listComplaints(), /kann nicht sicher gelesen werden/);
    await assert.rejects(saveComplaint({ reference: "GW-DEFEKT-1", createdAt: "2026-10-01T00:00:00.000Z", location: "Testgarage", category: "Sonstiges", description: "Eine ausreichend lange synthetische Beschwerde.", name: "Test", email: "test@example.invalid", occurredAt: "", contactPhone: "", priority: "normal" }), /kann nicht sicher gelesen werden/);
    assert.equal(await readFile(target, "utf8"), damaged);
    delete process.env.GARAGEN_DATA_DIR; await rm(root, { recursive: true, force: true });
});
