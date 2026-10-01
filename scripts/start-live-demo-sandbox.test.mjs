import test from "node:test";
import assert from "node:assert/strict";
import { liveSandboxConfig, parseLiveSandboxArgs, sandboxChildEnv } from "./start-live-demo-sandbox.mjs";

test("requires explicit confirmation and validates port", () => {
  assert.throws(() => parseLiveSandboxArgs([]), /confirm-synthetic/);
  assert.throws(() => parseLiveSandboxArgs(["--confirm-synthetic", "--port", "80"]), /Ungültiger Port/);
  assert.deepEqual(parseLiveSandboxArgs(["--confirm-synthetic", "--port=9000"]), { confirmed: true, port: 9000 });
});
test("requires key and existing absolute guard", () => {
  const readyIo = { realpath: (path) => path, stat: () => ({ isDirectory: () => true }) };
  assert.equal(liveSandboxConfig({ env: { OPENAI_API_KEY: "x", SILVIA_LIVE_GUARD_DIR: "C:\\silvia-live-guard" }, ...readyIo }).ok, true);
  assert.equal(liveSandboxConfig({ env: { OPENAI_API_KEY: "x", SILVIA_LIVE_GUARD_DIR: "C:\\Temp\\silvia-live-guard" }, ...readyIo }).ok, false);
  assert.equal(liveSandboxConfig({ env: { SILVIA_LIVE_GUARD_DIR: "C:\\silvia-live-guard" }, ...readyIo }).ok, false);
  assert.equal(liveSandboxConfig({ env: { OPENAI_API_KEY: "x", SILVIA_LIVE_GUARD_DIR: "relative" } }).ok, false);
});
test("child environment stays isolated", () => {
  const child = sandboxChildEnv({ OPENAI_API_KEY: "secret", DATABASE_URL: "postgres", HOST: "0.0.0.0" }, 8093);
  assert.equal(child.SILVIA_DATA_DIR, "memory"); assert.equal(child.DATABASE_URL, ""); assert.equal(child.HOST, "127.0.0.1"); assert.equal(child.PORT, "8093");
});
