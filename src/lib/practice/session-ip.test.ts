import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveClientIp } from "./client-ip.ts";

test("client IP ignores spoofable forwarding headers by default", () => {
  assert.equal(resolveClientIp("203.0.113.7", "198.51.100.2", "198.51.100.3"), "203.0.113.7");
  assert.equal(resolveClientIp("203.0.113.7", "198.51.100.2, 10.0.0.1", null, true), "198.51.100.2");
  assert.equal(resolveClientIp("203.0.113.7", "not-an-ip", "::1", true), "203.0.113.7");
  assert.equal(resolveClientIp("203.0.113.7", "not-an-ip", "also-not-an-ip", true), "203.0.113.7");
  assert.equal(resolveClientIp(undefined, "198.51.100.2", null), "unknown");
  assert.equal(resolveClientIp("2001:db8::7", null, null), "2001:db8::7");
  assert.equal(resolveClientIp("203.0.113.7", "invalid, 198.51.100.2", null, true), "203.0.113.7");
  assert.equal(resolveClientIp("203.0.113.7", "198.51.100.2," + "x".repeat(300), null, true), "203.0.113.7");
  assert.equal(resolveClientIp("203.0.113.7", null, "x".repeat(300), true), "203.0.113.7");
  assert.equal(resolveClientIp(undefined, null, "2001:db8::2", true), "2001:db8::2");
  assert.equal(resolveClientIp("invalid", "invalid", "198.51.100.2", true), "unknown");
});
