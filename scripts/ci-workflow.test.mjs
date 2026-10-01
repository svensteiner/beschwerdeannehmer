import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

test("CI baut den lokalen Tagesbetrieb vor dem Produktionsaudit", () => {
  const workflow = readFileSync(join(root, ".github", "workflows", "ci.yml"), "utf8");
  const localBuild = workflow.indexOf("- name: Build local desk production");
  const productionAudit = workflow.indexOf("- name: Production security smoke audit");
  const freshInstallAudit = workflow.indexOf("- name: Fresh installation audit");
  const versionSwitchAudit = workflow.indexOf("- name: Version switch audit");
  const appointmentConversationAudit = workflow.indexOf("- name: Appointment conversation audit");
  const backupRestoreAudit = workflow.indexOf("- name: Backup and restore audit");
  const verifyJob = workflow.indexOf("  verify:");
  const verifyCheckout = workflow.indexOf("- name: Checkout", verifyJob);
  const verifyNode = workflow.indexOf("- name: Use Node.js 22", verifyCheckout);

  assert.ok(localBuild >= 0, "lokaler Produktionsbuild fehlt in der CI");
  assert.ok(productionAudit > localBuild, "Produktionsaudit muss nach dem lokalen Build laufen");
  assert.match(
    workflow.slice(localBuild, productionAudit),
    /run: npm run build\s+env:\s+SILVIA_LOCAL_NITRO: "1"/,
  );
  assert.ok(freshInstallAudit > productionAudit, "Frischinstallations-Audit muss nach dem lokalen Produktionsaudit laufen");
  assert.match(workflow.slice(freshInstallAudit), /run: npm run audit:fresh-install/);
  assert.ok(versionSwitchAudit > freshInstallAudit, "Versionswechsel-Audit muss nach der Frischinstallation laufen");
  assert.match(workflow.slice(versionSwitchAudit), /run: npm run audit:version-switch/);
  assert.ok(appointmentConversationAudit > versionSwitchAudit, "Termin-Gesprächsaudit muss nach dem Versionswechsel laufen");
  assert.match(workflow.slice(appointmentConversationAudit), /run: npm run audit:appointment/);
  assert.ok(backupRestoreAudit > appointmentConversationAudit, "Sicherungs-Audit muss nach dem Termin-Gesprächsaudit laufen");
  assert.match(workflow.slice(backupRestoreAudit), /run: npm run audit:backup-restore/);
  assert.match(
    workflow,
    /- name: Audit PostgreSQL appointment slots\s+run: npm run audit:postgres-appointments\s+env:\s+APPOINTMENT_AUDIT_DATABASE_URL: postgresql:\/\/silvia_audit:silvia_audit_only@127\.0\.0\.1:5432\/silvia_audit_test\s+APPOINTMENT_AUDIT_REQUIRED: "1"/,
    "CI muss den Zwei-Verbindungs-Test für Termine ausführen",
  );
  assert.ok(verifyJob >= 0 && verifyCheckout > verifyJob && verifyNode > verifyCheckout, "Windows-Prüfjob unvollständig");
  assert.match(workflow.slice(verifyCheckout, verifyNode), /uses: actions\/checkout@v4\s+with:\s+fetch-depth: 0/, "Versionswechsel-Audit braucht den vollständigen Git-Verlauf");
});
