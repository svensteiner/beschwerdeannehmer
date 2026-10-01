import assert from "node:assert/strict";
import { test } from "node:test";
import { detectEndCall, isLocalOrLanIp, isValidPhoneBearer, timingSafeEqual } from "./phone-auth.ts";

test("timingSafeEqual compares full strings, not just length", () => {
  assert.equal(timingSafeEqual("abc", "abc"), true);
  assert.equal(timingSafeEqual("abc", "abd"), false);
  assert.equal(timingSafeEqual("abc", "abcd"), false);
  assert.equal(timingSafeEqual("", ""), true);
});

test("isValidPhoneBearer accepts only an exact Bearer match", () => {
  assert.equal(isValidPhoneBearer("Bearer secret123", "secret123"), true);
  assert.equal(isValidPhoneBearer("Bearer wrong", "secret123"), false);
  assert.equal(isValidPhoneBearer("secret123", "secret123"), false, "missing Bearer prefix");
  assert.equal(isValidPhoneBearer(null, "secret123"), false);
  assert.equal(isValidPhoneBearer("Bearer secret123", undefined), false, "fail-closed without configured token");
  assert.equal(isValidPhoneBearer("Bearer secret123", ""), false, "fail-closed on empty token");
  assert.equal(isValidPhoneBearer("Bearer  padded  ", "padded"), true, "trims surrounding whitespace");
});

test("isLocalOrLanIp allows loopback and private ranges only", () => {
  assert.equal(isLocalOrLanIp("127.0.0.1"), true);
  assert.equal(isLocalOrLanIp("::1"), true);
  assert.equal(isLocalOrLanIp("::ffff:127.0.0.1"), true);
  assert.equal(isLocalOrLanIp("10.0.5.2"), true);
  assert.equal(isLocalOrLanIp("172.16.0.1"), true);
  assert.equal(isLocalOrLanIp("172.31.255.255"), true);
  assert.equal(isLocalOrLanIp("172.32.0.1"), false, "just outside the 172.16-31 range");
  assert.equal(isLocalOrLanIp("192.168.1.50"), true);
  assert.equal(isLocalOrLanIp("8.8.8.8"), false);
  assert.equal(isLocalOrLanIp("unknown"), false);
  assert.equal(isLocalOrLanIp(""), false);
});

test("detectEndCall recognizes German farewell phrases at the end of a reply", () => {
  assert.equal(detectEndCall("Alles klar, auf Wiederhören."), true);
  assert.equal(detectEndCall("Danke fürs Anrufen, auf Wiedersehen!"), true);
  assert.equal(detectEndCall("Ich wünsche Ihnen noch einen schönen Tag."), true);
  assert.equal(detectEndCall("Ich lege Ihnen einen Termin am Montag."), false);
  assert.equal(detectEndCall(""), false);
});

test("isLocalOrLanIp laesst sich nicht per Praefix taeuschen", () => {
  // Vorher entschied `startsWith("127.")` VOR der Oktett-Pruefung: jeder Name,
  // der so beginnt, galt als lokale Adresse.
  assert.equal(isLocalOrLanIp("127.invalid"), false);
  assert.equal(isLocalOrLanIp("127.evil.example"), false);
  assert.equal(isLocalOrLanIp("127.0.0.1.evil"), false);
  assert.equal(isLocalOrLanIp("127."), false);
  assert.equal(isLocalOrLanIp("127"), false);
  // Leere Oktette wurden ueber Number("") still zu 0.
  assert.equal(isLocalOrLanIp("127..0.1"), false);
  assert.equal(isLocalOrLanIp("10..0.1"), false);
  // Nur Ziffern je Oktett, und kein Port in der Adresse.
  assert.equal(isLocalOrLanIp("10.0.0.0x1"), false);
  assert.equal(isLocalOrLanIp("192.168.1.1:3000"), false);
  // Echte Loopback- und LAN-Adressen bleiben erlaubt.
  assert.equal(isLocalOrLanIp("127.0.0.1"), true);
  assert.equal(isLocalOrLanIp("127.5.5.5"), true, "127.0.0.0/8 ist ganz Loopback");
  assert.equal(isLocalOrLanIp("::ffff:127.0.0.1"), true);
  assert.equal(isLocalOrLanIp("::ffff:192.168.1.7"), true);
  assert.equal(isLocalOrLanIp("10.1.2.3"), true);
  assert.equal(isLocalOrLanIp("172.20.0.9"), true);
});

test("detectEndCall legt bei zitiertem Abschied nicht auf", () => {
  // Gemeldet: „Sie sagten: bis bald“ loeste direkt ein Gespraechsende aus,
  // obwohl es die Wiedergabe der Worte der Anruferin ist.
  assert.equal(detectEndCall("Sie sagten: bis bald"), false);
  assert.equal(detectEndCall("Sie sagten: auf Wiederhören"), false);
  assert.equal(detectEndCall("Sie haben gesagt: bis bald"), false);
  assert.equal(detectEndCall("Ich habe notiert: bis bald"), false);
  // Auch ausdruecklich in Anfuehrungszeichen.
  assert.equal(detectEndCall("Sie sagten „bis bald“"), false);
  assert.equal(detectEndCall('Sie sagten "bis bald"'), false);
  // Eine echte eigene Verabschiedung bleibt ein Gespraechsende.
  assert.equal(detectEndCall("Gerne. Auf Wiederhören!"), true);
  assert.equal(detectEndCall("Danke, auf Wiederhören."), true);
  assert.equal(detectEndCall("Ich wünsche Ihnen einen schönen Tag noch."), true);
  // Und eine Aufgabe bleibt eine Aufgabe.
  assert.equal(detectEndCall("Ich notiere bis bald als Rückrufwunsch."), false);
});
