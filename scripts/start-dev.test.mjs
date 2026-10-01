import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { devStartOptions, viteDevArgv } from "./start-dev.mjs";

test("development start is loopback by default and forwards explicit Vite options safely", () => {
  assert.deepEqual(devStartOptions([], {}), { host: "127.0.0.1", port: 8080 });
  const options = devStartOptions(["--host", "0.0.0.0", "--port=8092", "--open"], {});
  assert.deepEqual(options, { host: "0.0.0.0", port: 8092 });
  assert.deepEqual(
    viteDevArgv(["--host", "0.0.0.0", "--port=8092", "--open"], options),
    ["scripts/with-app-env.mjs", "vite", "dev", "--host", "0.0.0.0", "--port", "8092", "--open"],
  );
});

test("development server refuses a persistent HTTP LAN start before Vite launches", () => {
  const result = spawnSync(process.execPath, ["scripts/start-dev.mjs", "--host", "0.0.0.0"], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
    env: { ...process.env, SILVIA_DATA_DIR: "", DATABASE_URL: "", SILVIA_ALLOW_INSECURE_LAN_TEST: "" },
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Direkter LAN-Start über HTTP ist für Praxisdaten gesperrt/);
});
