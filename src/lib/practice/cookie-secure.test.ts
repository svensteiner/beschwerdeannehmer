import assert from "node:assert/strict";
import { test } from "node:test";
import { cookieSecureForRequest } from "./cookie-secure.ts";

test("session cookie stays local-only on direct HTTP", () => {
  assert.equal(cookieSecureForRequest({ url: "http://127.0.0.1:8080" }, false), false);
  assert.equal(cookieSecureForRequest({ url: "http://localhost:8080" }, false), false);
});

test("session cookie is secure on HTTPS and rejects forged proxy headers", () => {
  assert.equal(cookieSecureForRequest({ url: "https://silvia.example.test" }, false), true);
  assert.equal(
    cookieSecureForRequest({ url: "http://127.0.0.1:8080", forwardedProto: "https" }, false),
    false,
  );
});

test("explicit proxy mode fails closed when its protocol header is missing or wrong", () => {
  assert.equal(cookieSecureForRequest({ url: "http://127.0.0.1:8080", forwardedProto: "https" }, true), true);
  assert.equal(cookieSecureForRequest({ url: "http://127.0.0.1:8080", forwardedProto: "http" }, true), true);
  assert.equal(cookieSecureForRequest(undefined, true), true);
});
