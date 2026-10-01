import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { DEFAULT_PGLITE_DIR_NAME, resolvePgliteDataDir } from "./pglite-data-dir.ts";

test("defaults to .silvia-data under cwd so a restart keeps the Ordination", () => {
  assert.equal(resolvePgliteDataDir({}, "/ordi"), join("/ordi", DEFAULT_PGLITE_DIR_NAME));
  assert.equal(resolvePgliteDataDir({ SILVIA_DATA_DIR: "  " }, "/ordi"), join("/ordi", DEFAULT_PGLITE_DIR_NAME));
});

test("memory flags keep the in-RAM wipe-on-restart path", () => {
  assert.equal(resolvePgliteDataDir({ SILVIA_DATA_DIR: "memory" }, "/ordi"), undefined);
  assert.equal(resolvePgliteDataDir({ SILVIA_DATA_DIR: "MEMORY://" }, "/ordi"), undefined);
  assert.equal(resolvePgliteDataDir({ SILVIA_DATA_DIR: ":memory:" }, "/ordi"), undefined);
  // Production .env files often contain surrounding whitespace; it must not
  // accidentally turn the explicit RAM setting into a persistent folder.
  assert.equal(resolvePgliteDataDir({ SILVIA_DATA_DIR: "  Memory://  " }, "/ordi"), undefined);
});

test("custom relative and absolute dirs", () => {
  assert.equal(resolvePgliteDataDir({ SILVIA_DATA_DIR: "data/pg" }, "/ordi"), join("/ordi", "data/pg"));
  assert.equal(resolvePgliteDataDir({ SILVIA_DATA_DIR: "/var/silvia" }, "/ordi"), "/var/silvia");
});
