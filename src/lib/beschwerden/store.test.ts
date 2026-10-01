import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
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
    assert.equal((await updateComplaintStatus("GW-TEST-2", "in_pruefung"))?.status, "in_pruefung");
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
