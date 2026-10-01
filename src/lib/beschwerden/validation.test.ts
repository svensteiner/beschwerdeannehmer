import test from "node:test";
import assert from "node:assert/strict";
import { validateComplaint } from "./validation";

const valid = { location: "Garage Zentrum", category: "Abrechnung", description: "Eine ausreichend lange synthetische Beschwerde.", name: "Test", email: "test@example.invalid", consent: "yes" };

test("Beschwerde-Validierung akzeptiert vollständige Eingaben", () => assert.equal(validateComplaint(valid).ok, true));
test("Beschwerde-Validierung weist unbekannte Kategorie ab", () => assert.equal(validateComplaint({ ...valid, category: "SQL" }).ok, false));
test("Beschwerde-Validierung begrenzt überlange Texte", () => assert.equal(validateComplaint({ ...valid, description: "x".repeat(5001) }).ok, false));
test("Beschwerde-Validierung prüft E-Mail statt nur auf @", () => assert.equal(validateComplaint({ ...valid, email: "nicht-gültig" }).ok, false));
test("Beschwerde-Validierung verwirft ausgefülltes Honeypot-Feld", () => assert.equal(validateComplaint({ ...valid, website: "bot" }).ok, false));
test("Beschwerde-Validierung akzeptiert übliches Telefonformat", () => assert.equal(validateComplaint({ ...valid, contactPhone: "+43 (1) 234-56" }).ok, true));
test("Beschwerde-Validierung weist ungültige Telefonnummer ab", () => assert.equal(validateComplaint({ ...valid, contactPhone: "javascript:alert(1)" }).ok, false));
test("Beschwerde-Validierung weist ungültigen Zeitpunkt ab", () => assert.equal(validateComplaint({ ...valid, occurredAt: "kein datum" }).ok, false));
